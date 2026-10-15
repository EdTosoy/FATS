import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import {
  createDatabasePool,
  createServices,
} from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import { handleAuth } from '../../apps/web/src/server/handlers';
import { handleDocuments } from '../../apps/web/src/server/document-handlers';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import {
  FilesystemDocumentStorage,
  type DocumentStorage,
} from '../../apps/web/src/server/document-storage';
import { pdfFixture, docxFixture } from '../helpers/document-fixtures';
import { MAX_ACCOUNT_DOCUMENT_BYTES, MAX_DOCUMENT_BYTES } from '@fats/domain';
const url = process.env.FATS_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Use a dedicated local test database.');
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-document-passphrase-42!';
let services: ReturnType<typeof createServices>,
  root: string,
  storage: FilesystemDocumentStorage;
const owners: string[] = [],
  messages: { to: string; text: string }[] = [];
async function auth(path: string, body: unknown) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    services,
  );
}
async function user(verified = true) {
  const email = `documents-${randomUUID()}@example.test`;
  expect(
    (await auth('sign-up/email', { email, password, name: 'Document Test' }))
      .status,
  ).toBe(200);
  await expect.poll(() => messages.some((m) => m.to === email)).toBe(true);
  const id = (
    await services.pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id;
  owners.push(id);
  const code = messages
    .find((m) => m.to === email)!
    .text.match(/code is (\d{8})/)![1];
  expect((await auth('verify-email', { email, code })).status).toBe(200);
  const response = await auth('sign-in/email', { email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((x) => x.split(';')[0])
    .join('; ');
  if (!verified)
    await services.pool.query(
      'UPDATE "user" SET "emailVerified"=false WHERE id=$1',
      [id],
    );
  return {
    id,
    cookie,
    repo: new PostgresDocumentRepository(services.pool, id, storage),
    workspace: new PostgresWorkspaceRepository(services.pool, id),
  };
}
function request(
  cookie?: string,
  body?: Record<string, unknown>,
  params = '',
  extra: Record<string, string> = {},
) {
  return handleDocuments(
    new Request(origin + '/api/documents' + params, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    services,
    storage,
  );
}
function upload(
  cookie: string,
  bytes: Uint8Array,
  meta: Record<string, unknown> = {},
  extra: Record<string, string> = {},
  adapter: DocumentStorage = storage,
) {
  return handleDocuments(
    new Request(origin + '/api/documents', {
      method: 'PUT',
      headers: {
        origin,
        cookie,
        'content-type': 'application/octet-stream',
        'x-fats-upload': encodeURIComponent(
          JSON.stringify({
            requestId: randomUUID(),
            filename: 'resume.pdf',
            name: 'Developer resume',
            category: 'Resumes',
            ...meta,
          }),
        ),
        ...extra,
      },
      body: new Uint8Array(bytes),
    }),
    services,
    adapter,
  );
}
beforeAll(async () => {
  const pool = createDatabasePool(url);
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
  services = createServices(
    url,
    origin,
    randomUUID() + randomUUID(),
    async (m) => {
      messages.push(m);
    },
  );
  root = await mkdtemp('/tmp/fats-documents-integration-');
  storage = new FilesystemDocumentStorage(root);
});
beforeEach(async () => {
  await services.pool.query('DELETE FROM "rateLimit"');
});
afterAll(async () => {
  for (const id of owners) {
    await services.pool.query(
      'DELETE FROM application_document_versions WHERE user_id=$1',
      [id],
    );
    await services.pool.query(
      'DELETE FROM document_versions WHERE user_id=$1',
      [id],
    );
    await services.pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await services.pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await services.pool.end();
  await rm(root, { recursive: true, force: true });
});
it('authorizes live verified owners for upload, metadata, edit, linkage, download and preview; denies cross-account access', async () => {
  expect((await request()).status).toBe(401);
  const a = await user(),
    b = await user(),
    unverified = await user(false),
    bytes = await pdfFixture();
  expect((await request(unverified.cookie)).status).toBe(403);
  expect((await upload(unverified.cookie, bytes)).status).toBe(403);
  const response = await upload(a.cookie, bytes);
  expect(response.status).toBe(200);
  const saved = await response.json();
  expect(await (await request(b.cookie)).json()).toMatchObject({
    documents: [],
    associations: [],
  });
  const data = await (await request(a.cookie)).json();
  expect(JSON.stringify(data)).not.toContain('storage_key');
  expect(JSON.stringify(data)).not.toContain(root);
  const doc = data.documents[0];
  for (const action of [
    {
      action: 'edit',
      id: doc.id,
      name: 'Stolen',
      category: 'Resumes',
      archived: false,
      isDefault: false,
    },
    { action: 'delete', id: doc.id, confirmed: true },
  ])
    expect((await request(b.cookie, action)).status).toBe(404);
  expect((await upload(b.cookie, bytes, { documentId: doc.id })).status).toBe(
    404,
  );
  expect(
    (await request(b.cookie, undefined, '?version=' + saved.versionId)).status,
  ).toBe(404);
  expect(
    (await request(undefined, undefined, '?version=' + saved.versionId)).status,
  ).toBe(401);
  const download = await request(
    a.cookie,
    undefined,
    '?version=' + saved.versionId,
  );
  expect(download.status).toBe(200);
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  expect(download.headers.get('content-disposition')).toMatch(/^attachment/);
  expect(download.headers.get('cache-control')).toContain('no-store');
  expect(download.headers.get('x-content-type-options')).toBe('nosniff');
  expect(download.headers.get('content-security-policy')).toContain('sandbox');
  expect(
    (
      await request(
        a.cookie,
        undefined,
        '?version=' + saved.versionId + '&preview=1',
      )
    ).headers.get('content-disposition'),
  ).toMatch(/^inline/);
  expect(
    (await request(a.cookie, undefined, '?version=..%2fsecret')).status,
  ).toBe(404);
  expect((await upload(a.cookie, bytes, { owner: b.id })).status).toBe(400);
  expect(
    (await request(a.cookie, undefined, '', { 'x-fats-account': b.id })).status,
  ).toBe(409);
  expect(
    (await upload(a.cookie, bytes, {}, { origin: 'https://evil.test' })).status,
  ).toBe(403);
  expect(
    (await request(a.cookie, undefined, '', { host: 'evil.test' })).status,
  ).toBe(403);
  await services.pool.query(
    'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
    [a.id],
  );
  expect(
    (await request(a.cookie, undefined, '?version=' + saved.versionId)).status,
  ).toBe(401);
});
it('keeps versions and submitted associations immutable, serializes uploads, restricts referenced deletion and JSON replacement', async () => {
  const a = await user(),
    b = await user(),
    bytes = await pdfFixture('Version 1'),
    id = randomUUID();
  const first = await a.repo.upload(bytes, 'resume.pdf', {
    requestId: id,
    name: 'Software Developer',
    category: 'Resumes',
  });
  expect(
    await a.repo.upload(bytes, 'resume.pdf', {
      requestId: id,
      name: 'Software Developer',
      category: 'Resumes',
    }),
  ).toEqual(first);
  const app = await a.workspace.create({
    title: 'Graduate Developer',
    company: 'Example',
    sourceUrl: 'https://example.test/job',
    location: 'Remote',
    description: '',
  });
  const other = await b.workspace.create({ ...app });
  await expect(
    b.repo.associate(other.id, first.versionId),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    a.repo.associate(other.id, first.versionId),
  ).rejects.toMatchObject({ status: 404 });
  await a.repo.associate(app.id, first.versionId);
  const versions = await Promise.all([
    a.repo.upload(await pdfFixture('Version 2'), 'resume-v2.pdf', {
      requestId: randomUUID(),
      documentId: first.documentId,
    }),
    a.repo.upload(docxFixture(), 'resume-v3.docx', {
      requestId: randomUUID(),
      documentId: first.documentId,
    }),
  ]);
  const library = await a.repo.library();
  expect(library.documents[0].versions.map((v) => v.number)).toEqual([3, 2, 1]);
  expect(library.associations[0].versionId).toBe(first.versionId);
  expect(Buffer.from((await a.repo.download(first.versionId)).bytes)).toEqual(
    bytes,
  );
  await expect(
    services.pool.query(
      'UPDATE document_versions SET original_filename=$2 WHERE user_id=$1',
      [a.id, 'replacement.pdf'],
    ),
  ).rejects.toThrow('immutable');
  await expect(
    services.pool.query(
      'INSERT INTO application_document_versions(user_id,application_id,document_id,version_id) VALUES($1,$2,$3,$4)',
      [b.id, other.id, first.documentId, first.versionId],
    ),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(a.repo.delete(first.documentId)).rejects.toMatchObject({
    status: 409,
  });
  await expect(a.workspace.deleteApplication(app.id)).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    a.workspace.previewRestore(await a.workspace.exportBackup()),
  ).rejects.toThrow('JSON');
  await a.repo.edit(first.documentId, {
    name: 'Archived resume',
    category: 'Resumes',
    archived: true,
    isDefault: false,
  });
  expect((await a.repo.library()).associations[0].versionId).toBe(
    first.versionId,
  );
  expect((await a.repo.download(first.versionId)).bytes.length).toBe(
    bytes.length,
  );
  await expect(
    a.repo.associate(app.id, versions[0].versionId),
  ).rejects.toMatchObject({ status: 409 });
  await a.repo.edit(first.documentId, {
    name: 'Renamed resume',
    category: 'Resumes',
    archived: false,
    isDefault: true,
  });
  await a.repo.associate(app.id, versions[0].versionId);
  expect((await a.repo.library()).associations[0].versionId).toBe(
    versions[0].versionId,
  );
  await a.repo.associate(app.id, null);
  const keys = (
    await services.pool.query(
      'SELECT storage_key FROM document_versions WHERE user_id=$1',
      [a.id],
    )
  ).rows;
  await a.repo.delete(first.documentId);
  expect((await a.repo.library()).documents).toEqual([]);
  for (const { storage_key } of keys)
    await expect(
      readFile(root + '/' + storage_key + '.blob'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  await a.workspace.deleteApplication(app.id);
});
it('rejects malformed/oversize files, interrupted uploads and storage errors without publishing metadata; reports missing and corrupt file states', async () => {
  const a = await user(),
    bytes = await pdfFixture();
  for (const [content, filename] of [
    [Buffer.from('not a pdf'), 'bad.pdf'],
    [docxFixture({ 'word/document.xml': '<bad>' }), 'bad.docx'],
    [bytes, 'bad.exe'],
  ] as const)
    expect((await upload(a.cookie, content, { filename })).status).toBe(400);
  expect(
    (
      await upload(
        a.cookie,
        bytes,
        {},
        { 'content-length': String(MAX_DOCUMENT_BYTES + 1) },
      )
    ).status,
  ).toBe(413);
  expect(
    (await upload(a.cookie, Buffer.alloc(MAX_DOCUMENT_BYTES + 1))).status,
  ).toBe(413);
  const failing: DocumentStorage = {
    ...storage,
    put: async () => {
      throw new Error('PRIVATE failure detail');
    },
    read: storage.read.bind(storage),
    remove: storage.remove.bind(storage),
  };
  const failed = await upload(a.cookie, bytes, {}, {}, failing);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('PRIVATE');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 20));
      controller.error(new Error('interrupted'));
    },
  });
  const interrupted = new Request(origin + '/api/documents', {
    method: 'PUT',
    headers: {
      origin,
      cookie: a.cookie,
      'content-type': 'application/octet-stream',
      'x-fats-upload': encodeURIComponent(
        JSON.stringify({
          filename: 'resume.pdf',
          requestId: randomUUID(),
          name: 'Resume',
          category: 'Resumes',
        }),
      ),
    },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  expect((await handleDocuments(interrupted, services, storage)).status).toBe(
    400,
  );
  expect((await a.repo.library()).documents).toEqual([]);
  const docx = await upload(a.cookie, docxFixture(), {
    filename: 'letter.docx',
    name: 'Letter',
    category: 'Cover letters',
  });
  expect(docx.status).toBe(200);
  expect(
    (
      await request(
        a.cookie,
        undefined,
        '?version=' + (await docx.json()).versionId + '&preview=1',
      )
    ).status,
  ).toBe(415);
  const saved = await a.repo.upload(bytes, 'resume.pdf', {
    requestId: randomUUID(),
    name: 'Resume',
    category: 'Resumes',
  });
  const row = (
    await services.pool.query(
      'SELECT * FROM document_versions WHERE user_id=$1 AND id=$2',
      [a.id, saved.versionId],
    )
  ).rows[0];
  const path = root + '/' + row.storage_key + '.blob';
  await writeFile(path, Buffer.alloc(bytes.length));
  expect(
    (await a.repo.library()).documents.find((d) => d.id === saved.documentId)!
      .versions[0].health,
  ).toBe('corrupt');
  expect(
    (await request(a.cookie, undefined, '?version=' + saved.versionId)).status,
  ).toBe(409);
  await rm(path);
  expect(
    (await a.repo.library()).documents.find((d) => d.id === saved.documentId)!
      .versions[0].health,
  ).toBe('missing');
  await storage.put(row.storage_key, bytes);
  expect(
    (await a.repo.library()).documents.find((d) => d.id === saved.documentId)!
      .versions[0].health,
  ).toBe('available');
});
it('enforces account quota and per-document version limits transactionally and retries failed physical deletion', async () => {
  const a = await user(),
    bytes = await pdfFixture();
  const saved = await a.repo.upload(bytes, 'resume.pdf', {
    requestId: randomUUID(),
    name: 'Resume',
    category: 'Resumes',
  });
  // Dedicated owner/test metadata fills the quota without writing 100 MiB of fixtures.
  for (let i = 2; i <= 11; i++)
    await services.pool.query(
      'INSERT INTO document_versions(user_id,document_id,id,version_number,original_filename,format,byte_size,sha256,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        a.id,
        saved.documentId,
        randomUUID(),
        i,
        'quota.pdf',
        'pdf',
        MAX_ACCOUNT_DOCUMENT_BYTES / 10,
        'a'.repeat(64),
        randomUUID(),
      ],
    );
  await expect(
    a.repo.upload(bytes, 'next.pdf', {
      requestId: randomUUID(),
      documentId: saved.documentId,
    }),
  ).rejects.toMatchObject({ status: 413 });
  await services.pool.query(
    'DELETE FROM document_versions WHERE user_id=$1 AND version_number>1',
    [a.id],
  );
  for (let i = 2; i <= 20; i++)
    await services.pool.query(
      'INSERT INTO document_versions(user_id,document_id,id,version_number,original_filename,format,byte_size,sha256,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        a.id,
        saved.documentId,
        randomUUID(),
        i,
        'limit.pdf',
        'pdf',
        1,
        'a'.repeat(64),
        randomUUID(),
      ],
    );
  await expect(
    a.repo.upload(bytes, 'next.pdf', {
      requestId: randomUUID(),
      documentId: saved.documentId,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await services.pool.query(
    'DELETE FROM document_versions WHERE user_id=$1 AND version_number>1',
    [a.id],
  );
  const adapter: DocumentStorage = {
    put: storage.put.bind(storage),
    read: storage.read.bind(storage),
    remove: async () => {
      throw Error('disk offline');
    },
  };
  await new PostgresDocumentRepository(services.pool, a.id, adapter).delete(
    saved.documentId,
  );
  expect(
    (
      await services.pool.query(
        'SELECT count(*)::int AS count FROM document_garbage',
      )
    ).rows[0].count,
  ).toBeGreaterThan(0);
  await a.repo.cleanup();
  expect(
    (
      await services.pool.query(
        'SELECT count(*)::int AS count FROM document_garbage',
      )
    ).rows[0].count,
  ).toBe(0);
});

it('runs the native Node read-only operator audit against actual bytes without leaking metadata or changing files', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const partial = root + '/' + randomUUID() + '.partial',
    orphan = root + '/' + randomUUID() + '.blob';
  await writeFile(partial, 'interrupted', { mode: 0o600 });
  await writeFile(orphan, 'unreferenced', { mode: 0o600 });
  const before = await storage.inventory();
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    ['apps/web/scripts/check-documents.mjs'],
    { env: { ...process.env, DATABASE_URL: url, FATS_DOCUMENTS_DIR: root } },
  );
  const result = JSON.parse(stdout);
  expect(result.available).toBeGreaterThan(0);
  expect(result.partial).toBe(1);
  expect(result.unreferenced).toBeGreaterThan(0);
  expect(stderr).toBe('');
  expect(stdout).not.toContain(root);
  expect(stdout).not.toContain('filename');
  expect(await storage.inventory()).toEqual(before);
});

it('keeps a failed database publication invisible, retains safe orphan bytes, and permits an upload retry', async () => {
  const a = await user(),
    bytes = await pdfFixture(),
    requestId = randomUUID();
  const suffix = randomUUID().replaceAll('-', ''),
    functionName = 'document_failure_' + suffix;
  const before = new Set(await storage.inventory());
  await services.pool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${a.id}'::uuid THEN RAISE EXCEPTION 'Synthetic document publication failure'; END IF; RETURN NEW; END; $$`,
  );
  await services.pool.query(
    `CREATE TRIGGER ${functionName} BEFORE INSERT ON document_versions FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
  );
  try {
    await expect(
      a.repo.upload(bytes, 'resume.pdf', {
        requestId,
        name: 'Retry resume',
        category: 'Resumes',
      }),
    ).rejects.toMatchObject({ code: 'P0001' });
    expect((await a.repo.library()).documents).toEqual([]);
    const retained = (await storage.inventory()).filter(
      (name) => !before.has(name),
    );
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatch(/\.blob$/);
  } finally {
    await services.pool.query(
      `DROP TRIGGER ${functionName} ON document_versions`,
    );
    await services.pool.query(`DROP FUNCTION ${functionName}()`);
  }
  const saved = await a.repo.upload(bytes, 'resume.pdf', {
    requestId,
    name: 'Retry resume',
    category: 'Resumes',
  });
  expect((await a.repo.library()).documents).toHaveLength(1);
  expect(Buffer.from((await a.repo.download(saved.versionId)).bytes)).toEqual(
    bytes,
  );
});
