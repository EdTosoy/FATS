import { browserTestOrigin } from '../helpers/browser-origin';
import { test, expect, type Page } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { serializeBackup } from '@fats/domain';
import { portableOfferFixture } from '../helpers/portable-offer-fixture';
import { careerFixture } from '../helpers/career-fixture';
import { testEmail } from '../helpers/test-inbox';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
const origin = browserTestOrigin,
  password = 'Synthetic-career-browser-passphrase-42!',
  owners: string[] = [];
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!),
  storage = new FilesystemDocumentStorage(
    new URL('../../test-results/account-documents/', import.meta.url).pathname,
  );
test.afterAll(async () => {
  for (const id of owners) {
    const receipt = randomBytes(32).toString('hex');
    await beginAccountErasure(pool, id, receipt);
    expect(await recoverAccountErasure(pool, receipt, storage)).toBe(
      'complete',
    );
  }
  await pool.end();
});
async function register(page: Page) {
  const email = `career-browser-${randomUUID()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Synthetic Career Graduate' },
      })
    ).ok(),
  ).toBe(true);
  const message = await testEmail(email, 'Verify your FATS email');
  expect(
    (
      await page.request.post('/api/auth/verify-email', {
        headers: { origin },
        data: { email, code: message.match(/code is (\d{8})/)![1] },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  const { user } = await (await page.request.get('/api/account')).json();
  owners.push(user.id);
  return user.id as string;
}
async function preview(page: Page, text: string) {
  await page.goto('/settings');
  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'synthetic-career.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await page
    .getByRole('button', { name: 'Preview backup', exact: true })
    .click();
  return page.getByRole('dialog');
}
async function confirm(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog
    .getByRole('button', { name: 'Import supported records', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
async function download(page: Page) {
  const promise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const stream = await (await promise).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}
test('records a first job and tracks requested/received documents with preserved drafts, history and no upload', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [],
    uploads: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'PUT')
      uploads.push(new URL(request.url()).pathname);
  });
  await register(page);
  await page.goto('/career-vault');
  await expect(
    page.getByText('Your first job is a beginning worth keeping.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add employment', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Add employment');
  await dialog
    .getByLabel('Employer name', { exact: true })
    .fill('Synthetic First Employer');
  await dialog
    .getByLabel('Job title', { exact: true })
    .fill('Graduate Assistant');
  await dialog
    .getByRole('combobox', { name: 'Employment status', exact: true })
    .selectOption('Current');
  await dialog.getByLabel('Start date', { exact: true }).fill('2026-01-12');
  await page.route('**/api/career-vault', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Synthetic save failure. Keep your inputs and retry.',
          }),
        })
      : route.continue(),
  );
  await dialog
    .getByRole('button', { name: 'Save employment', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('Keep your inputs');
  await expect(dialog.getByLabel('Employer name', { exact: true })).toHaveValue(
    'Synthetic First Employer',
  );
  expect(await (await page.request.get('/api/career-vault')).json()).toEqual(
    [],
  );
  await page.unroute('**/api/career-vault');
  await dialog
    .getByRole('button', { name: 'Save employment', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Graduate Assistant', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add document entry', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Document category', exact: true })
    .selectOption('Certificate of Employment (COE)');
  await dialog
    .getByRole('combobox', { name: 'Tracking status', exact: true })
    .selectOption('Requested');
  await dialog.getByText('Dates and notes (optional)', { exact: true }).click();
  await dialog.getByLabel('Requested on', { exact: true }).fill('2026-10-16');
  await dialog.getByLabel('Follow-up date', { exact: true }).fill('2026-10-23');
  await dialog
    .getByLabel('Document notes', { exact: true })
    .fill('Synthetic request to discuss with HR.');
  await dialog
    .getByRole('button', { name: 'Save document entry', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText('Tracking only — no file linked.', { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Download linked file/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /^Edit document entry/ }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Tracking status', exact: true })
    .selectOption('Received');
  await dialog.getByLabel('Issue date', { exact: true }).fill('2026-10-17');
  await dialog
    .getByLabel('Document notes', { exact: true })
    .fill('Synthetic paper copy received.');
  await dialog
    .getByRole('button', { name: 'Save document entry', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByText('Document history (2)', { exact: true }).click();
  await expect(
    page.getByText('Synthetic request to discuss with HR.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit employment', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Employment status', exact: true })
    .selectOption('Previous');
  await dialog.getByLabel('End date', { exact: true }).fill('2026-10-17');
  await dialog
    .getByLabel('Archive this employment, keeping its history')
    .check();
  await dialog
    .getByRole('button', { name: 'Save employment', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.screenshot({
    path: info.outputPath('career-register.png'),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Show employment records' })
    .selectOption('Archived');
  await page
    .getByRole('button', {
      name: 'Graduate Assistant at Synthetic First Employer',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Previous · Archived', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic paper copy received.', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open local PDF Tools' }),
  ).toHaveAttribute('href', '/resumes/pdf-tools');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toMatch(/Synthetic First Employer|Synthetic paper copy/);
  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
});
test('prefills an accepted offer without starting employment and ports employment/register history through Settings', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await register(page);
  await preview(page, serializeBackup(portableOfferFixture()));
  await confirm(page);
  await page.goto('/career-vault');
  await page
    .getByRole('button', { name: 'Add employment', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByText('Start with an accepted offer (optional)', { exact: true })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Accepted offer', exact: true })
    .selectOption({ value: 'portable-application' });
  await dialog
    .getByRole('button', { name: 'Use offer details', exact: true })
    .click();
  await expect(dialog.getByLabel('Employer name', { exact: true })).toHaveValue(
    'Synthetic Offer Employer',
  );
  await expect(
    dialog.getByRole('combobox', { name: 'Employment status', exact: true }),
  ).toHaveValue('Not started');
  await dialog
    .getByRole('button', { name: 'Save employment', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const sourceRecords = await (
    await page.request.get('/api/career-vault')
  ).json();
  expect(sourceRecords[0].details).toMatchObject({
    status: 'Not started',
    fromAcceptedOffer: true,
    applicationId: 'portable-application',
  });
  await page
    .getByRole('button', { name: 'Add document entry', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Document category', exact: true })
    .selectOption('BIR Form 2316');
  await dialog
    .getByRole('combobox', { name: 'Tracking status', exact: true })
    .selectOption('Not applicable');
  await dialog
    .getByRole('button', { name: 'Save document entry', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/settings');
  const exported = await download(page),
    backup = JSON.parse(exported);
  expect(backup.version).toBe(3);
  expect(backup.data.employments[0].events).toHaveLength(2);
  expect(backup.data.employments[0].events[1].details.documentVersionId).toBe(
    '',
  );
  expect(
    (
      await page.request.post('/api/auth/sign-out', {
        headers: { origin },
        data: {},
      })
    ).ok(),
  ).toBe(true);
  await register(page);
  dialog = await preview(page, exported);
  await expect(
    dialog.getByRole('region', { name: 'Career Vault import preview' }),
  ).toContainText('1 employment records in this backup · 1 to add');
  await page.screenshot({
    path: info.outputPath('career-import-preview.png'),
    fullPage: false,
  });
  await confirm(page);
  expect(await (await page.request.get('/api/career-vault')).json()).toEqual(
    backup.data.employments,
  );
  await page.goto('/career-vault');
  await page
    .getByRole('button', {
      name: 'Graduate Analyst at Synthetic Offer Employer',
      exact: true,
    })
    .click();
  await expect(page.getByText('Not started', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open linked application' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'BIR Form 2316', exact: true }),
  ).toBeVisible();
  dialog = await preview(page, exported);
  await expect(
    dialog.getByRole('region', { name: 'Career Vault import preview' }),
  ).toContainText('0 to add · 1 identical records to skip');
  await confirm(page);
  expect(
    (await (await page.request.get('/api/career-vault')).json())[0].events,
  ).toHaveLength(2);
});
test('restores file provenance without a download link and blocks conflicting Career Vault history', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await register(page);
  const fixture = careerFixture(),
    text = serializeBackup(fixture);
  let dialog = await preview(page, text);
  await expect(
    dialog.getByRole('region', { name: 'Career Vault import preview' }),
  ).toContainText('1 historical file references will remain unlinked');
  await confirm(page);
  await page.goto('/career-vault');
  await page
    .getByRole('button', {
      name: 'Graduate Assistant at Synthetic Career Employer',
      exact: true,
    })
    .click();
  await expect(
    page
      .getByText(
        'Historical file reference from backup — no file was restored or linked.',
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Download linked file/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /^Edit document entry/ }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Tracking status', exact: true })
    .selectOption('Requested');
  await dialog
    .getByRole('button', { name: 'Save document entry', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const before = await (await page.request.get('/api/career-vault')).json();
  dialog = await preview(page, text);
  await expect(dialog.getByRole('alert')).toContainText('Career Vault:');
  await dialog.getByRole('checkbox').check();
  await expect(
    dialog.getByRole('button', { name: 'Import supported records' }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath('career-conflict.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  expect(await (await page.request.get('/api/career-vault')).json()).toEqual(
    before,
  );
});
