import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createDatabasePool,
  createServices,
} from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import {
  handleAuth,
  handleWorkspace,
} from '../../apps/web/src/server/handlers';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import type { AccountEmail } from '../../apps/web/src/server/account-email';

const connection = process.env.FATS_TEST_DATABASE_URL;
if (
  !connection ||
  !['127.0.0.1', 'localhost'].includes(new URL(connection).hostname) ||
  !new URL(connection).pathname.endsWith('_test')
)
  throw new Error('Use an explicitly isolated local test database.');
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-account-safety-passphrase!';
const messages: AccountEmail[] = [],
  owners: string[] = [];
let services: ReturnType<typeof createServices>;
beforeAll(async () => {
  const pool = createDatabasePool(connection);
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
  services = createServices(
    connection,
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
  await services.pool.end();
});
function call(
  path: string,
  body: unknown,
  cookie = '',
  extra: Record<string, string> = {},
) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    }),
    services,
  );
}
function workspace(cookie: string) {
  return handleWorkspace(
    new Request(origin + '/api/workspace', { headers: { origin, cookie } }),
    services,
  );
}
function cookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
}
function code(email: string) {
  const result = [...messages]
    .reverse()
    .find(
      (message) => message.to === email && message.subject.startsWith('Verify'),
    )
    ?.text.match(/code is (\d{8})/)?.[1];
  if (!result) throw new Error('Synthetic verification code missing.');
  return result;
}
async function registration() {
  const email = `safety-${randomUUID()}@example.test`;
  const response = await call('sign-up/email', {
    name: 'Safety Test',
    email,
    password,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect(response.headers.getSetCookie()).toHaveLength(0);
  const id = (
    await services.pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id as string;
  owners.push(id);
  return { email, id };
}
async function user() {
  const owner = await registration();
  expect(
    (
      await call('verify-email', {
        email: owner.email,
        code: code(owner.email),
      })
    ).status,
  ).toBe(200);
  const login = await call('sign-in/email', { email: owner.email, password });
  expect(login.status).toBe(200);
  return {
    ...owner,
    cookie: cookie(login),
    repository: new PostgresWorkspaceRepository(services.pool, owner.id),
  };
}
async function resetLink(email: string) {
  expect((await call('request-password-reset', { email })).status).toBe(200);
  const text = [...messages]
    .reverse()
    .find(
      (message) => message.to === email && message.subject.startsWith('Reset'),
    )!.text;
  const link = new URL(text.match(/https?:\/\/\S+/)![0]);
  expect(link.search).toBe('');
  expect(link.pathname).toBe('/reset-password');
  return new URLSearchParams(link.hash.slice(1)).get('token')!;
}
async function expire(identifier: string) {
  const context = await services.auth.$context;
  const record =
    await context.internalAdapter.findVerificationValue(identifier);
  expect(!!record).toBe(true);
  await services.pool.query(
    'UPDATE verification SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',
    [record!.id],
  );
}

it('keeps new/existing signup and login errors generic, with no session before verification', async () => {
  const owner = await registration();
  const duplicate = await call('sign-up/email', {
    name: 'Different name',
    email: owner.email,
    password,
  });
  expect(await duplicate.json()).toEqual({ success: true });
  expect(duplicate.headers.getSetCookie()).toHaveLength(0);
  const unverified = await call('sign-in/email', {
      email: owner.email,
      password,
    }),
    missing = await call('sign-in/email', {
      email: `missing-${randomUUID()}@example.test`,
      password,
    });
  expect(unverified.status).toBe(401);
  expect(missing.status).toBe(401);
  expect(await unverified.json()).toEqual(await missing.json());
  expect((await workspace('')).status).toBe(401);
});
it('hashes verification codes and identifiers, expires them, and never accepts replay or concurrent consumption twice', async () => {
  const owner = await registration();
  const context = await services.auth.$context;
  const stored = await context.internalAdapter.findVerificationValue(
    'email-verification-otp-' + owner.email,
  );
  expect(!!stored).toBe(true);
  expect(stored!.value.includes(code(owner.email))).toBe(false);
  expect(stored!.identifier.includes(owner.email)).toBe(false);
  await expire('email-verification-otp-' + owner.email);
  expect(
    (
      await call('verify-email', {
        email: owner.email,
        code: code(owner.email),
      })
    ).status,
  ).toBe(400);
  expect(
    (await call('send-verification-email', { email: owner.email })).status,
  ).toBe(200);
  const current = code(owner.email);
  const results = await Promise.all([
    call('verify-email', { email: owner.email, code: current }),
    call('verify-email', { email: owner.email, code: current }),
  ]);
  expect(results.map((row) => row.status).sort()).toEqual([200, 400]);
  expect(
    (await call('verify-email', { email: owner.email, code: current })).status,
  ).toBe(400);
  expect(
    (
      await services.pool.query(
        'SELECT "emailVerified" FROM "user" WHERE id=$1',
        [owner.id],
      )
    ).rows[0].emailVerified,
  ).toBe(true);
});
it('rotates resends, limits attempts and requests, and returns the same verification response for unknown mailboxes', async () => {
  const owner = await registration(),
    old = code(owner.email);
  const resend = await call('send-verification-email', { email: owner.email });
  expect(resend.status).toBe(200);
  const missing = await call('send-verification-email', {
    email: `missing-${randomUUID()}@example.test`,
  });
  expect(missing.status).toBe(200);
  expect(await missing.json()).toEqual(await resend.json());
  expect(
    (await call('verify-email', { email: owner.email, code: old })).status,
  ).toBe(400);
  const current = code(owner.email),
    wrong = current === '00000000' ? '11111111' : '00000000';
  for (let i = 0; i < 5; i++)
    expect(
      (await call('verify-email', { email: owner.email, code: wrong })).status,
    ).toBe(400);
  expect(
    (await call('verify-email', { email: owner.email, code: current })).status,
  ).toBe(400);
  expect(
    (await call('send-verification-email', { email: owner.email })).status,
  ).toBe(200);
  const limited = await call('send-verification-email', { email: owner.email });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBeTruthy();
});
it('blocks legacy unverified sessions at the workspace boundary without removing their records', async () => {
  const owner = await user();
  await owner.repository.create({
    title: 'Keep legacy data',
    company: 'Example',
    sourceUrl: 'https://example.test/legacy',
    location: 'Remote',
    description: '',
  });
  await services.pool.query(
    'UPDATE "user" SET "emailVerified"=false WHERE id=$1',
    [owner.id],
  );
  expect((await workspace(owner.cookie)).status).toBe(403);
  expect((await owner.repository.getWorkspace()).applications).toHaveLength(1);
  await call('send-verification-email', { email: owner.email });
  await call('verify-email', { email: owner.email, code: code(owner.email) });
  expect((await workspace(owner.cookie)).status).toBe(200);
});
it('keeps password requests generic and rate limited, and never exposes reset tokens in URLs or database identifiers', async () => {
  const owner = await user();
  const response = await call('request-password-reset', {
      email: owner.email,
      redirectTo: 'https://evil.test',
    }),
    missing = await call('request-password-reset', {
      email: `missing-${randomUUID()}@example.test`,
    });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(await missing.json());
  const token = await resetLink(owner.email);
  const stored = await (
    await services.auth.$context
  ).internalAdapter.findVerificationValue('reset-password:' + token);
  expect(!!stored).toBe(true);
  expect(stored!.identifier.includes(token)).toBe(false);
  expect(
    (await call('request-password-reset', { email: owner.email })).status,
  ).toBe(429);
});
it('rejects invalid/expired reset links without changing the password or revoking a valid session', async () => {
  const owner = await user(),
    token = await resetLink(owner.email);
  await expire('reset-password:' + token);
  for (const candidate of [token, 'invalid-token'])
    expect(
      (
        await call('reset-password', {
          token: candidate,
          newPassword: 'Synthetic-new-password-42!',
        })
      ).status,
    ).toBe(400);
  expect((await workspace(owner.cookie)).status).toBe(200);
  expect(
    (await call('sign-in/email', { email: owner.email, password })).status,
  ).toBe(200);
});
it('spends a reset token once, revokes every session for that account, and preserves other users and saved records', async () => {
  const a = await user(),
    b = await user(),
    second = await call('sign-in/email', { email: a.email, password });
  const saved = await a.repository.create({
    title: 'Account record',
    company: 'Example',
    sourceUrl: 'https://example.test/private',
    location: 'Remote',
    description: 'Keep this.',
  });
  const token = await resetLink(a.email),
    newPassword = 'Synthetic-reset-passphrase-43!';
  const results = await Promise.all([
    call('reset-password', { token, newPassword }),
    call('reset-password', { token, newPassword }),
  ]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 400]);
  expect((await workspace(a.cookie)).status).toBe(401);
  expect((await workspace(cookie(second))).status).toBe(401);
  expect((await workspace(b.cookie)).status).toBe(200);
  expect(
    (await call('sign-in/email', { email: a.email, password })).status,
  ).toBe(401);
  expect(
    (await call('sign-in/email', { email: a.email, password: newPassword }))
      .status,
  ).toBe(200);
  expect((await a.repository.getWorkspace()).applications).toEqual([saved]);
  expect((await b.repository.getWorkspace()).applications).toHaveLength(0);
  expect((await call('reset-password', { token, newPassword })).status).toBe(
    400,
  );
});
it('rolls password, token consumption and revocation back together after a real PostgreSQL update failure', async () => {
  const owner = await user(),
    token = await resetLink(owner.email),
    newPassword = 'Synthetic-retried-passphrase-44!';
  await services.pool.query(
    `CREATE FUNCTION phase41_reject_password() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId"='${owner.id}'::uuid THEN RAISE EXCEPTION 'synthetic update failure'; END IF; RETURN NEW; END $$`,
  );
  await services.pool.query(
    'CREATE TRIGGER phase41_reject_password BEFORE UPDATE ON account FOR EACH ROW EXECUTE FUNCTION phase41_reject_password()',
  );
  try {
    expect((await call('reset-password', { token, newPassword })).ok).toBe(
      false,
    );
    expect((await workspace(owner.cookie)).status).toBe(200);
    expect(
      (await call('sign-in/email', { email: owner.email, password })).status,
    ).toBe(200);
  } finally {
    await services.pool.query(
      'DROP TRIGGER phase41_reject_password ON account',
    );
    await services.pool.query('DROP FUNCTION phase41_reject_password()');
  }
  expect((await call('reset-password', { token, newPassword })).status).toBe(
    200,
  );
  expect((await workspace(owner.cookie)).status).toBe(401);
});
it('restricts origins and exposed authentication capabilities without leaking transport errors', async () => {
  expect(
    (
      await call(
        'send-verification-email',
        { email: 'unknown@example.test' },
        '',
        { origin: 'https://evil.test' },
      )
    ).status,
  ).toBe(403);
  for (const path of [
    'email-otp/get-verification-otp',
    'sign-in/email-otp',
    'change-email',
    'email-otp/request-password-reset',
  ])
    expect((await call(path, {})).status).toBe(404);
  const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failed = createServices(
    connection,
    origin,
    randomUUID() + randomUUID(),
    async () => {
      throw new Error('Private transport diagnostics must stay private');
    },
  );
  try {
    const response = await handleAuth(
      new Request(origin + '/api/auth/send-verification-email', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: (await registration()).email }),
      }),
      failed,
    );
    expect(response.status).toBe(200);
    expect(logs).toHaveBeenCalled();
    expect(
      logs.mock.calls.every(
        (args) =>
          args.length === 1 &&
          args[0] ===
            'FATS account email delivery is unavailable. Request a new message.',
      ),
    ).toBe(true);
  } finally {
    logs.mockRestore();
    await failed.pool.end();
  }
});
