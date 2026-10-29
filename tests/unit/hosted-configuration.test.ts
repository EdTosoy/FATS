import { afterEach, expect, it, vi } from 'vitest';
import type { Pool } from '../../apps/web/node_modules/@types/pg';
import { createAccountMailer } from '../../apps/web/src/server/account-email';
import { authOptions } from '../../apps/web/src/server/auth-config';
import { databaseConnection } from '../../apps/web/src/server/database-config';
import { hostedMigrationTarget } from '../../apps/web/src/server/hosted-migration';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { attachDatabasePool } from '../../apps/web/node_modules/@vercel/functions';

vi.mock('../../apps/web/node_modules/@vercel/functions', () => ({
  attachDatabasePool: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const origin = 'https://fats.example.com';
const key = 're_synthetic_configuration_test';
const from = 'accounts@auth.example.com';
const host = 'ep-synthetic.ap-southeast-1.aws.neon.tech';
const connection = `postgresql://synthetic:synthetic@${host}/fats_preview?sslmode=verify-full`;

it('requires verified remote TLS, explicit direct migration targets and exact confirmation', () => {
  expect(databaseConnection(connection).local).toBe(false);
  expect(() =>
    databaseConnection(
      'postgresql://synthetic:synthetic@127.0.0.1/fats_test?host=remote.neon.tech',
    ),
  ).toThrow();
  for (const mode of ['disable', 'no-verify', 'prefer', 'require'])
    expect(() =>
      databaseConnection(connection.replace('verify-full', mode)),
    ).toThrow('verify-full');
  expect(() =>
    databaseConnection(connection + '&uselibpqcompat=true'),
  ).toThrow();
  for (const override of [
    'sslmode=no-verify',
    'ssl=false',
    'host=other.neon.tech',
    'database=other',
  ])
    expect(() => databaseConnection(connection + '&' + override)).toThrow();
  expect(
    hostedMigrationTarget(connection, host, 'fats_preview', undefined, true),
  ).toBe(connection);
  expect(
    hostedMigrationTarget(
      connection,
      host,
      'fats_preview',
      `MIGRATE ${host}/fats_preview`,
      false,
    ),
  ).toBe(connection);
  for (const [url, selectedHost, selectedDb, confirmation] of [
    [connection, host, 'other', `MIGRATE ${host}/other`],
    [connection, 'different.neon.tech', 'fats_preview', ''],
    [connection, host, 'fats_preview', undefined],
    [
      connection.replace('ep-synthetic.', 'ep-synthetic-pooler.'),
      host.replace('ep-synthetic.', 'ep-synthetic-pooler.'),
      'fats_preview',
      '',
    ],
    [
      connection.replace(host, 'postgres.example.com'),
      'postgres.example.com',
      'fats_preview',
      '',
    ],
  ])
    expect(() =>
      hostedMigrationTarget(url, selectedHost, selectedDb, confirmation, false),
    ).toThrow();
});

it('reuses bounded pools and attaches only Vercel runtime pools; no remote startup timeout is sent', async () => {
  const local = createDatabasePool(
    'postgresql://synthetic:synthetic@127.0.0.1/fats_test',
  );
  try {
    expect(attachDatabasePool).not.toHaveBeenCalled();
  } finally {
    await local.end();
  }
  vi.stubEnv('VERCEL', '1');
  const pool = createDatabasePool(connection);
  try {
    expect(attachDatabasePool).toHaveBeenCalledWith(pool);
    expect(pool.options.max).toBe(10);
    expect(pool.options.query_timeout).toBe(15000);
    expect(pool.options.statement_timeout).toBeUndefined();
    expect(pool.options.idleTimeoutMillis).toBe(5000);
  } finally {
    await pool.end();
  }
});

it('rejects unconfigured hosted mail and any hosted Mailpit fallback', () => {
  expect(() => createAccountMailer(origin, {})).toThrow('RESEND_API_KEY');
  expect(() =>
    createAccountMailer(origin, { FATS_MAIL_PROVIDER: 'mailpit' }),
  ).toThrow('loopback-only');
  expect(() =>
    createAccountMailer('http://localhost:3000', { VERCEL: '1' }),
  ).toThrow('loopback-only');
  for (const sender of [
    'onboarding@resend.dev',
    'accounts@example.test',
    'FATS <accounts@example.com>',
    'accounts@example.com\r\nBcc: leak@example.com',
  ])
    expect(() =>
      createAccountMailer(origin, {
        RESEND_API_KEY: key,
        FATS_MAIL_FROM: sender,
      }),
    ).toThrow();
});

it('sends only plain-text account mail to the fixed Resend endpoint with bounded HTTPS requests', async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id: 'synthetic-message' }));
  const message = {
    to: 'graduate@example.test',
    subject: 'Verify your FATS email',
    text: 'Synthetic code only.',
  };
  await createAccountMailer(
    origin,
    { RESEND_API_KEY: key, FATS_MAIL_FROM: from },
    send,
  )(message);
  expect(send).toHaveBeenCalledTimes(1);
  const [url, request] = send.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(request?.method).toBe('POST');
  expect(request?.redirect).toBe('error');
  expect(request?.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(String(request?.body))).toEqual({
    from: `FATS <${from}>`,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  });
});

it('sanitizes provider refusals, network failures and malformed success responses', async () => {
  const send = vi.fn<typeof fetch>();
  const mailer = createAccountMailer(
    origin,
    { RESEND_API_KEY: key, FATS_MAIL_FROM: from },
    send,
  );
  for (const response of [
    Response.json({ private: 'synthetic diagnostic' }, { status: 429 }),
    Response.json({}),
    new Response('invalid'),
  ]) {
    send.mockResolvedValueOnce(response);
    await expect(
      mailer({
        to: 'graduate@example.test',
        subject: 'Test',
        text: 'Synthetic',
      }),
    ).rejects.toThrow(/^FATS account email delivery is unavailable\.$/);
  }
  send.mockRejectedValueOnce(new Error('Synthetic private network failure'));
  await expect(
    mailer({ to: 'graduate@example.test', subject: 'Test', text: 'Synthetic' }),
  ).rejects.toThrow(/^FATS account email delivery is unavailable\.$/);
});

it('defers only delivery, preserves fragment reset links and narrowly trusts Vercel IPs', async () => {
  const tasks: (() => Promise<void>)[] = [];
  const send = vi.fn(async () => {});
  const options = authOptions(
    {} as Pool,
    origin,
    'synthetic-secret-'.repeat(4),
    send,
    { scheduleEmail: (task) => tasks.push(task), vercelProxy: true },
  );
  expect(options.advanced?.backgroundTasks).toBeUndefined();
  expect(options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
    'x-vercel-forwarded-for',
  ]);
  expect(options.trustedOrigins).toEqual([origin]);
  expect(options.advanced?.useSecureCookies).toBe(true);
  expect(options.session?.cookieCache?.enabled).toBe(false);
  const password = options.emailAndPassword;
  if (!password?.sendResetPassword) throw new Error('Reset callback missing.');
  await password.sendResetPassword({
    user: {
      id: 'synthetic',
      name: 'Synthetic',
      email: 'graduate@example.test',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    token: 'synthetic-reset',
    url: 'https://ignored.example',
  });
  expect(send).not.toHaveBeenCalled();
  expect(tasks).toHaveLength(1);
  await tasks[0]();
  expect(send).toHaveBeenCalledTimes(1);
});
