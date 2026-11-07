import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';
import { taskJourney } from '../helpers/task';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
test.afterAll(async () => {
  for (const id of owners)
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
});
test('account tasks persist without account content in localStorage', async ({
  page,
}) => {
  const email = `task-${randomUUID()}@example.test`,
    password = 'Synthetic-task-passphrase-42!';
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page.getByLabel('Your name', { exact: true }).fill('Task Graduate');
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
  await taskJourney(page);
  const rows = (await (await page.request.get('/api/workspace')).json())
    .applications;
  expect(rows[0].tasks).toHaveLength(2);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});
