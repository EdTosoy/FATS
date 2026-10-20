// Local synthetic rehearsal only. No seeding, reset, auth shortcut or scanner.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function fail() {
  console.error(
    'Demo startup refused. Use the dedicated loopback fats_phase4_test database on port 16432, a private auth secret, and a development shell. Run pnpm db:test:up first.',
  );
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') fail();
try {
  process.loadEnvFile('.env.phase4-test');
} catch {
  fail();
}
const database = process.env.FATS_TEST_DATABASE_URL;
try {
  const url = new URL(database);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '16432' ||
    url.pathname !== '/fats_phase4_test' ||
    url.username !== 'fats_test' ||
    !process.env.BETTER_AUTH_SECRET
  )
    fail();
} catch {
  fail();
}
const child = spawn(
  'pnpm',
  [
    '--filter',
    '@fats/web',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3000',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: database,
      BETTER_AUTH_URL: 'http://127.0.0.1:3000',
      FATS_MAIL_PORT: '11025',
      FATS_AI_MATCHING_ENABLED: '0',
      FATS_AI_PROVIDER: '',
      OPENAI_API_KEY: '',
      FATS_AI_TEST_MODE: '',
      FATS_CLAMAV_DATABASE_DIR: '',
      FATS_DOCUMENTS_DIR: resolve('test-results/account-documents'),
    },
  },
);
child.on('error', () => {
  console.error('Unable to start the local rehearsal server.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
