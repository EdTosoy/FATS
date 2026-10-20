import {
  test,
  expect,
  chromium,
  type Page,
  type TestInfo,
  type BrowserContext,
} from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { completeAccountVerification } from '../helpers/test-inbox';
import { pdfToolsFixture, pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { OFFER_CHECKLIST } from '@fats/domain';

const origin = 'http://127.0.0.1:3000';
const listingUrl = 'http://127.0.0.1:3400/synthetic-graduate.html';
const keepDemo = process.env.FATS_PREPARE_DEMO === '1';

async function register(page: Page, email: string, password: string) {
  await page.goto(origin + '/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByLabel('Your name', { exact: true })
    .fill('Alex Rivera (Synthetic)');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await completeAccountVerification(page, email, password);
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
}

async function capture(
  page: Page,
  context: BrowserContext,
  extensionId: string,
  info: TestInfo,
) {
  const listing = await context.newPage();
  await listing.goto(listingUrl);
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{}] });
  const tab = targetInfos.find(
    (target) => target.type === 'tab' && target.url === listingUrl,
  );
  expect(tab).toBeDefined();
  await cdp.send('Extensions.triggerAction', {
    id: extensionId,
    targetId: tab!.targetId,
  });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await listing.bringToFront();
  await panel
    .getByRole('button', { name: 'Capture Job', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(panel.getByLabel('Job title', { exact: true })).toHaveValue(
    'Graduate QA Associate',
  );
  await panel
    .getByRole('button', { name: 'Review details', exact: true })
    .click();
  await panel
    .getByRole('combobox', { name: 'FATS workspace', exact: true })
    .selectOption(origin);
  await panel.screenshot({
    path: info.outputPath('sidekick-review.png'),
    fullPage: true,
  });
  const pending = context.waitForEvent('page');
  await panel
    .getByRole('button', { name: 'Open FATS to confirm', exact: true })
    .click();
  const handoff = await pending;
  await expect(handoff).toHaveURL(/\/sidekick#[0-9a-f-]{36}$/);
  await expect(
    handoff.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toBeVisible();
  await snapshot(handoff, info, 'sidekick-confirm');
  expect(
    (await (await page.request.get(origin + '/api/workspace')).json())
      .applications,
  ).toHaveLength(1);
  await handoff
    .getByRole('button', { name: 'Confirm and save', exact: true })
    .click();
  await handoff
    .getByRole('link', { name: 'Open saved application', exact: true })
    .click();
  await expect(handoff).toHaveURL(/\/applications\/[^/#]+$/);
  await expect(
    handoff.getByRole('heading', {
      name: 'Graduate QA Associate',
      exact: true,
    }),
  ).toBeVisible();
  const captured = handoff.url();
  await page.goto(captured);
  await expect(
    page.getByRole('heading', { name: 'Graduate QA Associate', exact: true }),
  ).toBeVisible();
  await handoff.close();
  await panel.close();
  await listing.close();
  await cdp.detach();
  return captured;
}

async function snapshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('h1')).toHaveCount(1);
  const dialog = page.getByRole('dialog');
  const hasDialog = (await dialog.count()) > 0;
  if (hasDialog) {
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    for (const control of await dialog.getByRole('textbox').all())
      await expect(control).toHaveAccessibleName(/.+/);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath(name + '.png'),
    fullPage: !hasDialog,
  });
}

async function theme(page: Page, scheme: 'light' | 'dark') {
  await page.goto(origin + '/settings#appearance');
  await page
    .getByRole('radio', {
      name: scheme === 'light' ? 'Light' : 'Dark',
      exact: true,
    })
    .check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
}

async function download(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function erase(page: Page) {
  const { user } = await (
    await page.request.get(origin + '/api/account')
  ).json();
  const response = await page.request.post(origin + '/api/account', {
    headers: { origin, 'x-fats-account': user.id },
    data: {
      receipt: randomBytes(32).toString('hex'),
      confirmed: true,
      confirmation: 'DELETE MY ACCOUNT',
    },
  });
  expect(response.ok()).toBe(true);
}

test('synthetic graduate: verified onboarding → Sidekick → interviews → revised offer → explicit employment → local PDF → backup', async ({}, info) => {
  test.skip(
    keepDemo && info.project.name !== 'desktop',
    'Prepare one desktop demo account only.',
  );
  const extension = resolve('apps/extension/dist');
  const context = await chromium.launchPersistentContext('', {
    executablePath: info.project.use.launchOptions?.executablePath,
    channel: 'chromium',
    headless: true,
    chromiumSandbox: true,
    viewport:
      info.project.name === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--enable-unsafe-extension-debugging',
    ],
  });
  context.setDefaultTimeout(15000);
  const errors: string[] = [];
  const unexpectedOrigins = new Set<string>();
  const matchingCalls: string[] = [];
  context.on('page', (page) =>
    page.on('pageerror', (error) => errors.push(error.message)),
  );
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/matching') matchingCalls.push(request.method());
    if (
      url.protocol.startsWith('http') &&
      ![origin, new URL(listingUrl).origin].includes(url.origin)
    )
      unexpectedOrigins.add(url.origin);
  });
  await context.route(listingUrl, (route) =>
    route.fulfill({
      contentType: 'text/html',
      path: resolve('tests/fixtures/jobs/synthetic-graduate.html'),
    }),
  );
  const page = await context.newPage();
  const email = `alex-demo-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  let registered = false;
  let retain = false;
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const extensionId = worker.url().split('/')[2];
    await page.goto(origin + '/career-vault');
    await page
      .getByRole('link', { name: 'Sign in to use Career Vault', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Create an account', exact: true })
      .click();
    await page
      .getByLabel('Your name', { exact: true })
      .fill('Alex Rivera (Synthetic)');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await completeAccountVerification(page, email, password);
    registered = true;
    // The real sign-in must return to the feature that prompted it.
    await expect(page).toHaveURL(origin + '/career-vault');
    await page.goto(origin + '/settings');
    await page
      .getByRole('link', { name: 'Open your dashboard', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Hello, Alex.', exact: true }),
    ).toBeVisible();
    await snapshot(page, info, 'light-dashboard-empty');
    if (info.project.name === 'mobile') {
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
      await page
        .getByRole('navigation', { name: 'Mobile navigation', exact: true })
        .getByRole('link', { name: 'Applications', exact: true })
        .focus();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Open navigation', exact: true }),
      ).toBeFocused();
    }
    await page
      .getByRole('button', { name: 'Save your first job', exact: true })
      .click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Job title/).fill('Junior Data Analyst');
    await dialog.getByLabel(/^Company/).fill('Harborlight Labs (Synthetic)');
    await dialog.getByLabel(/^Location/).fill('Pasig · Hybrid');
    await dialog
      .getByLabel(/^Source URL/)
      .fill('https://example.test/harborlight/graduate-analyst');
    await dialog
      .getByLabel(/^Job description/)
      .fill(
        'Fictional fresh-graduate role. Turn survey data into clear reports; use spreadsheets, SQL, and teamwork. Training provided.',
      );
    await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Junior Data Analyst', exact: true }),
    ).toBeVisible();
    const applicationUrl = page.url();
    const applicationId = new URL(applicationUrl).pathname.split('/').pop()!;
    const capturedUrl =
      await test.step('Capture and confirm with the real Sidekick package', () =>
        capture(page, context, extensionId, info));
    await page.goto(applicationUrl);
    for (const stage of ['Applied', 'Assessment', 'Interview']) {
      await page
        .getByRole('combobox', { name: 'Application status', exact: true })
        .selectOption(stage);
      await expect(
        page.locator('.progress-card').getByRole('status'),
      ).toHaveText(`Status updated to ${stage}.`);
    }
    const interviewUrls: string[] = [];
    for (const [index, stage] of ['HR', 'Technical'].entries()) {
      await page.goto(applicationUrl);
      await page
        .getByRole('button', { name: 'Schedule interview', exact: true })
        .click();
      dialog = page.getByRole('dialog');
      await dialog
        .getByLabel(/^Interview title/)
        .fill(
          stage === 'HR'
            ? 'Getting to know the team'
            : 'Graduate project conversation',
        );
      await dialog
        .getByLabel('Interview stage', { exact: true })
        .selectOption(stage);
      await dialog.getByLabel(/^Date/).fill(`2026-10-${15 + index}`);
      await dialog.getByLabel(/^Time \(/).fill('10:00');
      await dialog.getByLabel(/^Timezone/).fill('Asia/Manila');
      await dialog
        .getByLabel('Meeting URL', { exact: true })
        .fill('https://example.test/harborlight/interview');
      await dialog
        .getByRole('button', { name: 'Save interview', exact: true })
        .click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        stage === 'HR'
          ? 'Getting to know the team'
          : 'Graduate project conversation',
      );
      interviewUrls.push(page.url());
      await page
        .getByLabel('Preparation notes', { exact: true })
        .fill(
          index === 0
            ? 'Explain our student survey project. Ask about training and the team.'
            : 'Walk through the SQL dashboard capstone and explain how I checked the results.',
        );
      await page
        .getByLabel('Post-interview reflections', { exact: true })
        .fill(
          index === 0
            ? 'Practised explaining my project clearly. HR described the graduate buddy system.'
            : 'Explained the capstone query and asked for feedback. Next time, pause before answering.',
        );
      await page
        .getByRole('button', { name: 'Save notes', exact: true })
        .click();
      await expect(page.getByRole('status')).toHaveText(
        'Your notes are saved.',
      );
      await page
        .getByRole('button', { name: 'Mark completed', exact: true })
        .click();
      await expect(page.getByRole('status')).toHaveText('Interview completed.');
    }
    await page.goto(origin + '/resumes');
    await page
      .getByRole('button', { name: 'Upload document', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    const resume = await pdfToolsLib.PDFDocument.create();
    const resumePage = resume.addPage();
    resumePage.drawText('SYNTHETIC RESUME - Alex Rivera', {
      x: 40,
      y: 780,
      size: 18,
    });
    resumePage.drawText(
      'BS Information Systems, 2026. Academic SQL dashboard project.',
      { x: 40, y: 745, size: 11 },
    );
    const resumeV1 = Buffer.from(await resume.save());
    resumePage.drawText(
      'Revision 2: clarified project outcomes and teamwork.',
      { x: 40, y: 715, size: 11 },
    );
    const resumeV2 = Buffer.from(await resume.save());
    await dialog
      .getByLabel('Document name', { exact: true })
      .fill('Alex - Graduate Resume');
    await dialog.getByLabel('Document file', { exact: true }).setInputFiles({
      name: 'alex-resume-v1-synthetic.pdf',
      mimeType: 'application/pdf',
      buffer: resumeV1,
    });
    const blockedUpload = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/documents') &&
        response.request().method() === 'PUT',
    );
    await dialog
      .getByRole('button', { name: 'Upload document', exact: true })
      .click();
    expect((await blockedUpload).status()).toBe(503);
    await expect(dialog.getByRole('alert')).toContainText(
      'Document safety checks are unavailable',
    );
    await expect(
      dialog.getByLabel('Document name', { exact: true }),
    ).toHaveValue('Alex - Graduate Resume');
    await snapshot(page, info, 'light-resume-safety-gate');
    await page.keyboard.press('Escape');
    expect(
      (await (await page.request.get(origin + '/api/documents')).json())
        .documents,
    ).toHaveLength(0);
    await page.goto(applicationUrl);
    await page
      .getByRole('combobox', { name: 'Application status', exact: true })
      .selectOption('Offer');
    await page
      .getByRole('button', { name: 'Record offer', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Date offer received (required)', { exact: true })
      .fill('2026-10-17');
    await dialog
      .getByText('Salary and benefits (optional)', { exact: true })
      .click();
    await dialog
      .getByLabel('Gross salary amount', { exact: true })
      .fill('28000');
    await dialog
      .getByRole('combobox', { name: 'Payment frequency', exact: true })
      .selectOption('monthly');
    await dialog
      .getByLabel('Benefits and allowances', { exact: true })
      .fill(
        'Fictional offer: HMO from day one; PHP 1,500 monthly transport allowance.',
      );
    await dialog
      .getByText('Work and important dates (optional)', { exact: true })
      .click();
    await dialog
      .getByLabel('Employment type', { exact: true })
      .fill('Full-time');
    await dialog
      .getByRole('combobox', { name: 'Work arrangement', exact: true })
      .selectOption('hybrid');
    await dialog.getByLabel('Work location', { exact: true }).fill('Pasig');
    await dialog
      .getByLabel('Proposed start date', { exact: true })
      .fill('2026-10-19');
    await dialog
      .getByLabel('Offer response deadline', { exact: true })
      .fill('2026-10-23');
    await dialog
      .getByRole('button', { name: 'Save offer', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('button', {
        name: 'Review checklist and HR questions',
        exact: true,
      })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByRole('combobox', { name: OFFER_CHECKLIST[0], exact: true })
      .selectOption('Reviewed');
    await dialog
      .getByRole('combobox', { name: OFFER_CHECKLIST[1], exact: true })
      .selectOption('Need to clarify');
    await dialog
      .getByLabel('Your questions for HR', { exact: true })
      .fill(
        'How does the graduate buddy program work? Which documents should I bring on my first day?',
      );
    await dialog
      .getByRole('button', { name: 'Save review', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Add negotiation note', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Negotiation note (required)', { exact: true })
      .fill(
        'Synthetic rehearsal: asked whether the base salary could be PHP 30000. No message sent by FATS.',
      );
    await dialog
      .getByRole('button', { name: 'Save negotiation note', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('button', {
        name: 'Record revised terms or letter',
        exact: true,
      })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Gross salary amount', { exact: true })
      .fill('30000');
    await dialog
      .getByRole('button', { name: 'Save revised terms', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await snapshot(page, info, 'light-offer-reviewing');
    await page
      .getByRole('button', { name: 'Record acceptance', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    expect(
      await dialog
        .getByRole('checkbox')
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
    ).toBe(false);
    await dialog.getByRole('checkbox').check();
    await dialog
      .getByRole('button', { name: 'Confirm: record acceptance', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(
      await (await page.request.get(origin + '/api/career-vault')).json(),
    ).toEqual([]);
    await page
      .getByRole('link', {
        name: 'Plan employment in Career Vault',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Add employment', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByText('Start with an accepted offer (optional)', { exact: true })
      .click();
    await dialog
      .getByLabel('Accepted offer', { exact: true })
      .selectOption(applicationId);
    await dialog
      .getByRole('button', { name: 'Use offer details', exact: true })
      .click();
    await expect(
      dialog.getByLabel('Employer name', { exact: true }),
    ).toHaveValue('Harborlight Labs (Synthetic)');
    await expect(
      dialog.getByLabel('Employment status', { exact: true }),
    ).toHaveValue('Not started');
    expect(
      await (await page.request.get(origin + '/api/career-vault')).json(),
    ).toEqual([]);
    await snapshot(page, info, 'light-employment-prefill');
    await dialog
      .getByRole('button', { name: 'Save employment', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Edit employment', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Employment status', { exact: true })
      .selectOption('Current');
    await dialog.getByLabel('Start date', { exact: true }).fill('2026-10-19');
    await dialog
      .getByRole('button', { name: 'Save employment', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Add document entry', exact: true })
      .click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Document category', { exact: true })
      .selectOption('Employment contract');
    await dialog
      .getByLabel('Tracking status', { exact: true })
      .selectOption('Requested');
    await dialog
      .getByText('Dates and notes (optional)', { exact: true })
      .click();
    await dialog.getByLabel('Requested on', { exact: true }).fill('2026-10-18');
    await dialog
      .getByLabel('Follow-up date', { exact: true })
      .fill('2026-10-20');
    await dialog
      .getByLabel('Document notes', { exact: true })
      .fill(
        'Synthetic onboarding question: which documents should I bring on my first day? No request was sent by FATS.',
      );
    await dialog
      .getByRole('button', { name: 'Save document entry', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: /^Edit document entry/ }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Tracking status', { exact: true })
      .selectOption('Received');
    await dialog.getByLabel('Issue date', { exact: true }).fill('2026-10-19');
    await dialog.getByLabel('Follow-up date', { exact: true }).fill('');
    await dialog
      .getByLabel('Document notes', { exact: true })
      .fill('Synthetic paper copy received. No file is stored in FATS.');
    await dialog
      .getByRole('button', { name: 'Save document entry', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const employments = await (
      await page.request.get(origin + '/api/career-vault')
    ).json();
    expect(employments).toHaveLength(1);
    expect(employments[0].details).toMatchObject({
      applicationId,
      status: 'Current',
      fromAcceptedOffer: true,
    });
    expect(
      employments[0].events.filter(
        (event: { kind: string }) => event.kind === 'document',
      ),
    ).toHaveLength(2);
    await snapshot(page, info, 'light-career-register');
    await page
      .getByRole('link', { name: 'Open local PDF Tools', exact: true })
      .click();
    const writes: string[] = [];
    const observePdf = (request: import('@playwright/test').Request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()))
        writes.push(request.method());
    };
    context.on('request', observePdf);
    const form = await pdfToolsFixture();
    await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
      name: 'synthetic-employment-form.pdf',
      mimeType: 'application/pdf',
      buffer: form,
    });
    await expect(
      page.getByRole('img', { name: 'PDF page 1', exact: true }),
    ).toHaveAttribute('data-rendered', 'true');
    await page
      .getByRole('textbox', { name: 'Full name', exact: true })
      .fill('Alex Rivera (Synthetic)');
    await page
      .getByRole('button', { name: 'Apply fields to preview', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Form fields updated' }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'PDF page 1', exact: true }),
    ).toHaveAttribute('data-rendered', 'true');
    await page
      .getByLabel('Text to add', { exact: true })
      .fill('Local synthetic rehearsal');
    await page
      .getByRole('button', { name: 'Add to page', exact: true })
      .click();
    const selectedMark = page.getByRole('region', {
      name: 'Selected mark',
      exact: true,
    });
    await selectedMark.getByLabel('Left', { exact: true }).fill('35');
    await selectedMark.getByLabel('Top', { exact: true }).fill('280');
    await expect(
      page.getByRole('img', { name: 'PDF page 1', exact: true }),
    ).toHaveAttribute('data-rendered', 'true');
    const editedPdf = await download(page, 'Download completed PDF');
    expect((await pdfToolsLib.PDFDocument.load(editedPdf)).getPageCount()).toBe(
      4,
    );
    expect(writes).toEqual([]);
    context.off('request', observePdf);
    await snapshot(page, info, 'light-pdf-edited');
    await page.goto(origin + '/settings');
    const backup = await download(page, 'Export backup');
    const activityBeforeBrowsing = (
      await (await page.request.get(origin + '/api/workspace')).json()
    ).activityDays;
    const exported = JSON.parse(backup.toString());
    expect(exported.version).toBe(3);
    expect(exported.data.applications).toHaveLength(2);
    expect(exported.data.interviews).toHaveLength(2);
    expect(exported.data.offers[0].events).toHaveLength(5);
    expect(exported.data.employments).toHaveLength(1);
    expect(
      exported.data.employments[0].events.every(
        (event: { documentReference: unknown }) =>
          event.documentReference === null,
      ),
    ).toBe(true);
    await page.getByLabel('Choose JSON backup', { exact: true }).setInputFiles({
      name: 'alex-synthetic-backup.json',
      mimeType: 'application/json',
      buffer: backup,
    });
    await page
      .getByRole('button', { name: 'Preview backup', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snapshot(page, info, 'light-backup-preview');
    await page.keyboard.press('Escape');
    expect(
      await (await page.request.get(origin + '/api/career-vault')).json(),
    ).toEqual(employments);
    const routes = [
      ['dashboard', '/'],
      ['applications', '/applications'],
      ['application-offer', new URL(applicationUrl).pathname + '#offer-desk'],
      ['interviews', '/interviews'],
      ['interview-notes', new URL(interviewUrls[1]).pathname],
      ['resumes', '/resumes'],
      ['career-vault', '/career-vault'],
      ['pdf-tools', '/resumes/pdf-tools'],
      ['settings', '/settings'],
      ['help', '/help'],
    ];
    for (const scheme of ['light', 'dark'] as const) {
      await theme(page, scheme);
      for (const [name, path] of routes) {
        await page.goto(origin + path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(
          page.getByText(/Loading your|Getting your workspace ready/),
        ).toHaveCount(0);
        if (name === 'pdf-tools') {
          await page
            .getByLabel('Choose a local PDF', { exact: true })
            .setInputFiles({
              name: 'synthetic-employment-form.pdf',
              mimeType: 'application/pdf',
              buffer: form,
            });
          await expect(
            page.getByRole('img', { name: 'PDF page 1', exact: true }),
          ).toHaveAttribute('data-rendered', 'true');
        }
        await snapshot(page, info, `${scheme}-${name}`);
        if (name === 'application-offer') {
          await page
            .getByRole('button', {
              name: 'Review checklist and HR questions',
              exact: true,
            })
            .click();
          await snapshot(page, info, `${scheme}-offer-dialog`);
          await page.keyboard.press('Escape');
        }
        if (name === 'career-vault') {
          await page
            .getByRole('button', {
              name: 'Junior Data Analyst at Harborlight Labs (Synthetic)',
              exact: true,
            })
            .click();
          await page.getByText('Document history (2)', { exact: true }).click();
          await snapshot(page, info, `${scheme}-career-register`);
          await page
            .getByRole('button', { name: 'Edit employment', exact: true })
            .click();
          await snapshot(page, info, `${scheme}-career-dialog`);
          await page.keyboard.press('Escape');
          await expect(
            page.getByRole('button', { name: 'Edit employment', exact: true }),
          ).toBeFocused();
        }
      }
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      (await (await page.request.get(origin + '/api/workspace')).json())
        .activityDays,
    ).toEqual(activityBeforeBrowsing);
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBeNull();
    expect(unexpectedOrigins.size).toBe(0);
    expect(matchingCalls).toEqual([]);
    expect(errors).toEqual([]);
    // Reimport through a second real verified account: no direct database seed.
    const recoveryPage = await context.newPage();
    await recoveryPage.goto(origin + '/settings');
    await recoveryPage
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
    await expect(
      recoveryPage.getByRole('link', {
        name: 'Sign in to an account',
        exact: true,
      }),
    ).toBeVisible();
    await register(
      recoveryPage,
      `alex-recovery-${randomUUID()}@example.test`,
      password,
    );
    await recoveryPage
      .getByLabel('Choose JSON backup', { exact: true })
      .setInputFiles({
        name: 'alex-synthetic-backup.json',
        mimeType: 'application/json',
        buffer: backup,
      });
    await recoveryPage
      .getByRole('button', { name: 'Preview backup', exact: true })
      .click();
    dialog = recoveryPage.getByRole('dialog');
    await dialog.getByRole('checkbox').check();
    await dialog
      .getByRole('button', { name: 'Import supported records', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(
      await (
        await recoveryPage.request.get(origin + '/api/career-vault')
      ).json(),
    ).toEqual(employments);
    await erase(recoveryPage);
    expect(
      (await recoveryPage.request.get(origin + '/api/workspace')).status(),
    ).toBe(401);
    await page.goto(origin + '/sign-in?next=%2Fresumes');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(origin + '/resumes');
    await expect(
      page.getByRole('heading', {
        name: 'Your resumes & documents',
        exact: true,
      }),
    ).toBeVisible();
    if (keepDemo) {
      const directory = resolve(
        '.fats-private/cofounder-demo',
        email.slice(0, -13),
      );
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await Promise.all([
        writeFile(
          resolve(directory, 'credentials.json'),
          JSON.stringify({ email, password, origin }, null, 2),
          { mode: 0o600 },
        ),
        writeFile(resolve(directory, 'alex-synthetic-backup.json'), backup, {
          mode: 0o600,
        }),
        writeFile(resolve(directory, 'alex-resume-v1-synthetic.pdf'), resumeV1),
        writeFile(resolve(directory, 'alex-resume-v2-synthetic.pdf'), resumeV2),
        writeFile(resolve(directory, 'synthetic-employment-form.pdf'), form),
        writeFile(
          resolve(directory, 'completed-synthetic-employment-form.pdf'),
          editedPdf,
        ),
        writeFile(
          resolve(directory, 'workspace.json'),
          JSON.stringify(
            {
              applicationUrl,
              capturedUrl,
              interviewUrls,
              employmentId: employments[0].id,
              limitation:
                'Resume versions are local files only. Required scanning blocks library intake.',
            },
            null,
            2,
          ),
        ),
      ]);
      await writeFile(
        resolve('.fats-private/cofounder-demo/latest.json'),
        JSON.stringify({ directory }, null, 2),
      );
      retain = true;
    }
  } finally {
    try {
      if (registered && !retain) {
        // Reauthenticate normally if a recovery-account check changed this session.
        const signIn = await page.request.post(
          origin + '/api/auth/sign-in/email',
          {
            headers: { origin },
            data: { email, password },
          },
        );
        expect(signIn.ok()).toBe(true);
        // Standard authenticated erasure, with no privileged cleanup or DB reset.
        await erase(page);
      }
    } finally {
      await context.close();
    }
  }
});
