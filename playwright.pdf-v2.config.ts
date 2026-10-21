import { defineConfig } from '@playwright/test';
import base from './playwright.config';

if (process.env.FATS_TEST_PRODUCTION === '1')
  throw new Error('The V2 candidate is development-only.');

export default defineConfig(base, {
  testDir: './tests/pdf-v2-e2e',
  use: { trace: 'retain-on-failure' },
});
