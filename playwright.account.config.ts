import { defineConfig } from '@playwright/test';
import web from './playwright.config';
const database = process.env.FATS_TEST_DATABASE_URL;
if (
  !database ||
  !['127.0.0.1', 'localhost'].includes(new URL(database).hostname) ||
  !new URL(database).pathname.endsWith('_test') ||
  !process.env.BETTER_AUTH_SECRET
)
  throw new Error(
    'Account browser tests require a dedicated local FATS_TEST_DATABASE_URL ending in _test and a private BETTER_AUTH_SECRET.',
  );
export default defineConfig({
  ...web,
  testDir: './tests/account-e2e',
  outputDir: 'test-results/account',
  timeout: 45000,
  globalSetup: './tests/helpers/account-setup.ts',
  webServer: {
    ...web.webServer,
    command: 'pnpm --filter @fats/web dev --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: database,
      BETTER_AUTH_URL: 'http://127.0.0.1:3000',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      FATS_MAIL_PORT: '11025',
    },
  },
});
