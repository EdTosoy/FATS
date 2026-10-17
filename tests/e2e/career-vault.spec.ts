import { test, expect } from '@playwright/test';
test('Career Vault gives guests a truthful account explanation and preserves local PDF access', async ({
  page,
}, info) => {
  await page.goto('/career-vault');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Career Vault',
  );
  await expect(
    page.getByRole('link', { name: 'Sign in to use Career Vault' }),
  ).toHaveAttribute('href', '/sign-in?next=%2Fcareer-vault');
  await expect(
    page.getByRole('button', { name: 'Add employment', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open local PDF Tools' }),
  ).toHaveAttribute('href', '/resumes/pdf-tools');
  await expect(page.getByText(/No employment history is needed/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('career-guest.png'),
    fullPage: true,
  });
});
