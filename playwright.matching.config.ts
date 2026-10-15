import { defineConfig } from '@playwright/test';
import account from './playwright.account.config';
const server = account.webServer;
if (!server || Array.isArray(server))
  throw new Error('Matching tests require the single account test server.');
export default defineConfig({
  ...account,
  testIgnore: [],
  testMatch: '**/matching.spec.ts',
  outputDir: 'test-results/matching',
  webServer: {
    ...server,
    env: {
      ...server.env,
      FATS_AI_PROVIDER: 'test-fixture',
      FATS_AI_TEST_MODE: '1',
      FATS_TEST_DATABASE_URL: process.env.FATS_TEST_DATABASE_URL!,
      FATS_AI_DAILY_ACCOUNT_LIMIT: '50',
      FATS_AI_DAILY_GLOBAL_LIMIT: '500',
    },
  },
});
