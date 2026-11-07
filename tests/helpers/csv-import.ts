import { expect, type Page } from '@playwright/test';
export const csvHeaders = [
  'Company',
  'Job Title',
  'Location',
  'Job URL',
  'Status',
  'Salary',
  'Currency',
  'Pay Period',
  'Work Setup',
  'Seniority',
  'Toolkit',
  'Requirements',
  'Date Posted',
  'Last Checked',
  'Date Applied',
  'Applied Via',
  'Contact Name',
  'Contact Email',
  'Contact Phone',
  'Fit Notes',
  'Job Description',
  'Notes',
  'Ignore me',
];
const row = [
  'CSV, Labs',
  'CSV Engineer',
  'Cebu',
  'https://example.test/csv-engineer',
  'Submitted',
  '25,000–35,000',
  'PHP',
  'monthly',
  'WFH',
  'Graduate',
  'TypeScript, SQL',
  'Degree or equivalent',
  '2026-11-01',
  '2026-11-06',
  '06/11/2026',
  'Company website',
  'Test Recruiter',
  'recruiter@example.test',
  '+63 000',
  'Learning opportunity',
  'First line\nSecond line with "quotes"',
  'Private imported note',
  'Skipped extra',
];
const possible = [...row];
possible[3] = 'https://example.test/csv-other';
const conflict = [...row];
conflict[21] = 'Different note, same URL';
const invalid = [...row];
invalid[1] = '';
invalid[4] = 'Hired';
invalid[5] = '25k';
invalid[14] = '31/02/2026';
const other = [...row];
other[0] = 'Other CSV Company';
other[1] = 'CSV Analyst';
other[3] = 'https://example.test/csv-analyst';
other[4] = '';
other[14] = '';
const encode = (values: string[]) =>
  values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
export const csvFixture =
  '\uFEFF' +
  [csvHeaders, row, row, conflict, possible, invalid, other]
    .map(encode)
    .join('\r\n');
export const smallCsv =
  'Company,Title,Location,URL\nSmall CSV,Engineer,Cebu,https://example.test/small';
export async function prepareCsv(page: Page, text = csvFixture) {
  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'CSV Import' });
  await section.getByLabel('Choose CSV file').setInputFiles({
    name: 'sheet.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
  await section
    .getByRole('button', { name: 'Map columns', exact: true })
    .click();
  await expect(
    section.getByRole('heading', { name: '2. Map columns' }),
  ).toBeFocused();
  if (text === csvFixture) {
    await section
      .getByRole('combobox', { name: 'Technologies', exact: true })
      .selectOption(String(csvHeaders.indexOf('Toolkit')));
    await section.getByLabel('Numeric date format').selectOption('dmy');
  }
  await section
    .getByRole('button', { name: 'Preview records', exact: true })
    .click();
  await expect(
    section.getByRole('heading', { name: /3. Preview records/ }),
  ).toBeFocused();
  return section;
}
export async function confirmCsv(page: Page) {
  const section = page.getByRole('region', { name: 'CSV Import' });
  await section.getByLabel(/I reviewed the selected records/).check();
  await section.getByRole('button', { name: /Confirm import/ }).click();
  return section;
}
export async function completeCsvJourney(page: Page) {
  const section = await prepareCsv(page);
  await expect(section.locator('.csv-counts')).toContainText(
    '2 to import · 4 to skip',
  );
  await expect(section.getByLabel(/^Import row 3:/)).toBeDisabled();
  await expect(section.getByLabel(/^Import row 4:/)).toBeDisabled();
  await expect(section.getByLabel(/^Import row 6:/)).toBeDisabled();
  await expect(section.getByLabel(/^Import row 5:/)).not.toBeChecked();
  await section.getByLabel(/^Import row 5:/).check();
  await section.getByText('Review row 2 values', { exact: true }).click();
  await expect(
    section.getByText('2026-11-06', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    section.getByRole('button', { name: 'Confirm import (3)', exact: true }),
  ).toBeDisabled();
  await confirmCsv(page);
  await expect(section.getByRole('status')).toHaveText(
    'CSV import completed. Imported 3 applications; skipped 3. Existing records were kept.',
  );
  await page.reload();
  await page.goto('/applications');
  await expect(
    page.getByRole('link', { name: 'CSV Engineer', exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole('link', { name: 'CSV Engineer', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('TypeScript, SQL', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.tracking-details')
      .getByText('Private imported note', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('First line\nSecond line with "quotes"', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Saved → Applied', { exact: true })).toHaveCount(
    0,
  );
  const repeat = await prepareCsv(page);
  await expect(repeat.locator('.csv-counts')).toContainText(
    '0 to import · 6 to skip',
  );
  await expect(
    repeat.getByRole('button', { name: 'Confirm import (0)', exact: true }),
  ).toBeDisabled();
}
