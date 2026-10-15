import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  [
    '/etc/profiles/per-user/edtosoy/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((path) => existsSync(path));

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, chromiumSandbox: true },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1100 },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @fats/web dev --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    // Guest regressions must never inherit a developer's database/origin.
    env: { DATABASE_URL: '', BETTER_AUTH_URL: '', BETTER_AUTH_SECRET: '' },
    timeout: 120000,
  },
});
