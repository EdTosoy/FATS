import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  createBackup,
  serializeBackup,
  type ApplicationInput,
  type InterviewInput,
  type JobCapture,
  type WorkspaceData,
} from '@fats/domain';
import {
  createDatabasePool,
  createServices,
} from '../../apps/web/src/server/services';
import {
  handleAuth,
  handleWorkspace,
} from '../../apps/web/src/server/handlers';
import { runMigrations } from '../../apps/web/src/server/migrations';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';

const url = process.env.FATS_TEST_DATABASE_URL;
if (
  !url ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error(
    'Set FATS_TEST_DATABASE_URL to a dedicated local database ending in _test. Integration tests never use DATABASE_URL as a fallback.',
  );
const origin = 'http://127.0.0.1:3000';
let services: ReturnType<typeof createServices>;
const messages: { to: string; text: string }[] = [];
const password = 'Synthetic-test-passphrase-42!';
const owners: string[] = [];
const app: ApplicationInput = {
  title: 'Graduate Engineer',
  company: 'Example',
  location: 'Makati',
  sourceUrl: 'https://example.test/job',
  description: 'Plain notes',
};
const when = '2030-03-10T06:30:00.000Z';
const meeting = (applicationId: string): InterviewInput => ({
  applicationId,
  title: 'Technical conversation',
  stage: 'Technical',
  scheduledAt: when,
  timeZone: 'America/New_York',
  meetingUrl: 'https://example.test/meeting',
  location: '',
  preparationNotes: 'Prepare questions.\n Review basics.',
  reflections: '',
});
async function auth(
  path: string,
  body?: unknown,
  cookie?: string,
  authOrigin = origin,
) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin: authOrigin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    services,
  );
}
async function user() {
  const email = `phase4-${randomUUID()}@example.test`;
  const response = await auth('sign-up/email', {
    name: 'Synthetic Graduate',
    email,
    password,
  });
  expect(response.status).toBe(200);
  await expect
    .poll(() => messages.some((message) => message.to === email))
    .toBe(true);
  const code = [...messages]
    .reverse()
    .find((message) => message.to === email)!
    .text.match(/code is (\d{8})/)![1];
  expect((await auth('verify-email', { email, code })).status).toBe(200);
  const signedIn = await auth('sign-in/email', { email, password });
  expect(signedIn.status).toBe(200);
  const result = await signedIn.json();
  owners.push(result.user.id);
  const cookie = signedIn.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
  return {
    id: result.user.id as string,
    email,
    cookie,
    response: signedIn,
    repository: new PostgresWorkspaceRepository(services.pool, result.user.id),
  };
}

async function request(
  cookie?: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return handleWorkspace(
    new Request(origin + '/api/workspace', {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    services,
  );
}
async function dataset(
  owner: Awaited<ReturnType<typeof user>>,
): Promise<WorkspaceData> {
  const saved = await owner.repository.create(app);
  const first = await owner.repository.createInterview(meeting(saved.id));
  await owner.repository.updateInterview(first.id, {
    ...first,
    status: 'completed',
    reflections: 'Learned a lot.',
  });
  const second = await owner.repository.createInterview({
    ...meeting(saved.id),
    title: 'Final conversation',
  });
  await owner.repository.updateInterview(second.id, {
    ...second,
    status: 'cancelled',
  });
  return owner.repository.getWorkspace();
}
function backup(data: WorkspaceData) {
  return serializeBackup(createBackup(data, new Date().toISOString()));
}

beforeAll(async () => {
  // Better Auth starts schema validation at initialization. Migrate before
  // creating the auth instance so an empty DB cannot cache a schema mismatch.
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
    async (message) => {
      messages.push(message);
    },
  );
});
beforeEach(async () => {
  await services.pool.query('DELETE FROM "rateLimit"');
});
afterAll(async () => {
  for (const id of owners) {
    await services.pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await services.pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await services.pool.query('DELETE FROM "rateLimit"');
  await services.pool.end();
});
describe('PostgreSQL migrations and real authentication', () => {
  it('applies exactly the versioned schema, reruns safely, and enforces database ownership keys', async () => {
    expect(await runMigrations(services.pool)).toEqual([
      '0001_auth.sql',
      '0002_workspace.sql',
      '0003_legacy_text.sql',
      '0004_documents.sql',
      '0005_matching.sql',
      '0006_offers.sql',
      '0007_portable_offers.sql',
    ]);
    expect(
      (
        await services.pool.query(
          'SELECT name FROM fats_schema_migrations ORDER BY name',
        )
      ).rows,
    ).toHaveLength(7);
    const a = await user(),
      b = await user();
    const data = await dataset(a);
    await expect(
      services.pool.query(
        'DELETE FROM applications WHERE user_id=$1 AND id=$2',
        [a.id, data.applications[0].id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      services.pool.query(
        `INSERT INTO interviews SELECT $1::uuid,id,"applicationId",title,stage,"scheduledAt","timeZone","meetingUrl",location,"preparationNotes",reflections,status,"createdAt","updatedAt" FROM interviews WHERE user_id=$2 LIMIT 1`,
        [b.id, a.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('rolls back a failed schema migration and refuses changed applied SQL', async () => {
    const dir = await mkdtemp(tmpdir() + '/fats-phase4-migrations-');
    try {
      await cp('apps/web/migrations', dir, { recursive: true });
      await writeFile(
        dir + '/0006_failure.sql',
        'CREATE TABLE phase4_should_rollback(id int); SELECT 1/0;',
      );
      await expect(
        runMigrations(services.pool, pathToFileURL(dir + '/')),
      ).rejects.toMatchObject({ code: '22012' });
      expect(
        (
          await services.pool.query(
            "SELECT to_regclass('phase4_should_rollback') AS name",
          )
        ).rows[0].name,
      ).toBeNull();
      await writeFile(dir + '/0001_auth.sql', '-- Changed migration');
      await expect(
        runMigrations(services.pool, pathToFileURL(dir + '/')),
      ).rejects.toThrow('checksum');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('registers with a hashed password and HttpOnly SameSite cookie, logs in, revokes logout, and rejects expired sessions', async () => {
    const owner = await user();
    expect(owner.response.headers.getSetCookie().join(' ')).toMatch(
      /httponly/i,
    );
    expect(owner.response.headers.getSetCookie().join(' ')).toMatch(
      /samesite=lax/i,
    );
    const stored = (
      await services.pool.query(
        'SELECT password FROM account WHERE "userId"=$1',
        [owner.id],
      )
    ).rows[0].password;
    expect(stored).not.toBe(password);
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    const session = await auth('get-session', undefined, owner.cookie);
    expect(await session.json()).toEqual({
      user: {
        id: owner.id,
        name: 'Synthetic Graduate',
        email: owner.email,
        emailVerified: true,
      },
    });
    expect((await request(owner.cookie)).status).toBe(200);
    expect((await auth('sign-out', {}, owner.cookie)).status).toBe(200);
    expect((await request(owner.cookie)).status).toBe(401);
    const login = await auth('sign-in/email', { email: owner.email, password });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ');
    await services.pool.query(
      'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
      [owner.id],
    );
    expect((await request(cookie)).status).toBe(401);
  });
  it('returns generic auth errors and enforces origin, body type, password policy, and rate limits', async () => {
    expect(
      (
        await auth('sign-up/email', {
          name: 'Test',
          email: 'test@example.test',
          password: 'short',
        })
      ).status,
    ).toBe(400);
    const owner = await user();
    const invalid = await auth('sign-in/email', {
      email: owner.email,
      password: 'Incorrect-password-42!',
    });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({
      error:
        'Unable to sign in. Check your email and password, or verify your email.',
    });
    expect(
      (
        await auth(
          'sign-in/email',
          { email: owner.email, password },
          undefined,
          'https://evil.test',
        )
      ).status,
    ).toBe(403);
    let response: Response = invalid;
    for (let i = 0; i < 21; i++)
      response = await auth('sign-in/email', {
        email: owner.email,
        password: 'Incorrect-password-42!',
      });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBeTruthy();
  });
  it('requires Secure cookies on HTTPS and rejects nonlocal plaintext auth origins', async () => {
    expect(() =>
      createServices(url, 'http://example.test', randomUUID() + randomUUID()),
    ).toThrow('HTTPS');
    const secure = createServices(
      url,
      'https://fats.example.test',
      randomUUID() + randomUUID(),
      async (message) => {
        messages.push(message);
      },
    );
    try {
      let response = await handleAuth(
        new Request('https://fats.example.test/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            origin: 'https://fats.example.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Secure Test',
            email: `secure-${randomUUID()}@example.test`,
            password,
          }),
        }),
        secure,
      );
      expect(response.status).toBe(200);
      const email = [...messages]
        .reverse()
        .find((message) => message.to.startsWith('secure-'))!.to;
      const code = [...messages]
        .reverse()
        .find((message) => message.to === email)!
        .text.match(/code is (\d{8})/)![1];
      const call = async (path: string, body: unknown) =>
        handleAuth(
          new Request('https://fats.example.test/api/auth/' + path, {
            method: 'POST',
            headers: {
              origin: 'https://fats.example.test',
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
          secure,
        );
      expect((await call('verify-email', { email, code })).status).toBe(200);
      response = await call('sign-in/email', { email, password });
      expect(response.status).toBe(200);
      const result = await response.json();
      owners.push(result.user.id);
      expect(response.headers.getSetCookie().join(' ')).toMatch(/; secure/i);
    } finally {
      await secure.pool.end();
    }
  });
});
describe('Owner-scoped API and repository', () => {
  it('rejects unauthenticated requests and client ownership, and prevents all cross-user record operations', async () => {
    expect((await request()).status).toBe(401);
    expect(
      (await request(undefined, undefined, { host: 'evil.test' })).status,
    ).toBe(403);
    const a = await user(),
      b = await user(),
      data = await dataset(a);
    expect(await (await request(b.cookie)).json()).toEqual({
      applications: [],
      interviews: [],
    });
    const id = data.applications[0].id,
      interview = data.interviews[0];
    for (const command of [
      { action: 'update', id, input: { ...app, status: 'Offer' } },
      { action: 'delete-application', id },
      { action: 'update-interview', id: interview.id, input: interview },
      { action: 'delete-interview', id: interview.id },
      { action: 'create-interview', id: randomUUID(), input: meeting(id) },
    ])
      expect((await request(b.cookie, command)).status).toBe(404);
    expect(
      (
        await request(a.cookie, {
          action: 'create',
          id: randomUUID(),
          input: app,
          userId: b.id,
        })
      ).status,
    ).toBe(400);
    const changed = await request(
      b.cookie,
      { action: 'create', id: randomUUID(), input: app },
      { 'x-fats-account': a.id },
    );
    expect(changed.status).toBe(409);
    expect((await changed.json()).code).toBe('ACCOUNT_CHANGED');
    expect(await a.repository.getWorkspace()).toEqual(data);
  });
  it('creates and edits applications/interviews, preserves timestamps, reschedules, completes, cancels, and deletes safely', async () => {
    const owner = await user();
    const created = await owner.repository.create(app);
    const edited = await owner.repository.update(created.id, {
      ...app,
      title: 'Corrected title',
      status: 'Applied',
    });
    expect(edited.createdAt).toBe(created.createdAt);
    const first = await owner.repository.createInterview(meeting(created.id));
    const changed = await owner.repository.updateInterview(first.id, {
      ...first,
      scheduledAt: '2030-03-10T07:30:00.000Z',
      status: 'completed',
      preparationNotes: 'New preparation',
      reflections: 'Went well.',
    });
    expect(changed.createdAt).toBe(first.createdAt);
    expect(changed.timeZone).toBe('America/New_York');
    expect(changed.status).toBe('completed');
    await expect(
      owner.repository.deleteApplication(created.id),
    ).rejects.toThrow('linked');
    await owner.repository.deleteInterview(first.id);
    await owner.repository.deleteApplication(created.id);
    expect(await owner.repository.getWorkspace()).toEqual({
      applications: [],
      interviews: [],
    });
  });
  it('validates untrusted records, invalid dates, timezones, URLs, statuses, and oversized bodies without writes', async () => {
    const owner = await user();
    const saved = await owner.repository.create(app);
    for (const input of [
      { ...app, title: 3 },
      { ...app, sourceUrl: 'javascript:alert(1)' },
      { ...app, description: 'x'.repeat(20001) },
    ])
      expect(
        (
          await request(owner.cookie, {
            action: 'create',
            id: randomUUID(),
            input,
          })
        ).status,
      ).toBe(400);
    for (const input of [
      { ...meeting(saved.id), scheduledAt: '2030-02-30T00:00:00.000Z' },
      { ...meeting(saved.id), timeZone: 'Invalid/Zone' },
      { ...meeting(saved.id), meetingUrl: 'javascript:alert(1)' },
    ])
      expect(
        (
          await request(owner.cookie, {
            action: 'create-interview',
            id: randomUUID(),
            input,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(owner.cookie, {
          action: 'update',
          id: saved.id,
          input: { ...app, status: 'bad' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          owner.cookie,
          { action: 'create', id: randomUUID(), input: app },
          { origin: 'https://evil.test' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          owner.cookie,
          { action: 'create', id: randomUUID(), input: app },
          { 'content-type': 'text/plain' },
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await request(
          owner.cookie,
          { action: 'create', id: randomUUID(), input: app },
          { 'content-length': '99999999' },
        )
      ).status,
    ).toBe(413);
    expect((await owner.repository.getWorkspace()).applications).toHaveLength(
      1,
    );
  });
  it('serializes concurrent Sidekick confirmations and idempotent creation retries', async () => {
    const owner = await user();
    const id = randomUUID();
    const capture: JobCapture = {
      format: 'fats-sidekick',
      version: 1,
      id,
      origin: 'http://127.0.0.1:3000',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      job: { ...app, workArrangement: 'Hybrid' },
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        owner.repository.createCapturedApplication(capture, app),
      ),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    const second = randomUUID();
    await Promise.all([
      owner.repository.create(
        { ...app, sourceUrl: 'https://example.test/another' },
        second,
      ),
      owner.repository.create(
        { ...app, sourceUrl: 'https://example.test/another' },
        second,
      ),
    ]);
    expect((await owner.repository.getWorkspace()).applications).toHaveLength(
      2,
    );
    const wrong = await request(owner.cookie, {
      action: 'capture',
      capture: { ...capture, origin: 'http://localhost:3000' },
      input: app,
    });
    expect(wrong.status).toBe(400); // Invalid captures are rejected, with no record mutation.
  });
});
describe('Durable migration and account backups', () => {
  it('preserves valid legacy whitespace without imposing stricter raw SQL text lengths', async () => {
    const source = await user(),
      target = await user();
    const data = await dataset(source);
    data.applications[0].title =
      ' '.repeat(160) + data.applications[0].title + '\n';
    data.interviews[0].preparationNotes =
      '\n'.repeat(20000) + 'Original preparation.\n';
    const preview = await target.repository.previewMigration(backup(data));
    await target.repository.migrateLocal(preview.token);
    expect(await target.repository.getWorkspace()).toEqual(data);
  });
  it('previews and copies multiple interviews, notes/statuses/IDs, keeps existing records, and survives repeated/interrupted confirmation', async () => {
    const source = await user(),
      target = await user();
    const data = await dataset(source);
    const keep = await target.repository.create({
      ...app,
      sourceUrl: 'https://example.test/keep',
    });
    const preview = await target.repository.previewMigration(backup(data));
    expect(preview.added).toEqual({ applications: 1, interviews: 2 });
    expect((await target.repository.getWorkspace()).applications).toEqual([
      keep,
    ]);
    const applied = await target.repository.migrateLocal(preview.token);
    expect(applied.interviews).toEqual(data.interviews);
    // A lost HTTP response can be retried through a fresh server adapter.
    const fresh = new PostgresWorkspaceRepository(services.pool, target.id);
    expect(await fresh.migrateLocal(preview.token)).toEqual(applied);
    const again = await fresh.previewMigration(backup(data));
    expect(again.alreadyImported).toBe(true);
    expect(again.added).toEqual({ applications: 0, interviews: 0 });
    await fresh.migrateLocal(again.token);
    expect((await fresh.getWorkspace()).applications).toHaveLength(2);
    const copied = (await fresh.getWorkspace()).applications.find(
      (row) => row.id === data.applications[0].id,
    );
    expect(copied).toEqual(data.applications[0]);
  });
  it('skips identical records, rejects conflicts/missing parents/bad backups, and handles empty workspaces', async () => {
    const source = await user(),
      target = await user();
    const data = await dataset(source);
    const restore = await target.repository.previewRestore(backup(data));
    await target.repository.restoreBackup(restore.token);
    const duplicate = await target.repository.previewMigration(backup(data));
    expect(duplicate.identical).toEqual({ applications: 1, interviews: 2 });
    expect(duplicate.added).toEqual({ applications: 0, interviews: 0 });
    await expect(
      target.repository.previewMigration(
        backup({
          ...data,
          applications: [
            { ...data.applications[0], title: 'Conflicting title' },
          ],
        }),
      ),
    ).rejects.toThrow('conflicts');
    const orphan = JSON.parse(backup(data));
    orphan.data.applications = [];
    await expect(
      target.repository.previewMigration(JSON.stringify(orphan)),
    ).rejects.toThrow('missing parent');
    for (const text of [
      '{',
      JSON.stringify({ format: 'fats-backup', version: 3 }),
    ])
      await expect(target.repository.previewRestore(text)).rejects.toThrow();
    const empty = await target.repository.previewMigration(
      backup({ applications: [], interviews: [] }),
    );
    expect(empty.added).toEqual({ applications: 0, interviews: 0 });
    expect(await target.repository.getWorkspace()).toEqual(data);
  });
  it('requires confirmation, binds previews to owners, cancels, expires, and rejects stale account revisions', async () => {
    const a = await user(),
      b = await user();
    const data = await dataset(a);
    const preview = await b.repository.previewMigration(backup(data));
    expect(
      (await request(b.cookie, { action: 'migrate', token: preview.token }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(a.cookie, {
          action: 'migrate',
          token: preview.token,
          confirmed: true,
        })
      ).status,
    ).toBe(404);
    await b.repository.cancelStage(preview.token);
    await expect(b.repository.migrateLocal(preview.token)).rejects.toThrow(
      'unavailable',
    );
    const stale = await b.repository.previewMigration(backup(data));
    await b.repository.create({ ...app, title: 'A later edit' });
    await expect(b.repository.migrateLocal(stale.token)).rejects.toThrow(
      'changed since preview',
    );
    const expired = await b.repository.previewRestore(backup(data));
    await services.pool.query(
      'UPDATE workspace_stages SET "expiresAt"=now()-interval \'1 second\' WHERE token=$1',
      [expired.token],
    );
    await expect(b.repository.restoreBackup(expired.token)).rejects.toThrow(
      'expired',
    );
    expect((await b.repository.getWorkspace()).applications).toHaveLength(1);
  });
  it('exports a consistent private backup and atomically restores all fields across adapter/server instances', async () => {
    const owner = await user(),
      other = await user();
    const data = await dataset(owner);
    await dataset(other);
    const exported = await owner.repository.exportBackup();
    expect(JSON.parse(exported).data).toEqual(data);
    expect(exported).not.toContain(owner.id);
    expect(exported).not.toContain(password);
    const empty = await owner.repository.previewRestore(
      backup({ applications: [], interviews: [] }),
    );
    await owner.repository.restoreBackup(empty.token);
    expect((await owner.repository.getWorkspace()).applications).toHaveLength(
      0,
    );
    const restore = await owner.repository.previewRestore(exported);
    await owner.repository.restoreBackup(restore.token);
    expect(
      await new PostgresWorkspaceRepository(
        services.pool,
        owner.id,
      ).getWorkspace(),
    ).toEqual(data);
    expect((await other.repository.getWorkspace()).interviews).toHaveLength(2);
  });
  it('rolls back related inserts and replacements after an actual PostgreSQL write failure, then retries safely', async () => {
    const source = await user(),
      target = await user();
    const data = await dataset(source),
      before = await dataset(target);
    const migrate = await target.repository.previewMigration(backup(data));
    await services.pool.query(
      `CREATE FUNCTION phase4_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${target.id}'::uuid THEN RAISE EXCEPTION 'synthetic write failure'; END IF; RETURN NEW; END $$`,
    );
    await services.pool.query(
      'CREATE TRIGGER phase4_reject BEFORE INSERT ON interviews FOR EACH ROW EXECUTE FUNCTION phase4_test_reject()',
    );
    try {
      await expect(
        target.repository.migrateLocal(migrate.token),
      ).rejects.toThrow('synthetic write failure');
      expect(await target.repository.getWorkspace()).toEqual(before);
      const restore = await target.repository.previewRestore(backup(data));
      await expect(
        target.repository.restoreBackup(restore.token),
      ).rejects.toThrow('synthetic write failure');
      expect(await target.repository.getWorkspace()).toEqual(before);
    } finally {
      await services.pool.query('DROP TRIGGER phase4_reject ON interviews');
      await services.pool.query('DROP FUNCTION phase4_test_reject()');
    }
    await target.repository.migrateLocal(migrate.token);
    expect((await target.repository.getWorkspace()).applications).toHaveLength(
      2,
    );
  });
});
