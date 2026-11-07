import { expect, test } from '@playwright/test';

test('structured details and activity persist through editing and reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/applications');
  await page.getByRole('button', { name: 'Save your first job' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('R1 Graduate Engineer');
  await dialog.getByLabel(/^Company/).fill('Synthetic R1');
  await dialog.getByLabel(/^Location/).fill('Cebu');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/r1');
  await dialog.getByText('Job and application details (optional)').click();
  await dialog.getByLabel('Minimum salary').fill('25000');
  await dialog.getByLabel('Maximum salary').fill('35000');
  await dialog.getByLabel('Currency (three-letter code)').fill('PHP');
  await dialog.getByLabel('Payment period').selectOption('month');
  await dialog.getByLabel('Work arrangement').selectOption('remote');
  await dialog.getByLabel('Technologies').fill('TypeScript, PostgreSQL');
  await dialog
    .getByLabel('Required qualifications')
    .fill('Graduate degree or equivalent experience');
  await dialog.getByLabel('Application date').fill('2026-11-06');
  await dialog
    .getByLabel('Personal fit assessment notes')
    .fill('Strong learning opportunity');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'R1 Graduate Engineer', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Applied');
  await expect(
    page.getByText('Saved → Applied', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Activity type').selectOption('recruiter-response');
  await page.getByLabel('Activity date').fill('2026-11-07');
  await page
    .getByLabel('Activity notes')
    .fill('Recruiter requested availability');
  await page.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(
    page.getByText('Recruiter requested availability', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('TypeScript, PostgreSQL', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Recruiter requested availability', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await dialog.getByText('Job and application details (optional)').click();
  await expect(dialog.getByLabel('Minimum salary')).toHaveValue('25000');
  await dialog.getByLabel('Minimum salary').fill('');
  await dialog.getByLabel('Maximum salary').fill('');
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Recruiter requested availability', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('r1-detail.png'),
    fullPage: true,
  });
  await page.goto('/applications');
  await page.getByLabel('Filter by work arrangement').selectOption('onsite');
  await expect(page.getByText('No applications match just yet.')).toBeVisible();
  await page.getByLabel('Filter by work arrangement').selectOption('remote');
  await expect(
    page.getByRole('link', { name: 'R1 Graduate Engineer', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
