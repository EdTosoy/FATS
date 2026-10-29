import { defineConfig } from '@playwright/test';
import account from './playwright.account.config';

const server = account.webServer;
if (!server || Array.isArray(server))
  throw new Error(
    'Hosted account checks require the single isolated account test server.',
  );

// Hosted-account regression: real local PostgreSQL/Mailpit, with server document
// storage absent as on Vercel. No network provider or hosted credentials are used.
export default defineConfig({
  ...account,
  testMatch: [
    '**/accounts.spec.ts',
    '**/recovery.spec.ts',
    '**/guest-continuity.spec.ts',
    '**/hosted-storage.spec.ts',
  ],
  webServer: {
    ...server,
    env: { ...server.env, FATS_DOCUMENTS_DIR: '' },
  },
});
