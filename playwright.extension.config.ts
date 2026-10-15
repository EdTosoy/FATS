import { defineConfig } from '@playwright/test';
import web from './playwright.config';
export default defineConfig({
  ...web,
  testDir: './tests/extension',
  outputDir: 'test-results/extension',
  projects: [{ name: 'extension' }],
  timeout: 30000,
});
