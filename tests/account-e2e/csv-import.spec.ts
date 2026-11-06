import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';
import { completeCsvJourney } from '../helpers/csv-import';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
test.afterAll(async () => {
  for (const id of owners)
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
});
test('verified account imports CSV with R1 fields and prevents reimport after reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `csv-${randomUUID()}@example.test`,
    password = 'Synthetic-csv-passphrase-42!';
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByLabel('Your name', { exact: true })
    .fill('Synthetic CSV Graduate');
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
  await completeCsvJourney(page);
  const records = (await (await page.request.get('/api/workspace')).json())
    .applications;
  expect(records).toHaveLength(3);
  expect(
    records.find((row: { title: string }) => row.title === 'CSV Analyst')
      .applicationDate,
  ).toBeUndefined();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('account-csv-review.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
