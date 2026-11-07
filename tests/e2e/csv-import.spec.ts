import { test, expect } from '@playwright/test';
import {
  prepareCsv,
  confirmCsv,
  completeCsvJourney,
  smallCsv,
} from '../helpers/csv-import';

test('CSV import maps, previews, reviews duplicates, confirms and prevents reimport', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await completeCsvJourney(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('csv-review.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('CSV preview is read-only, preserves drafts on storage failure and retries atomically', async ({
  page,
}) => {
  const section = await prepareCsv(page, smallCsv);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreCsvStorage: () => void }).restoreCsvStorage =
      () => {
        Storage.prototype.setItem = original;
      };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fats.applications.v1')
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await confirmCsv(page);
  await expect(section.getByRole('alert')).toContainText('could not be saved');
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await expect(
    section.getByLabel(/I reviewed the selected records/),
  ).toBeChecked();
  await page.evaluate(() =>
    (
      window as unknown as { restoreCsvStorage: () => void }
    ).restoreCsvStorage(),
  );
  await section
    .getByRole('button', { name: 'Confirm import (1)', exact: true })
    .click();
  await expect(section.getByRole('status')).toContainText(
    'Imported 1 applications; skipped 0',
  );
});
test('another tab changing the guest workspace invalidates a CSV preview', async ({
  page,
  context,
}) => {
  const section = await prepareCsv(page, smallCsv);
  const other = await context.newPage();
  await other.goto('/applications');
  await other
    .getByRole('button', { name: 'Save your first job', exact: true })
    .click();
  const dialog = other.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Concurrent job');
  await dialog.getByLabel(/^Company/).fill('Existing company');
  await dialog.getByLabel(/^Location/).fill('Cebu');
  await dialog
    .getByLabel(/^Source URL/)
    .fill('https://example.test/concurrent');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await confirmCsv(page);
  await expect(section.getByRole('alert')).toContainText(
    'changed since preview',
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!).applications
          .length,
    ),
  ).toBe(1);
  await section
    .getByRole('button', { name: 'Back to mapping', exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Preview records', exact: true })
    .click();
  await confirmCsv(page);
  await expect(section.getByRole('status')).toContainText(
    'Imported 1 applications',
  );
});
