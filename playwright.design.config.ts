import { defineConfig } from '@playwright/test';
import base from './playwright.config';

if (process.env.FATS_TEST_PRODUCTION === '1') {
  throw new Error('Design prototypes are available only in development.');
}

export default defineConfig(base, {
  testDir: './tests/design-e2e',
  use: { trace: 'off' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'tablet',
      use: { viewport: { width: 1024, height: 900 }, hasTouch: true },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
