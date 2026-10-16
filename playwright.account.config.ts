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
  testIgnore: '**/matching.spec.ts',
  outputDir: 'test-results/account',
  timeout: 45000,
  globalSetup: './tests/helpers/account-setup.ts',
  webServer: {
    ...web.webServer,
    command:
      process.env.FATS_TEST_PRODUCTION === '1'
        ? 'pnpm --filter @fats/web start --hostname 127.0.0.1 --port 3000'
        : 'pnpm --filter @fats/web dev --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: database,
      BETTER_AUTH_URL: 'http://127.0.0.1:3000',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      FATS_MAIL_PORT: '11025',
      FATS_AI_PROVIDER: '',
      FATS_AI_MATCHING_ENABLED: '0',
      OPENAI_API_KEY: '',
      FATS_AI_TEST_MODE: '',
      // Dedicated fail-closed browser cases must not inherit scanner credentials
      // or signatures from an operator's shell. Accepted-file journeys require
      // an explicitly configured scanner run and are recorded separately.
      FATS_CLAMAV_DATABASE_DIR:
        process.env.FATS_TEST_CLAMAV === '1'
          ? (process.env.FATS_CLAMAV_DATABASE_DIR ?? '')
          : '',
      FATS_DOCUMENTS_DIR: new URL(
        './test-results/account-documents/',
        import.meta.url,
      ).pathname,
    },
  },
});
