import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createServices } from '../../apps/web/src/server/services';
import { handleAuth } from '../../apps/web/src/server/handlers';
import {
  previewMigrations,
  runMigrations,
} from '../../apps/web/src/server/migrations';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
import type { AccountEmail } from '../../apps/web/src/server/account-email';

const connection = process.env.FATS_TEST_DATABASE_URL;
if (
  !connection ||
  !['127.0.0.1', 'localhost'].includes(new URL(connection).hostname) ||
  !new URL(connection).pathname.endsWith('_test')
)
  throw new Error('Use a dedicated local test database.');
const origin = 'https://fats.example.test';
const password = 'Synthetic-hosted-account-passphrase!';
const tasks: (() => Promise<void>)[] = [],
  messages: AccountEmail[] = [],
  owners: string[] = [];
const services = createServices(
  connection,
  origin,
  randomUUID() + randomUUID(),
  async (message) => {
    messages.push(message);
  },
  { scheduleEmail: (task) => tasks.push(task), vercelProxy: true },
);
beforeAll(async () => {
  await runMigrations(services.pool);
});
beforeEach(async () => {
  tasks.length = 0;
  messages.length = 0;
  await services.pool.query('DELETE FROM "rateLimit"');
});
afterAll(async () => {
  for (const id of owners) {
    await services.pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await services.pool.end();
});
function call(path: string, body: unknown) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '198.51.100.10',
        'x-forwarded-for': '203.0.113.99',
      },
      body: JSON.stringify(body),
    }),
    services,
  );
}
async function register() {
  const email = `d2-${randomUUID()}@example.test`;
  const response = await call('sign-up/email', {
    name: 'Synthetic Hosted Graduate',
    email,
    password,
  });
  expect(response.status).toBe(200);
  const id = (
    await services.pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id as string;
  owners.push(id);
  return { email, id };
}
async function verified() {
  const owner = await register();
  await tasks.shift()!();
  const code = messages.at(-1)!.text.match(/code is (\d{8})/)![1];
  expect(
    (await call('verify-email', { email: owner.email, code })).status,
  ).toBe(200);
  return owner;
}

it('persists the OTP before response while delivery alone waits for request-lifetime scheduling', async () => {
  const owner = await register();
  expect(messages).toHaveLength(0);
  expect(tasks).toHaveLength(1);
  const context = await services.auth.$context;
  const stored = await context.internalAdapter.findVerificationValue(
    'email-verification-otp-' + owner.email,
  );
  expect(!!stored).toBe(true);
  await tasks.shift()!();
  const code = messages[0].text.match(/code is (\d{8})/)![1];
  expect(stored!.value).not.toContain(code);
  expect(
    (await call('verify-email', { email: owner.email, code })).status,
  ).toBe(200);
  const login = await call('sign-in/email', { email: owner.email, password });
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .find((row) => row.includes('session_token'))!;
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).not.toContain('Domain=');
  const keys = (
    await services.pool.query('SELECT key FROM "rateLimit"')
  ).rows.map((row) => row.key as string);
  expect(keys.some((key) => key.startsWith('198.51.100.10|'))).toBe(true);
  expect(keys.some((key) => key.includes('203.0.113.99'))).toBe(false);
});

it('holds transaction-scoped auth coordination through the library operation and prevents erasure/session races', async () => {
  const owner = await verified();
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
      enter = resolve;
    }),
    wait = new Promise<void>((resolve) => {
      release = resolve;
    });
  const original = services.auth.handler;
  const spy = vi
    .spyOn(services.auth, 'handler')
    .mockImplementation(async (request) => {
      enter();
      await wait;
      return original(request);
    });
  const login = call('sign-in/email', { email: owner.email, password });
  let erasing: Promise<void> | undefined;
  const receipt = randomUUID() + randomUUID();
  try {
    await entered;
    erasing = beginAccountErasure(services.pool, owner.id, receipt);
    await expect
      .poll(async () =>
        Number(
          (
            await services.pool.query(
              "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=16432 AND objid=8 AND mode='ExclusiveLock' AND NOT granted",
            )
          ).rows[0].count,
        ),
      )
      .toBe(1);
    expect(
      (
        await services.pool.query(
          'SELECT 1 FROM account_erasures WHERE user_id=$1',
          [owner.id],
        )
      ).rowCount,
    ).toBe(0);
    release();
    expect((await login).status).toBe(200);
    await erasing;
    expect(
      (
        await services.pool.query('SELECT 1 FROM session WHERE "userId"=$1', [
          owner.id,
        ])
      ).rowCount,
    ).toBe(0);
    expect(await recoverAccountErasure(services.pool, receipt)).toBe(
      'complete',
    );
  } finally {
    release();
    await Promise.allSettled([login, ...(erasing ? [erasing] : [])]);
    spy.mockRestore();
  }
});

it('previews pending SQL without applying it and rejects changed migration checksums', async () => {
  const directory = await mkdtemp(tmpdir() + '/fats-d2-migrations-');
  try {
    await cp(
      new URL('../../apps/web/migrations/', import.meta.url),
      directory,
      { recursive: true },
    );
    const marker = 'd2_' + randomUUID().replaceAll('-', '');
    await writeFile(
      directory + '/0012_dtwo_probe.sql',
      `CREATE TABLE ${marker}(id integer);`,
    );
    const plan = await previewMigrations(
      services.pool,
      pathToFileURL(directory + '/'),
    );
    expect(plan.applied).toHaveLength(11);
    expect(plan.pending).toEqual(['0012_dtwo_probe.sql']);
    expect(
      (await services.pool.query('SELECT to_regclass($1) AS name', [marker]))
        .rows[0].name,
    ).toBeNull();
    await writeFile(
      directory + '/0001_auth.sql',
      '-- changed synthetic checksum',
    );
    await expect(
      previewMigrations(services.pool, pathToFileURL(directory + '/')),
    ).rejects.toThrow('differ');
    await Promise.all([
      runMigrations(services.pool),
      runMigrations(services.pool),
    ]);
    expect((await previewMigrations(services.pool)).pending).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
