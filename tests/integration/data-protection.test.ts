import { portableEventCommand } from '@fats/domain';
import { portableOfferFixture } from '../helpers/portable-offer-fixture';
import { PostgresOfferRepository } from '../../apps/web/src/server/offer-repository';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { createServices } from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import {
  handleAuth,
  handleWorkspace,
} from '../../apps/web/src/server/handlers';
import { handleDocuments } from '../../apps/web/src/server/document-handlers';
import { handleOffers } from '../../apps/web/src/server/offer-handlers';
import { handleAccountErasure } from '../../apps/web/src/server/account-erasure-handler';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import {
  recoverAccountErasure,
  recoverDataLifecycle,
} from '../../apps/web/src/server/account-erasure';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import {
  FilesystemDocumentStorage,
  type DocumentStorage,
} from '../../apps/web/src/server/document-storage';
import { admitUpload } from '../../apps/web/src/server/upload-admission';
import { pdfFixture } from '../helpers/document-fixtures';
const url = process.env.FATS_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw Error('Use dedicated local test database.');
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-data-protection-passphrase!';
const owners: string[] = [],
  receipts: string[] = [],
  messages: { to: string; text: string }[] = [];
let services: ReturnType<typeof createServices>,
  root: string,
  storage: FilesystemDocumentStorage;
const token = () => {
  const value = randomBytes(32).toString('hex');
  receipts.push(value);
  return value;
};
function auth(path: string, body: unknown) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    services,
  );
}
async function user() {
  const email = `protection-${randomUUID()}@example.test`;
  expect(
    (
      await auth('sign-up/email', {
        email,
        password,
        name: 'Synthetic Data Lifecycle',
      })
    ).status,
  ).toBe(200);
  const id = (
    await services.pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id;
  owners.push(id);
  const code = messages
    .find((m) => m.to === email)!
    .text.match(/code is (\d{8})/)![1];
  expect((await auth('verify-email', { email, code })).status).toBe(200);
  const login = await auth('sign-in/email', { email, password });
  expect(login.status).toBe(200);
  return {
    id,
    email,
    cookie: login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
    workspace: new PostgresWorkspaceRepository(services.pool, id),
    documents: new PostgresDocumentRepository(services.pool, id, storage),
  };
}
function erase(
  owner: { id: string; cookie: string },
  receipt: string,
  body: Record<string, unknown> = {},
  adapter: DocumentStorage = storage,
) {
  return handleAccountErasure(
    new Request(origin + '/api/account', {
      method: 'POST',
      headers: {
        origin,
        cookie: owner.cookie,
        'x-fats-account': owner.id,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ receipt, ...body }),
    }),
    services,
    adapter,
  );
}
const confirmation = { confirmed: true, confirmation: 'DELETE MY ACCOUNT' };
const input = {
  title: 'Synthetic graduate job',
  company: 'Example',
  location: 'Remote',
  sourceUrl: 'https://example.test/job',
  description: 'Synthetic notes',
};
async function seed(owner: Awaited<ReturnType<typeof user>>) {
  const app = await owner.workspace.create(input);
  await owner.workspace.createInterview({
    applicationId: app.id,
    title: 'Synthetic interview',
    stage: 'HR',
    scheduledAt: '2030-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.test/meet',
    location: '',
    preparationNotes: 'Private synthetic notes',
    reflections: 'Synthetic reflection',
  });
  const document = await owner.documents.upload(
    await pdfFixture(),
    'resume.pdf',
    { name: 'Synthetic resume', category: 'Resumes', requestId: randomUUID() },
  );
  await owner.documents.associate(app.id, document.versionId);
  const offer = portableOfferFixture().data.offers[0];
  const offers = new PostgresOfferRepository(services.pool, owner.id);
  for (const [index, event] of offer.events.entries()) {
    const command = portableEventCommand(event);
    if (command.kind === 'terms')
      command.terms.documentVersionId = document.versionId;
    await offers.command(app.id, randomUUID(), index, command);
  }
  await services.pool.query(
    `INSERT INTO matching_previews(user_id,id,application_id,version_id,job_revision,job_hash,configuration,sources) VALUES($1,$2,$3,$4,1,'synthetic','{}','{}')`,
    [owner.id, randomUUID(), app.id, document.versionId],
  );
  await services.pool.query(
    `INSERT INTO matching_reports(user_id,id,preview_id,application_id,version_id,job_revision,job_hash,configuration,sources,result,status) VALUES($1,$2,$3,$4,$5,1,'synthetic','{}','{}','{}','complete')`,
    [owner.id, randomUUID(), randomUUID(), app.id, document.versionId],
  );
  await services.pool.query(
    `INSERT INTO matching_usage(day,scope,attempts) VALUES(current_date,$1,1),(current_date,$2,1)`,
    [owner.id, 'extract:' + owner.id],
  );
  await owner.workspace.previewRestore(
    JSON.stringify({
      format: 'fats-backup',
      version: 2,
      exportedAt: '2026-10-16T00:00:00.000Z',
      data: { applications: [], interviews: [], offers: [] },
    }),
  );
  await services.pool.query(
    "INSERT INTO local_migrations(user_id,fingerprint) VALUES($1,'synthetic')",
    [owner.id],
  );
  const ctx = await services.auth.$context;
  await ctx.internalAdapter.createVerificationValue({
    identifier: 'reset-password:synthetic-' + randomUUID(),
    value: owner.id,
    expiresAt: new Date(Date.now() + 60000),
  });
  await ctx.internalAdapter.createVerificationValue({
    identifier: 'email-verification-otp-' + owner.email,
    value: 'synthetic-code-hash:0',
    expiresAt: new Date(Date.now() + 60000),
  });
  return { app, document };
}
beforeAll(async () => {
  services = createServices(
    url,
    origin,
    randomUUID() + randomUUID(),
    async (m) => {
      messages.push(m);
    },
  );
  await runMigrations(services.pool);
  root = await mkdtemp('/tmp/fats-data-protection-');
  storage = new FilesystemDocumentStorage(root);
});
beforeEach(async () => {
  await services.pool.query('DELETE FROM "rateLimit"');
});
afterAll(async () => {
  for (const id of owners) {
    const receipt = token();
    try {
      await beginAccountErasure(services.pool, id, receipt);
    } catch {}
    await recoverDataLifecycle(services.pool, storage);
  }
  for (const receipt of receipts)
    await services.pool.query(
      'DELETE FROM account_erasures WHERE receipt_hash=$1',
      [createHash('sha256').update(receipt).digest('hex')],
    );
  await services.pool.end();
  await rm(root, { recursive: true, force: true });
});
it('requires explicit verified live authorization and erases all owned records and bytes without affecting another user', async () => {
  const a = await user(),
    b = await user();
  const saved = await seed(a);
  await a.documents.upload(
    await pdfFixture('Synthetic second version'),
    'resume-v2.pdf',
    { documentId: saved.document.documentId, requestId: randomUUID() },
  );
  await a.documents.edit(saved.document.documentId, {
    name: 'Archived synthetic resume',
    category: 'Resumes',
    archived: true,
    isDefault: false,
  });
  const interruptedKey = randomUUID();
  await services.pool.query(
    'INSERT INTO document_objects(storage_key,user_id) VALUES($1,$2)',
    [interruptedKey, a.id],
  );
  await writeFile(
    root + '/' + interruptedKey + '.blob',
    'synthetic unpublished bytes',
    { mode: 0o600 },
  );
  await writeFile(
    root + '/' + interruptedKey + '.partial',
    'synthetic interrupted bytes',
    { mode: 0o600 },
  );
  const aKeys = (
    await services.pool.query(
      'SELECT storage_key FROM document_objects WHERE user_id=$1',
      [a.id],
    )
  ).rows;
  await seed(b);
  const bBefore = await b.workspace.getWorkspace(),
    bFiles = (await b.documents.library()).documents;
  const receipt = token();
  expect((await erase(a, receipt)).status).toBe(400);
  expect((await erase({ ...a, id: b.id }, receipt, confirmation)).status).toBe(
    409,
  );
  expect(
    (await erase({ ...a, cookie: '' }, receipt, confirmation)).status,
  ).toBe(401);
  expect(
    (await erase(a, receipt, { ...confirmation, userId: b.id })).status,
  ).toBe(400);
  const response = await erase(a, receipt, confirmation);
  expect(await response.json()).toEqual({ status: 'complete' });
  for (const table of [
    'applications',
    'interviews',
    'offers',
    'offer_events',
    'documents',
    'document_versions',
    'application_document_versions',
    'matching_previews',
    'matching_reports',
    'workspace_stages',
    'local_migrations',
    'workspaces',
    'document_upload_usage',
    'document_objects',
  ])
    expect(
      (
        await services.pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [
          a.id,
        ])
      ).rowCount,
      table,
    ).toBe(0);
  for (const table of ['session', 'account'])
    expect(
      (
        await services.pool.query(`SELECT 1 FROM ${table} WHERE "userId"=$1`, [
          a.id,
        ])
      ).rowCount,
    ).toBe(0);
  expect(
    (await services.pool.query('SELECT 1 FROM "user" WHERE id=$1', [a.id]))
      .rowCount,
  ).toBe(0);
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM verification WHERE value=$1 OR identifier=$2',
        [
          a.id,
          createHash('sha256')
            .update('email-verification-otp-' + a.email)
            .digest('base64url'),
        ],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM matching_usage WHERE scope=ANY($1::text[])',
        [[a.id, 'extract:' + a.id]],
      )
    ).rowCount,
  ).toBe(0);
  for (const { storage_key: key } of aKeys) {
    await expect(access(root + '/' + key + '.blob')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(root + '/' + key + '.partial')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }
  expect(await b.workspace.getWorkspace()).toEqual(bBefore);
  expect((await b.documents.library()).documents).toEqual(bFiles);
  expect(await b.documents.download(bFiles[0].versions[0].id)).toBeTruthy();
  await expect(
    a.documents.download(saved.document.versionId),
  ).rejects.toMatchObject({ status: 401 });
  expect((await erase({ ...a, cookie: '' }, receipt)).status).toBe(200);
});
it('recovers after injected unlink failure and lost deletion response; denies stale sessions and sign-in while pending', async () => {
  const a = await user();
  const { document } = await seed(a);
  const receipt = token();
  const broken: DocumentStorage = {
    put: storage.put.bind(storage),
    read: storage.read.bind(storage),
    remove: async () => {
      throw Error('SYNTHETIC PRIVATE DISK FAILURE');
    },
  };
  const response = await erase(a, receipt, confirmation, broken);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: 'pending' });
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM document_garbage g JOIN document_objects o USING(storage_key) WHERE o.user_id=$1',
        [a.id],
      )
    ).rowCount,
  ).toBeGreaterThan(0);
  expect(
    (
      await handleWorkspace(
        new Request(origin + '/api/workspace', {
          headers: { cookie: a.cookie },
        }),
        services,
      )
    ).status,
  ).toBe(401);
  expect(
    (await auth('sign-in/email', { email: a.email, password })).status,
  ).toBe(401);
  await expect(a.workspace.create(input)).rejects.toMatchObject({
    status: 401,
  });
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
  await expect(a.documents.download(document.versionId)).rejects.toMatchObject({
    status: 401,
  });
});
it('keeps a durable blocked account after interruption before relational erasure and retries safely', async () => {
  const a = await user();
  await seed(a);
  const receipt = token();
  await beginAccountErasure(services.pool, a.id, receipt);
  const pendingLogin = await auth('sign-in/email', {
    email: a.email,
    password,
  });
  const missingLogin = await auth('sign-in/email', {
    email: 'missing-' + randomUUID() + '@example.test',
    password,
  });
  expect(pendingLogin.status).toBe(missingLogin.status);
  expect(await pendingLogin.json()).toEqual(await missingLogin.json());
  expect(
    (await auth('sign-in/email', { email: a.email, password })).status,
  ).toBe(401);
  expect(
    (
      await handleOffers(
        new Request(origin + '/api/offers', { headers: { cookie: a.cookie } }),
        services,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await services.pool.query('SELECT 1 FROM applications WHERE user_id=$1', [
        a.id,
      ])
    ).rowCount,
  ).toBe(1);
  await expect(a.documents.library()).rejects.toMatchObject({ status: 401 });
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    ['apps/web/scripts/cleanup-data.mjs'],
    { env: { ...process.env, DATABASE_URL: url, FATS_DOCUMENTS_DIR: root } },
  );
  expect(JSON.parse(stdout)).toEqual({ pendingAccounts: 0, pendingFiles: 0 });
  expect(stderr).toBe('');
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
});
it('blocks simultaneous uploads, coordinates deletion with a body in flight, and releases admission', async () => {
  const a = await user(),
    receipt = token();
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>((r) => {
      started = r;
    }),
    wait = new Promise<void>((r) => {
      finish = r;
    });
  const bytes = await pdfFixture();
  const stream = new ReadableStream({
    async pull(c) {
      started();
      await wait;
      c.enqueue(bytes);
      c.close();
    },
  });
  const request = new Request(origin + '/api/documents', {
    method: 'PUT',
    headers: {
      origin,
      cookie: a.cookie,
      'content-type': 'application/octet-stream',
      'x-fats-upload': encodeURIComponent(
        JSON.stringify({
          requestId: randomUUID(),
          filename: 'resume.pdf',
          name: 'Resume',
          category: 'Resumes',
        }),
      ),
    },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  const uploading = handleDocuments(request, services, storage);
  await entered;
  // Wait for PostgreSQL admission before deletion (stream pull may run eagerly).
  await expect
    .poll(async () =>
      Number(
        (
          await services.pool.query(
            'SELECT count(*) FROM document_upload_usage WHERE user_id=$1',
            [a.id],
          )
        ).rows[0].count,
      ),
    )
    .toBe(1);
  await expect(admitUpload(services.pool, a.id)).rejects.toMatchObject({
    status: 429,
  });
  const deleting = await erase(a, receipt, confirmation);
  expect(deleting.status).toBe(202);
  finish();
  expect((await uploading).status).toBe(401);
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM document_objects WHERE user_id=$1',
        [a.id],
      )
    ).rowCount,
  ).toBe(0);
});
it('recovers durable partial/publication intents after storage failure and preserves referenced versions', async () => {
  const a = await user(),
    bytes = await pdfFixture();
  const broken: DocumentStorage = {
    read: storage.read.bind(storage),
    remove: storage.remove.bind(storage),
    put: async (key, data) => {
      await writeFile(root + '/' + key + '.partial', data.subarray(0, 10), {
        mode: 0o600,
      });
      throw Error('synthetic partial disk failure');
    },
  };
  await expect(
    new PostgresDocumentRepository(services.pool, a.id, broken).upload(
      bytes,
      'resume.pdf',
      { requestId: randomUUID(), name: 'Resume', category: 'Resumes' },
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM document_objects WHERE user_id=$1',
        [a.id],
      )
    ).rowCount,
  ).toBe(1);
  const valid = await a.documents.upload(bytes, 'resume.pdf', {
    requestId: randomUUID(),
    name: 'Resume',
    category: 'Resumes',
  });
  await recoverDataLifecycle(services.pool, storage);
  expect(
    (await storage.inventory()).filter((f) => f.endsWith('.partial')),
  ).toEqual([]);
  expect(
    Buffer.from((await a.documents.download(valid.versionId)).bytes),
  ).toEqual(bytes);
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM document_objects WHERE user_id=$1',
        [a.id],
      )
    ).rowCount,
  ).toBe(1);
  const object = (
    await services.pool.query(
      'SELECT storage_key FROM document_objects WHERE user_id=$1',
      [a.id],
    )
  ).rows[0];
  expect(await readFile(root + '/' + object.storage_key + '.blob')).toEqual(
    bytes,
  );
});
it('enforces global admission and per-owner upload attempt limits', async () => {
  const a = await user(),
    b = await user(),
    c = await user();
  const first = await admitUpload(services.pool, a.id),
    second = await admitUpload(services.pool, b.id);
  try {
    await expect(admitUpload(services.pool, c.id)).rejects.toMatchObject({
      status: 429,
    });
  } finally {
    await first();
    await second();
  }
  await services.pool.query(
    "INSERT INTO document_upload_usage(user_id,window_start,attempts) VALUES($1,date_trunc('hour',now()),20)",
    [c.id],
  );
  await expect(admitUpload(services.pool, c.id)).rejects.toMatchObject({
    status: 429,
  });
  // Another owner's budget remains independent.
  await (
    await admitUpload(services.pool, a.id)
  )();
});
it('rolls relational erasure back on an injected SQL failure while retaining the durable deletion request', async () => {
  const a = await user();
  await seed(a);
  const receipt = token();
  const name = 'erasure_fault_' + randomUUID().replaceAll('-', '');
  await services.pool.query(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.user_id='${a.id}'::uuid THEN RAISE EXCEPTION 'Synthetic erasure fault'; END IF; RETURN OLD; END; $$`,
  );
  await services.pool.query(
    `CREATE TRIGGER ${name} BEFORE DELETE ON documents FOR EACH ROW EXECUTE FUNCTION ${name}()`,
  );
  try {
    expect((await erase(a, receipt, confirmation)).status).toBe(202);
    expect(
      (
        await services.pool.query(
          'SELECT 1 FROM document_versions WHERE user_id=$1',
          [a.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await services.pool.query(
          'SELECT 1 FROM matching_reports WHERE user_id=$1',
          [a.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await services.pool.query('SELECT 1 FROM session WHERE "userId"=$1', [
          a.id,
        ])
      ).rowCount,
    ).toBe(0);
    await expect(
      a.documents.download(
        (
          await services.pool.query(
            'SELECT id FROM document_versions WHERE user_id=$1',
            [a.id],
          )
        ).rows[0].id,
      ),
    ).rejects.toMatchObject({ status: 401 });
  } finally {
    await services.pool.query(`DROP TRIGGER ${name} ON documents`);
    await services.pool.query(`DROP FUNCTION ${name}()`);
  }
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
});
it('orders deletion after a storage publication already holding the owner row lock', async () => {
  const a = await user(),
    receipt = token();
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>((r) => {
      entered = r;
    }),
    wait = new Promise<void>((r) => {
      finish = r;
    });
  const slow: DocumentStorage = {
    read: storage.read.bind(storage),
    remove: storage.remove.bind(storage),
    put: async (key, data) => {
      entered();
      await wait;
      await storage.put(key, data);
    },
  };
  const uploading = new PostgresDocumentRepository(
    services.pool,
    a.id,
    slow,
  ).upload(await pdfFixture(), 'resume.pdf', {
    requestId: randomUUID(),
    name: 'Resume',
    category: 'Resumes',
  });
  await started;
  const deleting = erase(a, receipt, confirmation);
  // Complete the earlier write; marking deletion must then observe its key.
  finish();
  await uploading;
  const response = await deleting;
  expect([200, 202]).toContain(response.status);
  expect(await recoverAccountErasure(services.pool, receipt, storage)).toBe(
    'complete',
  );
  expect(
    (
      await services.pool.query(
        'SELECT 1 FROM document_objects WHERE user_id=$1',
        [a.id],
      )
    ).rowCount,
  ).toBe(0);
});
