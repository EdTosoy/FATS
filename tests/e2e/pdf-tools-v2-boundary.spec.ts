import { test, expect } from '@playwright/test';

test('V2 candidate and comparison prototype stay unavailable in production', async ({
  page,
}) => {
  test.skip(
    process.env.FATS_TEST_PRODUCTION !== '1',
    'Production route boundary requires next start.',
  );
  for (const route of ['/dev/pdf-tools-v2', '/design/pdf-tools']) {
    await page.goto(route);
    await expect(
      page.getByRole('heading', { name: 'This page isn’t here.', exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('[data-pdf-v2-workspace], [data-pdf-design-workspace]'),
    ).toHaveCount(0);
    await expect(
      page.getByLabel('Choose a local PDF', { exact: true }),
    ).toHaveCount(0);
  }
  await page.goto('/resumes');
  await expect(
    page.getByRole('link', { name: 'Open PDF Tools', exact: true }),
  ).toHaveAttribute('href', '/resumes/pdf-tools');
  await expect(
    page.locator('a[href="/dev/pdf-tools-v2"], a[href="/design/pdf-tools"]'),
  ).toHaveCount(0);
});
