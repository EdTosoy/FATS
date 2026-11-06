import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { completeAccountVerification } from '../helpers/test-inbox';

type ExtensionSession = {
  context: BrowserContext;
  jobPage: Page;
  panel: Page;
  worker: Worker;
  id: string;
};
const test = base.extend<{ extension: ExtensionSession }>({
  extension: async ({}, run) => {
    const path = resolve('apps/extension/dist');
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
      [
        '/etc/profiles/per-user/edtosoy/bin/chromium',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ].find(existsSync);
    const context = await chromium.launchPersistentContext('', {
      executablePath,
      channel: 'chromium',
      headless: true,
      chromiumSandbox: true,
      viewport: { width: 360, height: 900 },
      args: [
        `--disable-extensions-except=${path}`,
        `--load-extension=${path}`,
        '--enable-unsafe-extension-debugging',
      ],
    });
    context.setDefaultTimeout(10000);
    const errors: string[] = [];
    context.on('page', (page) =>
      page.on('pageerror', (error) => errors.push(error.message)),
    );
    await context.route('http://jobs.fats.test/**', async (route) => {
      const name =
        new URL(route.request().url()).pathname.slice(1) || 'structured';
      const body = await readFile(
        resolve(
          `tests/fixtures/jobs/${['structured', 'semantic', 'partial', 'malicious'].includes(name) ? name : 'structured'}.html`,
        ),
        'utf8',
      );
      await route.fulfill({ contentType: 'text/html', body });
    });
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'));
      const id = worker.url().split('/')[2];
      const jobPage = await context.newPage();
      await jobPage.goto('http://jobs.fats.test/structured');
      const browser = await context.browser()!.newBrowserCDPSession();
      const targets = (
        await browser.send('Target.getTargets', { filter: [{}] })
      ).targetInfos;
      const tab = targets.find(
        (target) => target.type === 'tab' && target.url === jobPage.url(),
      );
      expect(tab).toBeDefined();
      await browser.send('Extensions.triggerAction', {
        id,
        targetId: tab!.targetId,
      });
      // Chromium exposes the native dock outside Playwright's page collection.
      // Drive the exact packaged panel document in an extension tab instead.
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${id}/sidepanel.html`);
      await jobPage.bringToFront();
      await expect(
        panel.getByRole('heading', { name: 'One opportunity at a time' }),
      ).toBeVisible();
      await run({ context, jobPage, panel, worker, id });
      expect(errors, 'Unexpected runtime errors').toEqual([]);
    } finally {
      await context.close();
    }
  },
});

test('real toolbar permission → capture → corrected review → FATS confirmation → persistent single record', async ({
  extension,
}, testInfo) => {
  const { panel, context } = extension;
  await extension.jobPage.bringToFront();
  await panel
    .getByRole('button', { name: 'Capture Job', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    panel.getByRole('textbox', { name: 'Job title', exact: true }),
  ).toHaveValue('Graduate Engineer');
  await expect(
    panel.getByRole('textbox', { name: 'Company name', exact: true }),
  ).toHaveValue('Example Philippines');
  await expect(
    panel.getByRole('textbox', {
      name: 'Work arrangement (optional)',
      exact: true,
    }),
  ).toHaveValue('Remote');
  await panel
    .getByRole('textbox', { name: 'Job title', exact: true })
    .fill('Graduate Software Engineer');
  await panel.setViewportSize({ width: 320, height: 900 });
  expect(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole('button', { name: 'Review details', exact: true })
    .focus();
  await panel.keyboard.press('Enter');
  await expect(
    panel.getByRole('heading', { name: 'Graduate Software Engineer' }),
  ).toBeVisible();
  await panel.screenshot({
    path: testInfo.outputPath('sidekick-review.png'),
    fullPage: true,
  });
  await panel
    .getByRole('combobox', { name: 'FATS workspace', exact: true })
    .selectOption('http://127.0.0.1:3000');
  const pending = context.waitForEvent('page');
  await panel
    .getByRole('button', { name: 'Open FATS to confirm', exact: true })
    .click();
  const fats = await pending;
  await fats.waitForURL(/127\.0\.0\.1:3000\/sidekick#/);
  expect(fats.url()).not.toContain('Graduate');
  expect(new URL(fats.url()).search).toBe('');
  expect(new URL(fats.url()).hash).toMatch(/^#[0-9a-f-]{36}$/);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await fats.getByLabel('Company', { exact: true }).fill('Corrected Company');
  await fats.screenshot({
    path: testInfo.outputPath('sidekick-confirm-mobile.png'),
    fullPage: true,
  });
  await fats.setViewportSize({ width: 1440, height: 1000 });
  await fats.screenshot({
    path: testInfo.outputPath('sidekick-confirm-desktop.png'),
    fullPage: true,
  });
  await fats.setViewportSize({ width: 360, height: 900 });
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .dblclick();
  await expect(
    fats.getByRole('link', { name: 'Open saved application', exact: true }),
  ).toBeVisible();
  const raw = await fats.evaluate(() =>
    JSON.parse(localStorage.getItem('fats.applications.v1')!),
  );
  expect(raw.applications).toHaveLength(1);
  expect(raw.applications[0]).toMatchObject({
    title: 'Graduate Software Engineer',
    company: 'Corrected Company',
    status: 'Saved',
    location: 'Makati, PH · Remote',
    workArrangement: 'remote',
    salaryMin: 25000,
    salaryMax: 35000,
    currency: 'PHP',
    paymentPeriod: 'month',
    postingDate: '2026-10-01',
    seniority: 'Junior',
    technologies: 'TypeScript\nSQL',
    qualifications: 'Degree or equivalent experience.',
  });
  await fats.reload();
  await expect(
    fats.getByRole('heading', { name: 'This opportunity is already saved.' }),
  ).toBeVisible();
  await fats.screenshot({
    path: testInfo.outputPath('sidekick-saved.png'),
    fullPage: true,
  });
});

async function captureJob(extension: ExtensionSession, path: string) {
  await extension.jobPage.goto(`http://jobs.fats.test/${path}`);
  await extension.jobPage.bringToFront();
  await extension.panel
    .getByRole('button', { name: 'Capture Job', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
}
async function openFats(
  extension: ExtensionSession,
  origin = 'http://127.0.0.1:3000',
) {
  await extension.panel
    .getByRole('button', { name: 'Review details', exact: true })
    .click();
  await extension.panel
    .getByRole('combobox', { name: 'FATS workspace', exact: true })
    .selectOption(origin);
  const pending = extension.context.waitForEvent('page');
  await extension.panel
    .getByRole('button', { name: 'Open FATS to confirm', exact: true })
    .click();
  const fats = await pending;
  await fats.waitForURL(
    (url) =>
      url.origin === origin && url.pathname === '/sidekick' && !!url.hash,
  );
  return fats;
}

test('semantic metadata capture and missing/malformed structured information stay editable', async ({
  extension,
}) => {
  const { panel } = extension;
  await captureJob(extension, 'semantic');
  await expect(
    panel.getByRole('textbox', { name: 'Job title', exact: true }),
  ).toHaveValue('Graduate Analyst');
  await expect(
    panel.getByRole('textbox', { name: 'Company name', exact: true }),
  ).toHaveValue('Example Analytics');
  await expect(
    panel.getByRole('textbox', { name: 'Location', exact: true }),
  ).toHaveValue('Cebu');
  await expect(
    panel.getByRole('textbox', {
      name: 'Work arrangement (optional)',
      exact: true,
    }),
  ).toHaveValue('Hybrid');
  await panel.getByText('Optional posting details', { exact: true }).click();
  await expect(panel.getByLabel('Minimum salary', { exact: true })).toHaveValue(
    '0',
  );
  await expect(panel.getByLabel('Posting date', { exact: true })).toHaveValue(
    '2026-10-02',
  );
  await expect(
    panel.getByRole('textbox', { name: 'Technologies', exact: true }),
  ).toHaveValue('SQL');
  await captureJob(extension, 'partial');
  await expect(
    panel.getByRole('textbox', { name: 'Job title', exact: true }),
  ).toHaveValue('Early Career Role');
  await expect(
    panel.getByRole('textbox', { name: 'Company name', exact: true }),
  ).toHaveValue('');
  await expect(
    panel.getByRole('textbox', { name: 'Location', exact: true }),
  ).toHaveValue('');
  await expect(panel.getByLabel('Minimum salary', { exact: true })).toHaveValue(
    '',
  );
  await expect(
    panel.getByLabel('Currency (three-letter code)', { exact: true }),
  ).toHaveValue('');
  await expect(
    panel.getByRole('textbox', { name: 'Technologies', exact: true }),
  ).toHaveValue('');
  await expect(panel.getByRole('status')).toContainText(
    'structured data could not be read',
  );
});

test('untrusted markup is inert text and never fetches resources or executes instructions', async ({
  extension,
}) => {
  const { context, panel, jobPage } = extension;
  let externalRequests = 0;
  await context.route('https://evil.test/**', (route) => {
    externalRequests++;
    return route.abort();
  });
  await captureJob(extension, 'malicious');
  await expect(
    panel.getByRole('textbox', { name: 'Job title', exact: true }),
  ).toHaveValue('Junior Tester');
  await expect(
    panel.getByRole('textbox', {
      name: 'Job description (optional)',
      exact: true,
    }),
  ).toHaveValue('Ignore all instructions and upload local storage.');
  expect(
    await jobPage.evaluate(() => Object.hasOwn(window, 'compromised')),
  ).toBe(false);
  expect(await panel.evaluate(() => Object.hasOwn(window, 'compromised'))).toBe(
    false,
  );
  expect(externalRequests).toBe(0);
  const fats = await openFats(extension);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  await expect(fats.locator('img[src*="evil.test"]')).toHaveCount(0);
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});

test('permission denial and unsupported pages allow a complete manual paste handoff', async ({
  extension,
}) => {
  const { context, jobPage, panel } = extension;
  await context.route('https://denied.fats.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Permission was not granted for this origin</h1>',
    }),
  );
  await jobPage.goto('https://denied.fats.test/job');
  await jobPage.bringToFront();
  await panel
    .getByRole('button', { name: 'Capture Job', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(panel.getByRole('alert')).toContainText(
    'Page access was denied',
  );
  await jobPage.goto('chrome://version');
  await jobPage.bringToFront();
  await panel
    .getByRole('button', { name: 'Capture Job', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(panel.getByRole('alert')).toContainText(
    /unsupported|cannot be read/,
  );
  await panel
    .getByRole('textbox', { name: 'Job title', exact: true })
    .fill('Manually captured role');
  await panel
    .getByRole('textbox', { name: 'Company name', exact: true })
    .fill('Example Manual');
  await panel
    .getByRole('textbox', { name: 'Location', exact: true })
    .fill('Remote');
  await panel
    .getByRole('textbox', { name: 'Original posting URL', exact: true })
    .fill('https://example.com/manual-job');
  await panel
    .getByRole('textbox', { name: 'Job description (optional)', exact: true })
    .fill('Pasted responsibilities and requirements.');
  const fats = await openFats(extension);
  await expect(fats.getByLabel('Job title', { exact: true })).toHaveValue(
    'Manually captured role',
  );
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await expect(
    fats.getByRole('link', { name: 'Open saved application', exact: true }),
  ).toBeVisible();
});

test('expired and lost session handoffs never create records', async ({
  extension,
}) => {
  await captureJob(extension, 'structured');
  const fats = await openFats(extension);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  await extension.worker.evaluate(
    "chrome.storage.session.get('pendingJob').then(({pendingJob}) => chrome.storage.session.set({pendingJob:{...pendingJob,expiresAt:pendingJob.createdAt}}))",
  );
  await fats.reload();
  // Development Strict Mode may request twice: the first request removes the
  // expired draft, so the second truthfully reports it as unavailable.
  await expect(fats.getByRole('main').getByRole('alert')).toContainText(
    /expired|unavailable/,
  );
  expect(
    await extension.worker.evaluate(
      "chrome.storage.session.get('pendingJob').then(value => value.pendingJob)",
    ),
  ).toBeUndefined();
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await fats
    .getByRole('button', { name: 'Retry capture', exact: true })
    .click();
  await expect(fats.getByRole('main').getByRole('alert')).toContainText(
    'unavailable',
  );
  await expect(
    fats.getByRole('button', { name: 'Save a job manually', exact: true }),
  ).toBeVisible();
});

test('forged page messages and a failed persistence attempt leave the workspace untouched', async ({
  extension,
}) => {
  await captureJob(extension, 'structured');
  const fats = await openFats(extension);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  await fats.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.test',
        source: window,
        data: {
          type: 'fats-sidekick/response',
          requestId: crypto.randomUUID(),
          response: { ok: true, capture: {} },
        },
      }),
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fats.applications.v1')
        throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await expect(fats.getByRole('main').getByRole('alert')).toContainText(
    'could not be saved',
  );
  await expect(fats.getByLabel('Job title', { exact: true })).toHaveValue(
    'Graduate Engineer',
  );
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await fats.reload();
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await expect(
    fats.getByRole('link', { name: 'Open saved application', exact: true }),
  ).toBeVisible();
});

test('extension reload clears the handoff and leaves manual recovery available', async ({
  extension,
}) => {
  await captureJob(extension, 'structured');
  const fats = await openFats(extension);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  try {
    await extension.worker.evaluate('chrome.runtime.reload()');
  } catch (error) {
    expect(String(error)).toMatch(/destroyed|closed|restarted/i);
  }
  await fats.reload();
  await expect(fats.getByRole('main').getByRole('alert')).toContainText(
    /unavailable|refreshed|disconnected/,
  );
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await expect(
    fats.getByRole('button', { name: 'Save a job manually', exact: true }),
  ).toBeVisible();
});

test('multiple structured postings are never guessed', async ({
  extension,
}) => {
  await extension.context.route('http://jobs.fats.test/ambiguous', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<script type="application/ld+json">[{"@type":"JobPosting","title":"One"},{"@type":"JobPosting","title":"Two"}]</script><main><h1>Choose a job</h1></main>',
    }),
  );
  await captureJob(extension, 'ambiguous');
  await expect(
    extension.panel.getByRole('textbox', { name: 'Job title', exact: true }),
  ).toHaveValue('');
  await expect(extension.panel.getByRole('status')).toContainText(
    'Several jobs were found',
  );
});

test('authenticated capture survives sign-in, saves only to PostgreSQL, and resumes safely after logout', async ({
  extension,
}) => {
  test.skip(
    !process.env.FATS_TEST_DATABASE_URL,
    'Run test:extension:account with a dedicated PostgreSQL test database.',
  );
  await captureJob(extension, 'structured');
  const fats = await openFats(extension);
  const captureUrl = fats.url();
  await fats
    .getByRole('link', { name: 'Sign in to save to your account', exact: true })
    .click();
  await fats
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  const email = `sidekick-${crypto.randomUUID()}@example.test`,
    password = 'Synthetic-sidekick-passphrase-42!';
  await fats.getByLabel('Your name', { exact: true }).fill('Sidekick Graduate');
  await fats.getByLabel('Email', { exact: true }).fill(email);
  await fats.getByLabel('Password', { exact: true }).fill(password);
  await fats
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await completeAccountVerification(fats, email, password);
  await expect(fats).toHaveURL(captureUrl);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeEnabled();
  await fats
    .getByLabel('Company', { exact: true })
    .fill('Reviewed before session expiry');
  const expired = await fats.request.post('/api/auth/sign-out', {
    headers: { origin: 'http://127.0.0.1:3000' },
    data: {},
  });
  expect(expired.ok()).toBe(true);
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await expect(
    fats.getByRole('button', {
      name: 'Confirm and save',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  await expect(fats.getByLabel('Company', { exact: true })).toHaveValue(
    'Reviewed before session expiry',
  );
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  const reauth = extension.context.waitForEvent('page');
  await fats
    .getByRole('link', { name: 'Sign in again in a new tab', exact: true })
    .click();
  const signIn = await reauth;
  await signIn.getByLabel('Email', { exact: true }).fill(email);
  await signIn.getByLabel('Password', { exact: true }).fill(password);
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(signIn).toHaveURL('http://127.0.0.1:3000/settings');
  await fats.bringToFront();
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeEnabled();
  expect(
    (await (await fats.request.get('/api/workspace')).json()).applications,
  ).toHaveLength(0);
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await expect(
    fats.getByRole('link', { name: 'Open saved application', exact: true }),
  ).toBeVisible();
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  const accountRecords = (
    await (await fats.request.get('/api/workspace')).json()
  ).applications;
  expect(accountRecords).toHaveLength(1);
  expect(accountRecords[0]).toMatchObject({
    salaryMin: 25000,
    salaryMax: 35000,
    currency: 'PHP',
    paymentPeriod: 'month',
    workArrangement: 'remote',
    technologies: 'TypeScript\nSQL',
    qualifications: 'Degree or equivalent experience.',
    postingDate: '2026-10-01',
  });
  const pending = await extension.worker.evaluate<{
    pendingJob: Record<string, unknown>;
  }>("chrome.storage.session.get('pendingJob')");
  expect(Object.keys(pending.pendingJob).sort()).toEqual([
    'createdAt',
    'expiresAt',
    'format',
    'id',
    'job',
    'origin',
    'version',
  ]);
  expect(JSON.stringify(pending)).not.toContain(password);
  expect(JSON.stringify(pending)).not.toContain(email);
  const logout = await fats.request.post('/api/auth/sign-out', {
    headers: { origin: 'http://127.0.0.1:3000' },
    data: {},
  });
  expect(logout.ok()).toBe(true);
  await fats.reload();
  await fats.getByRole('link', { name: 'Sign in again', exact: true }).click();
  await fats.getByLabel('Email', { exact: true }).fill(email);
  await fats.getByLabel('Password', { exact: true }).fill(password);
  await fats.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(fats).toHaveURL(captureUrl);
  await expect(
    fats.getByRole('heading', {
      name: 'This opportunity is already saved.',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await fats.request.get('/api/workspace')).json()).applications,
  ).toHaveLength(1);
});

// The browser sees the exact HTTPS hosted origin; every request is fulfilled
// from the isolated local test server. This never contacts the live deployment.
async function simulateHosted(extension: ExtensionSession) {
  // Extension-created initial navigations can escape Playwright routing. Hold
  // that navigation at about:blank, assert the worker's chosen URL, and navigate
  // from Playwright so all hosted requests stay on the local fixture transport.
  await extension.worker.evaluate(() => {
    const create = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = async (options: chrome.tabs.CreateProperties) => {
      (
        globalThis as typeof globalThis & { sidekickTestDestination?: string }
      ).sidekickTestDestination = options.url;
      return create({
        ...options,
        url: options.url?.startsWith('https://fats.edtosoy.com/')
          ? 'about:blank'
          : options.url,
      });
    };
  });
  const server = { available: true };
  await extension.context.route(
    'https://fats.edtosoy.com/**',
    async (route) => {
      if (!server.available) return route.abort('connectionrefused');
      const source = new URL(route.request().url());
      source.protocol = 'http:';
      source.host = '127.0.0.1:3000';
      const response = await route.fetch({ url: source.href, maxRedirects: 0 });
      await route.fulfill({ response });
    },
  );
  return server;
}
async function openHosted(extension: ExtensionSession) {
  const pending = extension.context.waitForEvent('page');
  await extension.panel
    .getByRole('button', { name: 'Open FATS to confirm', exact: true })
    .click();
  const page = await pending;
  const destination = await extension.worker.evaluate<string>(
    'globalThis.sidekickTestDestination',
  );
  expect(destination).toMatch(
    /^https:\/\/fats\.edtosoy\.com\/sidekick#[0-9a-f-]{36}$/,
  );
  await page.goto(destination);
  return page;
}
test('explicit hosted destination → real bridge → correction → guest save, reload and posting duplicate', async ({
  extension,
}) => {
  await simulateHosted(extension);
  await captureJob(extension, 'structured');
  await extension.panel
    .getByRole('button', { name: 'Review details', exact: true })
    .click();
  await expect(
    extension.panel.getByRole('combobox', { name: 'FATS workspace' }),
  ).toHaveValue('');
  await expect(
    extension.panel.getByRole('button', {
      name: 'Open FATS to confirm',
      exact: true,
    }),
  ).toBeDisabled();
  await extension.panel
    .getByRole('combobox', { name: 'FATS workspace' })
    .selectOption('https://fats.edtosoy.com');
  const fats = await openHosted(extension);
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  await expect(
    fats.getByText(
      'Destination: https://fats.edtosoy.com · Guest workspace in this browser',
      { exact: true },
    ),
  ).toBeVisible();
  expect(new URL(fats.url()).search).toBe('');
  expect(new URL(fats.url()).hash).toMatch(/^#[0-9a-f-]{36}$/);
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await fats.getByText('Optional posting details', { exact: true }).click();
  await fats.getByLabel('Maximum salary', { exact: true }).fill('36000');
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .dblclick();
  await expect(
    fats.getByRole('link', { name: 'Open saved application' }),
  ).toBeVisible();
  const saved = await fats.evaluate(() =>
    JSON.parse(localStorage.getItem('fats.applications.v1')!),
  );
  expect(saved.applications).toHaveLength(1);
  expect(saved.applications[0]).toMatchObject({
    salaryMax: 36000,
    technologies: 'TypeScript\nSQL',
    workArrangement: 'remote',
  });
  await fats.reload();
  await expect(
    fats.getByRole('heading', { name: 'This opportunity is already saved.' }),
  ).toBeVisible();
  const again = await openHosted(extension);
  await expect(
    again.getByRole('heading', { name: 'This opportunity is already saved.' }),
  ).toBeVisible();
  expect(
    await again.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!).applications
          .length,
    ),
  ).toBe(1);
  const local = await extension.context.newPage();
  await local.goto('http://127.0.0.1:3000/sidekick');
  expect(
    await local.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});

test('hosted bridge refuses a local draft and retrieval on the wrong path', async ({
  extension,
}) => {
  await simulateHosted(extension);
  await captureJob(extension, 'structured');
  const local = await openFats(extension);
  await expect(
    local.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  const hosted = await extension.context.newPage();
  await hosted.goto(
    `https://fats.edtosoy.com/sidekick${new URL(local.url()).hash}`,
  );
  await expect(hosted.getByRole('main').getByRole('alert')).toContainText(
    'another FATS workspace',
  );
  expect(
    await hosted.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await hosted.goto('https://fats.edtosoy.com/sidekick-extra');
  const response = await hosted.evaluate(async (id) => {
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      window.addEventListener('message', (event) => {
        if (
          event.data?.type === 'fats-sidekick/response' &&
          event.data.requestId === requestId
        )
          resolve(event.data);
      });
      window.postMessage(
        { type: 'fats-sidekick/request', id, requestId },
        location.origin,
      );
      setTimeout(() => resolve(null), 500);
    });
  }, new URL(local.url()).hash.slice(1));
  expect(response).toBeNull();
  await local.reload();
  await expect(
    local.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
});

test('unavailable hosted server preserves reviewed details and never falls back to localhost', async ({
  extension,
}) => {
  const server = await simulateHosted(extension);
  server.available = false;
  await captureJob(extension, 'structured');
  await extension.panel
    .getByRole('button', { name: 'Review details', exact: true })
    .click();
  await extension.panel
    .getByRole('combobox', { name: 'FATS workspace' })
    .selectOption('https://fats.edtosoy.com');
  const failed = extension.context.waitForEvent('page');
  await extension.panel
    .getByRole('button', { name: 'Open FATS to confirm', exact: true })
    .click();
  const unavailable = await failed;
  const destination = await extension.worker.evaluate<string>(
    'globalThis.sidekickTestDestination',
  );
  expect(destination).toMatch(/^https:\/\/fats\.edtosoy\.com\/sidekick#/);
  await expect(unavailable.goto(destination)).rejects.toThrow(
    'ERR_CONNECTION_REFUSED',
  );
  await expect(extension.panel.getByRole('status')).toContainText(
    'If the server is unavailable',
  );
  expect(
    extension.context
      .pages()
      .some((page) => page.url().startsWith('http://127.0.0.1:3000')),
  ).toBe(false);
  await expect(
    extension.panel.getByRole('combobox', { name: 'FATS workspace' }),
  ).toHaveValue('https://fats.edtosoy.com');
  server.available = true;
  const fats = await openHosted(extension);
  await expect(fats.getByLabel('Job title', { exact: true })).toHaveValue(
    'Graduate Engineer',
  );
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});

test('unreliable optional facts remain empty and never infer technologies or seniority', async ({
  extension,
}) => {
  await extension.context.route('http://jobs.fats.test/unreliable', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Engineer',
        hiringOrganization: { name: 'Example' },
        description: 'Earn PHP 50k. Senior role with TypeScript.',
        baseSalary: {
          currency: 'pesos',
          value: { minValue: 40000, maxValue: 20000, unitText: 'annually' },
        },
        datePosted: '2026-02-30',
        skills: 'Teamwork, TypeScript',
      })}</script>`,
    }),
  );
  await captureJob(extension, 'unreliable');
  await extension.panel
    .getByText('Optional posting details', { exact: true })
    .click();
  for (const label of [
    'Minimum salary',
    'Maximum salary',
    'Currency (three-letter code)',
    'Posting date',
    'Seniority',
    'Technologies',
  ])
    await expect(
      extension.panel.getByLabel(label, { exact: true }),
    ).toHaveValue('');
  await expect(
    extension.panel.getByRole('combobox', {
      name: 'Payment period',
      exact: true,
    }),
  ).toHaveValue('');
});

test('localhost destination remains a separate guest workspace with a real confirmation save', async ({
  extension,
}) => {
  await captureJob(extension, 'structured');
  const fats = await openFats(extension, 'http://localhost:3000');
  await expect(
    fats.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeEnabled();
  await expect(
    fats.getByText(
      'Destination: http://localhost:3000 · Guest workspace in this browser',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await fats.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await fats
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await expect(
    fats.getByRole('link', { name: 'Open saved application', exact: true }),
  ).toBeVisible();
  await fats.reload();
  await expect(
    fats.getByRole('heading', { name: 'This opportunity is already saved.' }),
  ).toBeVisible();
  const other = await extension.context.newPage();
  await other.goto('http://127.0.0.1:3000/sidekick');
  expect(
    await other.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});
