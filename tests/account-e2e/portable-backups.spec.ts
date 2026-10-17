import { browserTestOrigin } from '../helpers/browser-origin';
import { test as base, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { serializeBackup } from '@fats/domain';
import { portableOfferFixture } from '../helpers/portable-offer-fixture';
import { testEmail } from '../helpers/test-inbox';
import { createDatabasePool } from '../../apps/web/src/server/services';
const origin = browserTestOrigin,
  password = 'Synthetic-portable-passphrase-42!';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!),
  owners: string[] = [];
const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await run(page);
    expect(errors).toEqual([]);
  },
});
test.afterAll(async () => {
  for (const id of owners) {
    await pool.query('DELETE FROM offers WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await pool.end();
});
async function register(page: Page) {
  const email = `portable-${randomUUID()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Portable Graduate' },
      })
    ).ok(),
  ).toBe(true);
  const text = await testEmail(email, 'Verify your FATS email');
  expect(
    (
      await page.request.post('/api/auth/verify-email', {
        headers: { origin },
        data: { email, code: text.match(/code is (\d{8})/)![1] },
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
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Keep my existing application');
  await dialog.getByLabel(/^Company/).fill('Synthetic Current Employer');
  await dialog.getByLabel(/^Location/).fill('Makati');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/keep');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Keep my existing application',
      exact: true,
    }),
  ).toBeVisible();
  return user.id as string;
}
async function preview(page: Page, text: string) {
  await page.goto('/settings');
  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'portable.json',
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
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const file = await pending,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}
test('exports and restores offer history in the existing Settings flow, keeps saved jobs and exposes unavailable letters', async ({
  page,
}, info) => {
  const a = await register(page),
    fixture = serializeBackup(portableOfferFixture());
  let dialog = await preview(page, fixture);
  await expect(
    dialog.getByRole('heading', { name: 'Import this backup?' }),
  ).toBeVisible();
  await expect(dialog).toContainText('1 offers in this backup · 1 to add');
  await expect(dialog).toContainText(
    'Graduate Analyst · Synthetic Offer Employer',
  );
  await expect(dialog).toContainText('2 terms revisions · accepted');
  await expect(dialog).toContainText('1 document references');
  await expect(
    dialog.getByRole('button', {
      name: 'Import supported records',
      exact: true,
    }),
  ).toBeDisabled();
  expect((await (await page.request.get('/api/offers')).json()).length).toBe(0);
  await page.screenshot({
    path: info.outputPath('portable-preview.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Preview backup', exact: true }),
  ).toBeFocused();
  dialog = await preview(page, fixture);
  await confirm(page);
  const exported = await download(page),
    parsed = JSON.parse(exported);
  expect(parsed).toMatchObject({ format: 'fats-backup', version: 2 });
  expect(parsed.data.offers).toHaveLength(1);
  expect(parsed.data.offers[0].events).toHaveLength(5);
  expect(exported).not.toContain(a);
  expect(exported).not.toContain('storage_key');
  expect(parsed.data.offers[0].events[0]).toMatchObject({
    terms: { documentVersionId: '' },
    documentReference: expect.any(String),
  });
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
  await expect(dialog).toContainText('Current applications to keep');
  await confirm(page);
  await page.goto('/applications/portable-application');
  const desk = page.locator('#offer-desk');
  await expect(
    desk.getByText('Acceptance recorded', { exact: true }),
  ).toBeVisible();
  await expect(
    desk.getByText('PHP 38000 / monthly', { exact: true }).first(),
  ).toBeVisible();
  await desk.getByText('Offer history', { exact: true }).click();
  await expect(desk.getByText('Requested PHP 40000 monthly.')).toBeVisible();
  await desk
    .getByText('Terms and letter for this revision', { exact: true })
    .first()
    .click();
  await expect(
    desk.getByText(/Letter not included in the JSON backup/),
  ).toBeVisible();
  await expect(desk.getByRole('link', { name: /Download/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('portable-restored-offer.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(
    desk.getByText('Acceptance recorded', { exact: true }),
  ).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  expect(workspace.applications).toHaveLength(3);
  expect(workspace.interviews).toHaveLength(1);
  dialog = await preview(page, exported);
  await expect(dialog).toContainText('0 to add · 1 identical offers to skip');
  await confirm(page);
  expect(
    (await (await page.request.get('/api/offers')).json())[0].events,
  ).toHaveLength(5);
});
test('blocks changed decisions and malformed files, preserves existing data and permits retry after a failed import', async ({
  page,
}, info) => {
  await register(page);
  const text = serializeBackup(portableOfferFixture());
  let dialog = await preview(page, text);
  await page.route('**/api/workspace', (route) =>
    route.request().method() === 'POST' &&
    route.request().postDataJSON().action === 'restore'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Synthetic restore failure. Keep the preview and retry.',
          }),
        })
      : route.continue(),
  );
  await dialog.getByRole('checkbox').check();
  await dialog
    .getByRole('button', { name: 'Import supported records', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Synthetic restore failure',
  );
  expect(await (await page.request.get('/api/offers')).json()).toEqual([]);
  await page.unroute('**/api/workspace');
  await dialog
    .getByRole('button', { name: 'Import supported records', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    (
      await page.request.post('/api/offers', {
        headers: { origin },
        data: {
          applicationId: 'portable-application',
          baseVersion: 5,
          requestId: randomUUID(),
          command: {
            kind: 'decision',
            occurredOn: '2026-10-22',
            decision: 'declined',
            notes: 'Corrected decision',
            confirmed: true,
          },
        },
      })
    ).ok(),
  ).toBe(true);
  dialog = await preview(page, text);
  await expect(
    dialog.getByRole('heading', { name: 'Resolve conflicts before importing' }),
  ).toBeVisible();
  await dialog.getByRole('checkbox').check();
  await expect(
    dialog.getByRole('button', {
      name: 'Import supported records',
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath('portable-conflict.png'),
    fullPage: false,
  });
  await dialog
    .getByRole('button', { name: 'Cancel import', exact: true })
    .click();
  const malformed = portableOfferFixture();
  malformed.data.offers.push(malformed.data.offers[0]);
  await preview(page, JSON.stringify(malformed));
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'missing or duplicate application',
  );
  expect(
    (await (await page.request.get('/api/offers')).json())[0],
  ).toMatchObject({ state: 'declined', version: 6 });
});
