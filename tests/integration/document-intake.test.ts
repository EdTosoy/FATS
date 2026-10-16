import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, link, writeFile } from 'node:fs/promises';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import {
  FilesystemDocumentStorage,
  type DocumentStorage,
} from '../../apps/web/src/server/document-storage';
import {
  type DocumentScanner,
  ClamavDocumentScanner,
} from '../../apps/web/src/server/document-scanner';
import { WorkspaceError } from '../../apps/web/src/server/workspace-error';
import {
  beginAccountErasure,
  receiptHash,
} from '../../apps/web/src/server/account-lifecycle';
import {
  recoverAccountErasure,
  recoverDataLifecycle,
} from '../../apps/web/src/server/account-erasure';
import { recheckDocuments } from '../../apps/web/src/server/document-recheck';
import { syntheticScanner } from '../helpers/document-scanner';
import { pdfFixture, docxFixture } from '../helpers/document-fixtures';
const url = process.env.FATS_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw Error('Use dedicated local test database.');
const pool = createDatabasePool(url),
  owners: string[] = [],
  receipts: string[] = [];
let root: string, storage: FilesystemDocumentStorage;
const input = () => ({
  requestId: randomUUID(),
  name: 'Synthetic intake',
  category: 'Resumes',
});
async function owner() {
  const id = randomUUID();
  owners.push(id);
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [id, 'Synthetic intake', id + '@example.test'],
  );
  return id;
}
const repo = (
  id: string,
  scanner: DocumentScanner = syntheticScanner,
  adapter: DocumentStorage = storage,
) => new PostgresDocumentRepository(pool, id, adapter, scanner);
const receipt = () => {
  const r = randomBytes(32).toString('hex');
  receipts.push(r);
  return r;
};
beforeAll(async () => {
  await runMigrations(pool);
  root = await mkdtemp('/tmp/fats-intake-pg-');
  storage = new FilesystemDocumentStorage(root);
});
afterAll(async () => {
  for (const id of owners)
    if ((await pool.query('SELECT 1 FROM "user" WHERE id=$1', [id])).rowCount)
      await beginAccountErasure(pool, id, receipt()).catch(() => {});
  await recoverDataLifecycle(pool, storage);
  for (const r of receipts)
    await pool.query('DELETE FROM account_erasures WHERE receipt_hash=$1', [
      receiptHash(r),
    ]);
  await pool.end();
  await rm(root, { recursive: true, force: true });
});
it('keeps pending scans private and unusable, preserves active intents during cleanup, then accepts exact immutable bytes once', async () => {
  const a = await owner(),
    b = await owner(),
    bytes = await pdfFixture(),
    meta = input();
  let entered!: () => void,
    finish!: () => void,
    calls = 0;
  const started = new Promise<void>((r) => (entered = r)),
    wait = new Promise<void>((r) => (finish = r));
  const scanner: DocumentScanner = {
    async scan(data) {
      calls++;
      entered();
      await wait;
      return syntheticScanner.scan(data);
    },
  };
  const uploading = repo(a, scanner).upload(bytes, 'resume.pdf', meta);
  try {
    await started;
    const row = (
      await pool.query('SELECT * FROM document_objects WHERE user_id=$1', [a])
    ).rows[0];
    expect(row.intake_state).toBe('quarantined');
    expect(await storage.readQuarantine(row.storage_key, bytes.length)).toEqual(
      bytes,
    );
    await expect(
      storage.read(row.storage_key, bytes.length),
    ).rejects.toMatchObject({ health: 'missing' });
    expect((await repo(a).library()).documents).toEqual([]);
    for (const id of [a, b])
      await expect(repo(id).download(meta.requestId)).rejects.toMatchObject({
        status: 404,
      });
    await expect(
      repo(a).upload(bytes, 'resume.pdf', input()),
    ).rejects.toMatchObject({ status: 429 });
    await recoverDataLifecycle(pool, storage);
    expect(await storage.readQuarantine(row.storage_key, bytes.length)).toEqual(
      bytes,
    );
  } finally {
    finish();
  }
  const saved = await uploading;
  expect(await repo(a, scanner).upload(bytes, 'resume.pdf', meta)).toEqual(
    saved,
  );
  expect(calls).toBe(1);
  expect((await repo(a).library()).documents[0].versions[0].health).toBe(
    'available',
  );
  expect((await repo(a).download(saved.versionId)).bytes).toEqual(bytes);
  await expect(repo(b).download(saved.versionId)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (await storage.inventory()).filter((x) => x.startsWith('quarantine/')),
  ).toEqual([]);
});
it('fails closed on unavailable/error/timeout/detection, rejects malformed documents, and never publishes failed versions', async () => {
  const a = await owner(),
    bytes = await pdfFixture(),
    before = await storage.inventory();
  const scanners: DocumentScanner[] = [
    {
      async scan() {
        throw new WorkspaceError('Synthetic scanner unavailable', 503);
      },
    },
    {
      async scan() {
        throw Error('PRIVATE scanner timeout');
      },
    },
    {
      async scan() {
        throw new WorkspaceError('Synthetic detection', 400);
      },
    },
  ];
  for (const scanner of scanners)
    await expect(
      repo(a, scanner).upload(bytes, 'resume.pdf', input()),
    ).rejects.toMatchObject({ status: expect.any(Number) });
  for (const [data, name] of [
    [Buffer.from('malformed'), 'bad.pdf'],
    [docxFixture({ 'word/document.xml': '<bad>' }), 'bad.docx'],
  ] as const)
    await expect(repo(a).upload(data, name, input())).rejects.toThrow(
      'malformed',
    );
  expect((await repo(a).library()).documents).toEqual([]);
  expect(
    (await pool.query('SELECT 1 FROM document_objects WHERE user_id=$1', [a]))
      .rowCount,
  ).toBe(0);
  expect(await storage.inventory()).toEqual(before);
});
it('reconciles an interrupted promotion with both private copies and durable cleanup failure, without publishing metadata', async () => {
  const a = await owner(),
    bytes = await pdfFixture();
  const broken: DocumentStorage = {
    put: storage.put.bind(storage),
    read: storage.read.bind(storage),
    quarantine: storage.quarantine.bind(storage),
    readQuarantine: storage.readQuarantine.bind(storage),
    async promote(key) {
      await link(
        root + '/quarantine/' + key + '.blob',
        root + '/' + key + '.blob',
      );
      throw Error('PRIVATE interrupted promotion');
    },
    async remove() {
      throw Error('synthetic unavailable disk');
    },
  };
  await expect(
    repo(a, syntheticScanner, broken).upload(bytes, 'resume.pdf', input()),
  ).rejects.toMatchObject({ status: 503 });
  const row = (
    await pool.query('SELECT * FROM document_objects WHERE user_id=$1', [a])
  ).rows[0];
  expect(row.intake_state).toBe('quarantined');
  expect(await storage.read(row.storage_key, bytes.length)).toEqual(bytes);
  expect(await storage.readQuarantine(row.storage_key, bytes.length)).toEqual(
    bytes,
  );
  expect((await repo(a).library()).documents).toEqual([]);
  const result = await promisify(execFile)(
    process.execPath,
    ['apps/web/scripts/cleanup-data.mjs'],
    { env: { ...process.env, DATABASE_URL: url, FATS_DOCUMENTS_DIR: root } },
  );
  expect(JSON.parse(result.stdout)).toEqual({
    pendingAccounts: 0,
    pendingFiles: 0,
  });
  expect(result.stderr).toBe('');
  expect(result.stdout).not.toContain(root);
  for (const location of ['', 'quarantine/'])
    expect(await storage.inventory()).not.toContain(
      location + row.storage_key + '.blob',
    );
  expect(
    (await pool.query('SELECT 1 FROM document_objects WHERE user_id=$1', [a]))
      .rowCount,
  ).toBe(0);
  const saved = await repo(a).upload(bytes, 'resume.pdf', input());
  expect((await repo(a).download(saved.versionId)).bytes).toEqual(bytes);
});
it('cleans quarantine partial writes through the same durable recovery journal', async () => {
  const a = await owner(),
    bytes = await pdfFixture();
  const broken: DocumentStorage = {
    put: storage.put.bind(storage),
    read: storage.read.bind(storage),
    readQuarantine: storage.readQuarantine.bind(storage),
    promote: storage.promote.bind(storage),
    async quarantine(key, data) {
      await storage.quarantine(key, data);
      await writeFile(root + '/quarantine/' + key + '.partial', 'partial', {
        mode: 0o600,
      });
      throw Error('partial write');
    },
    async remove() {
      throw Error('offline');
    },
  };
  await expect(
    repo(a, syntheticScanner, broken).upload(bytes, 'resume.pdf', input()),
  ).rejects.toMatchObject({ status: 503 });
  expect(
    (await storage.inventory()).some(
      (x) => x.startsWith('quarantine/') && x.endsWith('.partial'),
    ),
  ).toBe(true);
  await recoverDataLifecycle(pool, storage);
  expect(
    (await storage.inventory()).filter((x) => x.startsWith('quarantine/')),
  ).toEqual([]);
});
it('revokes account access immediately and aborts scanning before erasing quarantine and owner records', async () => {
  const a = await owner(),
    b = await owner(),
    bytes = await pdfFixture(),
    r = receipt(),
    meta = input();
  const other = await repo(b).upload(bytes, 'other.pdf', input());
  let entered!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  let aborted = false;
  const scanner: DocumentScanner = {
    scan(_bytes, signal) {
      entered();
      return new Promise((_, reject) => {
        signal!.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('cancelled'));
          },
          { once: true },
        );
      });
    },
  };
  const uploading = repo(a, scanner).upload(bytes, 'resume.pdf', meta);
  const result = expect(uploading).rejects.toMatchObject({ status: 503 });
  await started;
  await beginAccountErasure(pool, a, r);
  await expect(repo(a).library()).rejects.toMatchObject({ status: 401 });
  expect(await recoverAccountErasure(pool, r, storage)).toBe('pending');
  await result;
  expect(aborted).toBe(true);
  expect(await recoverAccountErasure(pool, r, storage)).toBe('complete');
  expect(await recoverAccountErasure(pool, r, storage)).toBe('complete');
  expect(
    (await pool.query('SELECT 1 FROM document_objects WHERE user_id=$1', [a]))
      .rowCount,
  ).toBe(0);
  expect(
    (await storage.inventory()).filter((x) => x.startsWith('quarantine/')),
  ).toEqual([]);
  expect((await repo(b).download(other.versionId)).bytes).toEqual(bytes);
});
it('blocks legacy versions until explicit scanner and parser rechecking succeeds without changing version history', async () => {
  const a = await owner(),
    bytes = docxFixture(),
    saved = await repo(a).upload(bytes, 'resume.docx', input());
  const before = (
    await pool.query('SELECT * FROM document_versions WHERE user_id=$1', [a])
  ).rows;
  await pool.query(
    "UPDATE document_objects SET intake_state='legacy',accepted_sha256=NULL,scan_engine=NULL,signature_revision=NULL,signature_at=NULL,scanned_at=NULL WHERE user_id=$1",
    [a],
  );
  expect((await repo(a).library()).documents[0].versions[0].health).toBe(
    'unverified',
  );
  await expect(repo(a).download(saved.versionId)).rejects.toMatchObject({
    status: 409,
  });
  const denied: DocumentScanner = {
    async scan() {
      throw Error('scanner offline');
    },
  };
  const native = await promisify(execFile)(
    process.execPath,
    ['apps/web/scripts/recheck-documents.mjs'],
    {
      env: {
        ...process.env,
        DATABASE_URL: url,
        FATS_DOCUMENTS_DIR: root,
        FATS_CLAMAV_DATABASE_DIR: '',
      },
    },
  ).catch((error) => error);
  expect(native.code).toBe(1);
  expect(JSON.parse(native.stdout)).toMatchObject({
    accepted: 0,
    pending: expect.any(Number),
  });
  expect(native.stdout).not.toContain('resume.docx');
  expect(native.stdout).not.toContain(root);
  expect(
    (await recheckDocuments(pool, storage, denied)).pending,
  ).toBeGreaterThan(0);
  await expect(repo(a).download(saved.versionId)).rejects.toMatchObject({
    status: 409,
  });
  expect(
    (await recheckDocuments(pool, storage, syntheticScanner)).accepted,
  ).toBeGreaterThan(0);
  expect(
    (await pool.query('SELECT * FROM document_versions WHERE user_id=$1', [a]))
      .rows,
  ).toEqual(before);
  expect((await repo(a).download(saved.versionId)).bytes).toEqual(bytes);
});
it('the default scanner rejects missing configuration without a test or environment clean-scan bypass', async () => {
  const scanner = new ClamavDocumentScanner(),
    previous = process.env.FATS_CLAMAV_DATABASE_DIR;
  try {
    delete process.env.FATS_CLAMAV_DATABASE_DIR;
    await expect(scanner.scan(await pdfFixture())).rejects.toMatchObject({
      status: 503,
    });
  } finally {
    if (previous !== undefined) process.env.FATS_CLAMAV_DATABASE_DIR = previous;
  }
});
