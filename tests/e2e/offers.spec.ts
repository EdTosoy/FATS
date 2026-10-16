import { test, expect } from '@playwright/test';
test('guest Offer stage explains private-account requirements without storing offer data', async ({
  page,
}) => {
  const offerRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/offers')
      offerRequests.push(request.method());
  });
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Graduate role');
  await dialog.getByLabel(/^Company/).fill('Synthetic Guest Employer');
  await dialog.getByLabel(/^Location/).fill('Makati');
  await dialog
    .getByLabel(/^Source URL/)
    .fill('https://example.test/guest-offer');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await page.getByLabel('Application status').selectOption('Offer');
  const desk = page.locator('#offer-desk');
  await expect(
    desk.getByRole('link', { name: 'Sign in for Offer Desk' }),
  ).toBeVisible();
  await expect(
    desk.getByRole('button', { name: 'Record offer', exact: true }),
  ).not.toBeVisible();
  await page.reload();
  await expect(
    desk.getByRole('link', { name: 'Sign in for Offer Desk' }),
  ).toBeVisible();
  expect(offerRequests).toEqual([]);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fats.applications.v1')!),
  );
  expect(stored.applications[0].status).toBe('Offer');
  expect(stored).not.toHaveProperty('offers');
});
