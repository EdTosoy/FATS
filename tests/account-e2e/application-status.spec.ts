import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';

const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
test.afterAll(async () => {
  for (const id of owners)
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
});

test('account status saves beside the posting and recovers from an interrupted write in both themes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `status-${randomUUID()}@example.test`;
  const password = 'Synthetic-status-passphrase-42!';
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByLabel('Your name', { exact: true })
    .fill('Synthetic Graduate');
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
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Job title/).fill('Graduate Developer');
  await form.getByLabel(/^Company/).fill('Example Company');
  await form.getByLabel(/^Location/).fill('Makati');
  await form.getByLabel(/^Source URL/).fill('https://example.test/job');
  await form.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Graduate Developer', exact: true }),
  ).toBeVisible();
  const control = page.getByRole('combobox', {
    name: 'Application status',
    exact: true,
  });
  const tracking = page.locator('.application-status');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await control.selectOption('Saved');
    await expect(control).toBeEnabled();
    await page.reload();
    await expect(control).toHaveValue('Saved');
    await page.evaluate(() => scrollTo(0, 0));
    const box = (await control.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await control.selectOption('Applied');
    await expect(tracking.getByRole('status')).toHaveText(
      'Status updated to Applied.',
    );
    await page.reload();
    await expect(control).toHaveValue('Applied');
    const raw = await (await page.request.get('/api/workspace')).json();
    await page.route('**/api/workspace', async (route) => {
      if (
        route.request().method() === 'POST' &&
        route.request().postDataJSON()?.action === 'update'
      ) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Synthetic status save unavailable. Retry.',
          }),
        });
      } else await route.continue();
    });
    await control.selectOption('Assessment');
    await expect(tracking.getByRole('alert')).toHaveText(
      'Synthetic status save unavailable. Retry.',
    );
    await expect(control).toHaveValue('Applied');
    await expect(tracking.getByRole('status')).toHaveText(
      'Status is still Applied.',
    );
    expect(
      (await (await page.request.get('/api/workspace')).json()).applications,
    ).toEqual(raw.applications);
    await page.unroute('**/api/workspace');
    await control.selectOption('Assessment');
    await expect(tracking.getByRole('status')).toHaveText(
      'Status updated to Assessment.',
    );
    await expect(tracking.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(control).toHaveValue('Assessment');
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBeNull();
    await page.screenshot({
      path: info.outputPath(`account-${colorScheme}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
