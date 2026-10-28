import { expect, test } from '@playwright/test';
for (const theme of ['light', 'dark'] as const)
  test(`${theme}: guest document options explain restrictions before sign-in and preserve local PDF actions`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const writes: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method()))
        writes.push(new URL(r.url()).pathname);
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/resumes');
    const availability = page.locator('#document-availability');
    await expect(availability).toContainText(
      'New document uploads are unavailable',
    );
    await expect(availability).toContainText(
      'Signing in does not remove this restriction',
    );
    await expect(
      page.getByText('Sign in to a verified account to upload', {
        exact: false,
      }),
    ).toHaveCount(0);
    const signIn = page.getByRole('link', {
      name: 'Sign in to manage documents',
      exact: true,
    });
    expect(
      await availability.evaluate(
        (e) =>
          !!(
            e.compareDocumentPosition(
              document.querySelector('a[href="/sign-in?next=%2Fresumes"]')!,
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
    await page
      .getByRole('link', { name: 'Open PDF Tools', exact: true })
      .focus();
    await expect(
      page.getByRole('link', { name: 'Open PDF Tools', exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath('library.png'),
      fullPage: true,
    });
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fresumes$/);
    await page.goBack();
    await page
      .getByRole('link', { name: 'Open PDF Tools', exact: true })
      .click();
    await expect(
      page.getByLabel('Choose a local PDF', { exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText('Nothing is uploaded or saved to your FATS library.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.locator('.pdf-limit-note')).toContainText(
      'does not save the edited copy to your account or Career Vault',
    );
    await page.screenshot({
      path: info.outputPath('pdf-tools.png'),
      fullPage: true,
    });
    await page.goto('/career-vault');
    await expect(
      page.getByText('Career Vault does not upload new files', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('without attaching files', { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('vault.png'),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Open local PDF Tools', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByLabel('Choose a local PDF', { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
