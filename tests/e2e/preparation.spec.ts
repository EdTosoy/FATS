import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
  savePreparationJob,
  addMaterial,
  material,
  completePreparationJourney,
} from '../helpers/preparation';

test('preparation materials save, copy, record submission, revise and delete without altering tracking', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await completePreparationJourney(page);
  await page.screenshot({
    path: info.outputPath('preparation.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('failed guest save keeps unsaved text and previously saved preparation available for retry', async ({
  page,
}) => {
  await savePreparationJob(page);
  await addMaterial(page);
  const raw = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  await material(page, 'Targeted cover letter')
    .getByRole('button', { name: 'Edit material', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Material text', { exact: true })
    .fill('Keep this unsaved revision');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (
      window as unknown as { restorePreparationStorage: () => void }
    ).restorePreparationStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fats.applications.v1')
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('could not be saved');
  await expect(dialog.getByLabel('Material text', { exact: true })).toHaveValue(
    'Keep this unsaved revision',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
  await page.evaluate(() =>
    (
      window as unknown as { restorePreparationStorage: () => void }
    ).restorePreparationStorage(),
  );
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    material(page, 'Targeted cover letter').getByText(
      'Keep this unsaved revision',
      { exact: true },
    ),
  ).toBeVisible();
});
test('a preparation editor preserves its draft when another tab saves a newer revision', async ({
  page,
  context,
}) => {
  await savePreparationJob(page);
  await addMaterial(page);
  const url = page.url();
  await material(page, 'Targeted cover letter')
    .getByRole('button', { name: 'Edit material', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Material text', { exact: true })
    .fill('My pending revision');
  const other = await context.newPage();
  await other.goto(url);
  await material(other, 'Targeted cover letter')
    .getByRole('button', { name: 'Edit material', exact: true })
    .click();
  const second = other.getByRole('dialog');
  await second
    .getByLabel('Material text', { exact: true })
    .fill('Newer saved revision');
  await second
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(second).not.toBeVisible();
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'changed in another tab',
  );
  await expect(dialog.getByLabel('Material text', { exact: true })).toHaveValue(
    'My pending revision',
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!)
          .applications[0].preparations[0].text,
    ),
  ).toBe('Newer saved revision');
  page.once('dialog', (dialog) => dialog.accept());
  await dialog
    .getByRole('button', { name: 'Cancel editing', exact: true })
    .click();
});

test('JSON backup retains preparation text and warns before replacement by a legacy backup', async ({
  page,
}) => {
  await savePreparationJob(page);
  await addMaterial(page);
  await material(page, 'Targeted cover letter')
    .getByRole('button', { name: 'Record submitted copy', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Preparation', exact: true })
    .getByRole('button', { name: 'Confirm submitted copy', exact: true })
    .click();
  await expect(
    material(page, 'Targeted cover letter').getByText('Submitted', {
      exact: true,
    }),
  ).toBeVisible();
  const applicationUrl = page.url();
  await page.goto('/settings');
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('No downloaded backup');
  const text = await readFile(path, 'utf8'),
    backup = JSON.parse(text);
  expect(backup.data.applications[0].preparations[0].submitted.text).toContain(
    'My original cover letter.',
  );
  await page.getByLabel('Choose JSON backup', { exact: true }).setInputFiles({
    name: 'preparation-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await page
    .getByRole('button', { name: 'Preview backup', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    'Backup preparation materials: 1. Current preparation materials: 1.',
  );
  await dialog.getByRole('checkbox').check();
  await dialog
    .getByRole('button', { name: 'Replace workspace', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.goto(applicationUrl);
  await expect(
    material(page, 'Targeted cover letter').getByText('Submitted', {
      exact: true,
    }),
  ).toBeVisible();
  delete backup.data.applications[0].preparations;
  await page.goto('/settings');
  await page.getByLabel('Choose JSON backup', { exact: true }).setInputFiles({
    name: 'legacy-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole('button', { name: 'Preview backup', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    'Backup preparation materials: 0. Current preparation materials: 1.',
  );
  await expect(dialog).toContainText(
    'Replacement removes the current preparation materials',
  );
  await dialog
    .getByRole('button', { name: 'Cancel import', exact: true })
    .click();
  await page.goto(applicationUrl);
  await expect(
    material(page, 'Targeted cover letter').getByText('Submitted', {
      exact: true,
    }),
  ).toBeVisible();
});
