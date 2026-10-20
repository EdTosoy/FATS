import { defineConfig } from '@playwright/test';
import account from './playwright.account.config';
import { browserTestPort } from './tests/helpers/browser-origin';

if (process.env.NODE_ENV === 'production' || browserTestPort !== 3000)
  throw new Error(
    'The synthetic product rehearsal is development-only and requires free loopback port 3000 for the unchanged Sidekick bridge.',
  );

if (process.env.FATS_PREPARE_DEMO === '1') {
  const database = new URL(process.env.FATS_TEST_DATABASE_URL!);
  if (
    database.hostname !== '127.0.0.1' ||
    database.port !== '16432' ||
    database.pathname !== '/fats_phase4_test' ||
    database.username !== 'fats_test'
  )
    throw new Error(
      'Demo preparation requires the repository-owned dedicated test database.',
    );
}

export default defineConfig({
  ...account,
  testDir: './tests/product-e2e',
  outputDir: '.fats-private/product-integration-evidence',
  timeout: 180000,
  // Registration/verification requests contain secrets. Keep screenshots only.
  use: { ...account.use, trace: 'off' },
});
