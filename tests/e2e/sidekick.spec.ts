import { test, expect } from '@playwright/test';

test('without Sidekick installed, the confirmation page offers truthful manual entry and persistence', async ({
  page,
}) => {
  await page.goto('/sidekick#01234567-1111-4111-8111-0123456789ab');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Sidekick is unavailable',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await page
    .getByRole('button', { name: 'Save a job manually', exact: true })
    .click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Job title/).fill('Manual opportunity');
  await form.getByLabel(/^Company/).fill('Example Manual');
  await form.getByLabel(/^Location/).fill('Remote');
  await form
    .getByLabel(/^Source URL/)
    .fill('https://example.com/manual-opportunity');
  await form
    .getByLabel(/^Job description/)
    .fill('Pasted details without depending on a job website.');
  await form.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Manual opportunity' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Manual opportunity' }),
  ).toBeVisible();
});

test('missing or forged handoffs never save records', async ({ page }) => {
  await page.goto('/sidekick');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Open FATS from Sidekick',
  );
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.test',
        source: window,
        data: {
          type: 'fats-sidekick/response',
          requestId: 'fake',
          response: { ok: true, capture: { format: 'fats-sidekick' } },
        },
      }),
    );
  });
  await expect(
    page.getByRole('button', { name: 'Confirm and save', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});
