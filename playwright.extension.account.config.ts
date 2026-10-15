import { defineConfig } from '@playwright/test';
import extension from './playwright.extension.config';
import account from './playwright.account.config';
export default defineConfig({
  ...extension,
  globalSetup: account.globalSetup,
  webServer: account.webServer,
  outputDir: 'test-results/account-extension',
  timeout: 45000,
});
