import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';
import { completePreparationJourney, material } from '../helpers/preparation';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
test.afterAll(async () => {
  for (const id of owners)
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
});
test('account preparation persists privately and keeps revisions after an interrupted save', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `preparation-${randomUUID()}@example.test`,
    password = 'Synthetic-preparation-passphrase-42!';
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByLabel('Your name', { exact: true })
    .fill('Synthetic Preparation Graduate');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await completeAccountVerification(page, email, password);
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  owners.push((await (await page.request.get('/api/account')).json()).user.id);
  await completePreparationJourney(page);
  const before = (await (await page.request.get('/api/workspace')).json())
    .applications[0];
  expect(before.preparations).toHaveLength(5);
  expect(before.notes).toBe('Review company values before applying.');
  await material(page, 'Targeted cover letter')
    .getByRole('button', { name: 'Edit material', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Material text', { exact: true })
    .fill('My account revision');
  await page.route('**/api/workspace', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON()?.action === 'change-preparation'
    )
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Synthetic preparation save unavailable. Retry.',
        }),
      });
    else await route.continue();
  });
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Synthetic preparation save unavailable',
  );
  await expect(dialog.getByLabel('Material text', { exact: true })).toHaveValue(
    'My account revision',
  );
  expect(
    (await (await page.request.get('/api/workspace')).json()).applications[0],
  ).toEqual(before);
  await page.unroute('**/api/workspace');
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    material(page, 'Targeted cover letter').getByText('My account revision', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await page.screenshot({
    path: info.outputPath('account-preparation.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
