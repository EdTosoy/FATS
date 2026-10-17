import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import {
  emptyEmployment,
  emptyEmploymentDocument,
  employmentDocuments,
  createBackup,
  createCareerBackup,
  parseBackup,
  serializeBackup,
  portableEventCommand,
  type EmploymentInput,
} from '@fats/domain';
import { createServices } from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import { PostgresCareerRepository } from '../../apps/web/src/server/career-repository';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import { PostgresOfferRepository } from '../../apps/web/src/server/offer-repository';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
import { handleCareer } from '../../apps/web/src/server/career-handlers';
import { handleAuth } from '../../apps/web/src/server/handlers';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
import { syntheticScanner } from '../helpers/document-scanner';
import { pdfFixture } from '../helpers/document-fixtures';
import { careerFixture } from '../helpers/career-fixture';
const url = process.env.FATS_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw Error('Use a dedicated local test database.');
const origin = 'http://127.0.0.1:3000',
  owners: string[] = [],
  messages: { to: string; text: string }[] = [];
let services: ReturnType<typeof createServices>,
  root: string,
  storage: FilesystemDocumentStorage;
beforeAll(async () => {
  services = createServices(
    url!,
    origin,
    randomUUID() + randomUUID(),
    async (message) => {
      messages.push(message);
    },
  );
  await runMigrations(services.pool);
  root = await mkdtemp('/tmp/fats-career-');
  storage = new FilesystemDocumentStorage(root);
});
afterAll(async () => {
  for (const id of owners) {
    const receipt = randomBytes(32).toString('hex');
    await beginAccountErasure(services.pool, id, receipt);
    expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
      'complete',
    );
  }
  await services.pool.end();
  if (root) await rm(root, { recursive: true, force: true });
});
async function owner() {
  const id = randomUUID();
  owners.push(id);
  await services.pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [id, 'Synthetic Career Graduate', id + '@example.test'],
  );
  return {
    id,
    career: new PostgresCareerRepository(services.pool, id, storage),
    workspace: new PostgresWorkspaceRepository(services.pool, id),
    documents: new PostgresDocumentRepository(
      services.pool,
      id,
      storage,
      syntheticScanner,
    ),
  };
}
const job = (extra: Partial<EmploymentInput> = {}) => ({
  ...emptyEmployment(),
  employer: 'Synthetic Career Employer',
  title: 'Assistant',
  ...extra,
});
const saveJob = (value: ReturnType<typeof job>) => ({
  kind: 'employment',
  documentId: null,
  details: value,
});
const saveDocument = (id: string, value = emptyEmploymentDocument()) => ({
  kind: 'document',
  documentId: id,
  details: value,
});
async function application(a: Awaited<ReturnType<typeof owner>>) {
  return a.workspace.create({
    title: 'Graduate Assistant',
    company: 'Synthetic Employer',
    sourceUrl: 'https://example.test/career',
    location: 'Makati',
    description: '',
  });
}
it('creates planned/current/previous employment, retains history and enforces stale/idempotent writes', async () => {
  const a = await owner(),
    id = randomUUID(),
    request = randomUUID(),
    input = job();
  await a.career.command(id, request, 0, saveJob(input));
  const original = (await a.career.list())[0];
  await a.career.command(id, request, 0, saveJob(input));
  expect(await a.career.list()).toEqual([original]);
  await expect(
    a.career.command(id, request, 0, saveJob(job({ title: 'Changed' }))),
  ).rejects.toMatchObject({ status: 409 });
  await a.career.command(
    id,
    randomUUID(),
    1,
    saveJob(job({ status: 'Current', startOn: '2025-01-01' })),
  );
  await expect(
    a.career.command(
      id,
      randomUUID(),
      1,
      saveJob(
        job({ status: 'Previous', startOn: '2025-01-01', endOn: '2026-01-01' }),
      ),
    ),
  ).rejects.toMatchObject({ status: 409 });
  await a.career.command(
    id,
    randomUUID(),
    2,
    saveJob(
      job({
        status: 'Previous',
        startOn: '2025-01-01',
        endOn: '2026-01-01',
        notes: 'Synthetic complete employment',
        archived: true,
      }),
    ),
  );
  const record = (await a.career.list())[0];
  expect(record.details.status).toBe('Previous');
  expect(record.events).toHaveLength(3);
  expect(record.createdAt).toBe(original.createdAt);
  await expect(
    services.pool.query(
      'UPDATE career_events SET details=details WHERE user_id=$1',
      [a.id],
    ),
  ).rejects.toThrow('immutable');
});
it('tracks all document states without any file or scanning dependency and retains request history', async () => {
  const a = await owner(),
    id = randomUUID(),
    doc = randomUUID();
  await a.career.command(id, randomUUID(), 0, saveJob(job()));
  for (const [index, status] of (
    ['Not requested', 'Requested', 'Received', 'Not applicable'] as const
  ).entries())
    await a.career.command(
      id,
      randomUUID(),
      index + 1,
      saveDocument(doc, {
        ...emptyEmploymentDocument(),
        category: 'BIR Form 2316',
        status,
        taxYear: '2025',
        issuedOn: '2026-01-31',
        requestedOn: '2026-01-01',
        followUpOn: '2026-02-01',
        notes: 'Synthetic metadata; no file',
      }),
    );
  const entry = employmentDocuments((await a.career.list())[0])[0];
  expect(entry.details).toMatchObject({
    status: 'Not applicable',
    taxYear: '2025',
    documentVersionId: '',
  });
  expect(
    entry.history.map(
      (event) => event.kind === 'document' && event.details.status,
    ),
  ).toEqual(['Not requested', 'Requested', 'Received', 'Not applicable']);
  expect((await a.documents.library()).documents).toEqual([]);
});
it('links own applications and accepted offers, blocks duplicate associations and protects historical parents', async () => {
  const a = await owner(),
    b = await owner(),
    app = await application(a),
    id = randomUUID();
  await expect(
    a.career.command(
      id,
      randomUUID(),
      0,
      saveJob(job({ applicationId: app.id, fromAcceptedOffer: true })),
    ),
  ).rejects.toMatchObject({ status: 409 });
  const fixture = careerFixture().data.offers[0],
    offers = new PostgresOfferRepository(services.pool, a.id);
  for (const event of fixture.events) {
    const command = portableEventCommand(event);
    if (command.kind === 'terms') command.terms.documentVersionId = '';
    await offers.command(app.id, randomUUID(), event.sequence - 1, command);
  }
  await a.career.command(
    id,
    randomUUID(),
    0,
    saveJob(job({ applicationId: app.id, fromAcceptedOffer: true })),
  );
  expect((await a.career.list())[0].details.status).toBe('Not started');
  await expect(
    a.career.command(
      randomUUID(),
      randomUUID(),
      0,
      saveJob(job({ employer: 'Different', applicationId: app.id })),
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    b.career.command(
      randomUUID(),
      randomUUID(),
      0,
      saveJob(job({ applicationId: app.id })),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    b.career.command(id, randomUUID(), 1, saveJob(job())),
  ).rejects.toMatchObject({ status: 409 });
  expect(await b.career.list()).toEqual([]);
  await a.career.command(id, randomUUID(), 1, saveJob(job()));
  await expect(a.workspace.deleteApplication(app.id)).rejects.toThrow(
    'Career Vault',
  );
  await expect(
    a.career.command(randomUUID(), randomUUID(), 0, saveJob(job())),
  ).rejects.toThrow('already recorded');
});
it('links exact accepted private versions, refuses cross-user/legacy/quarantine files and protects earlier versions', async () => {
  const a = await owner(),
    b = await owner(),
    id = randomUUID(),
    doc = randomUUID(),
    bytes = await pdfFixture('Synthetic employment contract');
  await a.career.command(id, randomUUID(), 0, saveJob(job()));
  const upload = await a.documents.upload(bytes, 'contract.pdf', {
    requestId: randomUUID(),
    name: 'Synthetic contract',
    category: 'Other application documents',
  });
  await a.career.command(
    id,
    randomUUID(),
    1,
    saveDocument(doc, {
      ...emptyEmploymentDocument(),
      status: 'Received',
      documentVersionId: upload.versionId,
    }),
  );
  expect(await a.documents.download(upload.versionId)).toMatchObject({ bytes });
  const same = await a.workspace.previewRestore(
    await a.workspace.exportBackup(),
  );
  expect(same.portable?.career).toMatchObject({ added: 0, identical: 1 });
  expect(same.portable?.conflicts).toEqual([]);
  await a.workspace.restoreBackup(same.token);
  expect(
    employmentDocuments((await a.career.list())[0])[0].details
      .documentVersionId,
  ).toBe(upload.versionId);
  const bid = randomUUID();
  await b.career.command(bid, randomUUID(), 0, saveJob(job()));
  await expect(
    b.career.command(
      bid,
      randomUUID(),
      1,
      saveDocument(randomUUID(), {
        ...emptyEmploymentDocument(),
        documentVersionId: upload.versionId,
      }),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(a.documents.delete(upload.documentId)).rejects.toThrow(
    'Career Vault',
  );
  for (const state of ['legacy', 'quarantined']) {
    await services.pool.query(
      'UPDATE document_objects SET intake_state=$2,accepted_sha256=NULL WHERE user_id=$1',
      [a.id, state],
    );
    await expect(
      a.career.command(
        id,
        randomUUID(),
        2,
        saveDocument(doc, {
          ...emptyEmploymentDocument(),
          documentVersionId: upload.versionId,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(a.documents.download(upload.versionId)).rejects.toMatchObject({
      status: 409,
    });
  }
  await a.career.command(
    id,
    randomUUID(),
    2,
    saveDocument(doc, {
      ...emptyEmploymentDocument(),
      status: 'Received',
      notes: 'Keep paper metadata while file is blocked',
    }),
  );
  expect(
    employmentDocuments((await a.career.list())[0])[0].details
      .documentVersionId,
  ).toBe('');
  await expect(a.documents.delete(upload.documentId)).rejects.toThrow(
    'Career Vault',
  );
  const backup = parseBackup(await a.workspace.exportBackup());
  expect(backup.version).toBe(3);
  if (backup.version !== 3) throw Error();
  expect(backup.data.employments[0].events[1]).toMatchObject({
    details: { documentVersionId: '' },
    documentReference: upload.versionId,
  });
});
it('rejects a corrupt accepted file without publishing a new register entry or erasing metadata', async () => {
  const a = await owner(),
    id = randomUUID();
  await a.career.command(id, randomUUID(), 0, saveJob(job()));
  const upload = await a.documents.upload(await pdfFixture(), 'file.pdf', {
    requestId: randomUUID(),
    name: 'Synthetic file',
    category: 'Other application documents',
  });
  const key = (
    await services.pool.query(
      'SELECT storage_key FROM document_versions WHERE user_id=$1 AND id=$2',
      [a.id, upload.versionId],
    )
  ).rows[0].storage_key;
  await writeFile(root + '/' + key + '.blob', 'changed synthetic file', {
    mode: 0o600,
  });
  await expect(
    a.career.command(
      id,
      randomUUID(),
      1,
      saveDocument(randomUUID(), {
        ...emptyEmploymentDocument(),
        documentVersionId: upload.versionId,
      }),
    ),
  ).rejects.toThrow('missing, damaged');
  expect((await a.career.list())[0].events).toHaveLength(1);
});
it('imports version 3 atomically, preserves unlinked references and skips duplicates without overwriting history', async () => {
  const a = await owner(),
    text = serializeBackup(careerFixture()),
    preview = await a.workspace.previewRestore(text);
  expect(preview.portable?.career).toMatchObject({
    added: 1,
    documents: 1,
    unavailableDocuments: 1,
  });
  expect(await a.career.list()).toEqual([]);
  await a.workspace.restoreBackup(preview.token);
  await a.workspace.restoreBackup(preview.token);
  expect(await a.career.list()).toEqual(careerFixture().data.employments);
  expect((await a.documents.library()).documents).toEqual([]);
  const repeat = await a.workspace.previewRestore(text);
  expect(repeat.portable?.career).toMatchObject({ added: 0, identical: 1 });
  await a.workspace.restoreBackup(repeat.token);
  expect(parseBackup(await a.workspace.exportBackup()).data).toEqual(
    careerFixture().data,
  );
});
it('rejects stale previews after Career Vault writes, blocks conflicting imports and preserves legacy history', async () => {
  const a = await owner(),
    fixture = careerFixture(),
    preview = await a.workspace.previewRestore(serializeBackup(fixture));
  await a.career.command(
    randomUUID(),
    randomUUID(),
    0,
    saveJob(job({ employer: 'Unrelated saved job' })),
  );
  await expect(a.workspace.restoreBackup(preview.token)).rejects.toThrow(
    'changed since preview',
  );
  expect((await a.workspace.getWorkspace()).applications).toEqual([]);
  const fresh = await a.workspace.previewRestore(serializeBackup(fixture));
  await a.workspace.restoreBackup(fresh.token);
  const restored = (await a.career.list()).find(
    (row) => row.id === fixture.data.employments[0].id,
  )!;
  await a.career.command(
    restored.id,
    randomUUID(),
    restored.version,
    saveDocument(randomUUID(), {
      ...emptyEmploymentDocument(),
      category: 'Clearance documentation',
      status: 'Requested',
    }),
  );
  const conflict = await a.workspace.previewRestore(serializeBackup(fixture));
  expect(conflict.portable?.conflicts.length).toBeGreaterThan(0);
  const before = await a.career.list();
  await expect(a.workspace.restoreBackup(conflict.token)).rejects.toMatchObject(
    { status: 409 },
  );
  expect(await a.career.list()).toEqual(before);
  await expect(
    a.workspace.previewRestore(
      serializeBackup(
        createBackup(
          { applications: [], interviews: [] },
          new Date().toISOString(),
        ),
      ),
    ),
  ).rejects.toThrow('Career Vault');
  const legacy = await a.workspace.previewRestore(
    serializeBackup({
      format: 'fats-backup',
      version: 2,
      exportedAt: fixture.exportedAt,
      data: {
        applications: fixture.data.applications,
        interviews: fixture.data.interviews,
        offers: fixture.data.offers,
      },
    }),
  );
  await a.workspace.restoreBackup(legacy.token);
  expect(await a.career.list()).toEqual(before);
});
it('never links an imported reference even when the destination owns an accepted version with that exact ID', async () => {
  const a = await owner(),
    upload = await a.documents.upload(await pdfFixture(), 'same.pdf', {
      requestId: randomUUID(),
      name: 'Synthetic matching ID',
      category: 'Other application documents',
    });
  const fixture = careerFixture();
  fixture.data.employments[0].events[2].documentReference = upload.versionId;
  const preview = await a.workspace.previewRestore(
    serializeBackup(createCareerBackup(fixture.data, fixture.exportedAt)),
  );
  await a.workspace.restoreBackup(preview.token);
  const entry = employmentDocuments((await a.career.list())[0])[0];
  expect(entry.details.documentVersionId).toBe('');
  expect(entry.documentReference).toBe(upload.versionId);
  expect(
    (
      await services.pool.query(
        'SELECT version_id FROM career_events WHERE user_id=$1 AND kind=$2',
        [a.id, 'document'],
      )
    ).rows.every((row) => row.version_id === null),
  ).toBe(true);
});
it('erases employment and register history with a live account block while respecting private file cleanup', async () => {
  const a = await owner(),
    id = randomUUID();
  await a.career.command(id, randomUUID(), 0, saveJob(job()));
  const upload = await a.documents.upload(
    await pdfFixture('Synthetic erasure contract'),
    'erasure.pdf',
    {
      requestId: randomUUID(),
      name: 'Synthetic erasure contract',
      category: 'Other application documents',
    },
  );
  await a.career.command(
    id,
    randomUUID(),
    1,
    saveDocument(randomUUID(), {
      ...emptyEmploymentDocument(),
      documentVersionId: upload.versionId,
    }),
  );
  const receipt = randomBytes(32).toString('hex');
  await beginAccountErasure(services.pool, a.id, receipt);
  await expect(a.career.list()).rejects.toThrow();
  await expect(
    a.career.command(id, randomUUID(), 2, saveJob(job())),
  ).rejects.toThrow();
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
  owners.splice(owners.indexOf(a.id), 1);
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM document_versions WHERE user_id=$1',
        [a.id],
      )
    ).rowCount,
  ).toBe(0);
  for (const table of ['career_events', 'career_employments'])
    expect(
      (
        await services.pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [
          a.id,
        ])
      ).rowCount,
    ).toBe(0);
});
it('uses a live verified session, rejects ownership/origin tricks, and keeps API errors private', async () => {
  const email = 'career-auth-' + randomUUID() + '@example.test',
    password = 'Synthetic-career-auth-passphrase-42!';
  const auth = (path: string, body: unknown) =>
    handleAuth(
      new Request(origin + '/api/auth/' + path, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      services,
    );
  await services.pool.query('DELETE FROM "rateLimit"');
  expect(
    (
      await auth('sign-up/email', {
        name: 'Synthetic Career Graduate',
        email,
        password,
      })
    ).status,
  ).toBe(200);
  await expect
    .poll(() => messages.some((message) => message.to === email))
    .toBe(true);
  const id = (
    await services.pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id;
  owners.push(id);
  expect(
    (
      await auth('verify-email', {
        email,
        code: messages
          .find((message) => message.to === email)!
          .text.match(/code is (\d{8})/)![1],
      })
    ).status,
  ).toBe(200);
  const login = await auth('sign-in/email', { email, password }),
    cookie = login.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ');
  const request = (body?: unknown, headers: Record<string, string> = {}) =>
    handleCareer(
      new Request(origin + '/api/career-vault', {
        method: body ? 'POST' : 'GET',
        headers: {
          origin,
          cookie,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      services,
    );
  expect(
    (await handleCareer(new Request(origin + '/api/career-vault'), services))
      .status,
  ).toBe(401);
  const payload = {
    employmentId: randomUUID(),
    requestId: randomUUID(),
    baseVersion: 0,
    change: saveJob(job()),
  };
  expect(
    (await request(payload, { origin: 'https://untrusted.example' })).status,
  ).toBe(403);
  expect(
    (await request(payload, { 'x-fats-account': randomUUID() })).status,
  ).toBe(409);
  expect((await request({ ...payload, userId: randomUUID() })).status).toBe(
    400,
  );
  expect((await request(payload)).status).toBe(200);
  const response = await request();
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect((await response.json()).length).toBe(1);
  await services.pool.query(
    'UPDATE "user" SET "emailVerified"=false WHERE id=$1',
    [id],
  );
  expect((await request()).status).toBe(403);
});
