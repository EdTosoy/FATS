import { expect, test as base } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await run(page);
    expect(errors, 'Unexpected browser runtime errors').toEqual([]);
  },
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: guest identity, saved work, and account navigation`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const welcome = page.getByRole('heading', {
      name: 'Welcome to your workspace.',
      exact: true,
    });
    const storage = page.getByText(
      'Your work is saved in this browser, not an account. Clearing site data removes it.',
      { exact: true },
    );
    await expect(welcome).toBeVisible();
    await expect(storage).toBeVisible();
    await expect(page.locator('.page-heading')).toContainText(
      'Guest workspace',
    );
    await expect(page.locator('body')).not.toContainText('Maria');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBeNull();
    if (info.project.name === 'desktop') {
      await expect(page.locator('.profile')).toContainText('Guest workspace');
      await expect(page.locator('.profile')).toContainText(
        'Saved in this browser',
      );
    }
    // The guest explanation is visible on the first screen, including mobile.
    expect(
      (await storage.boundingBox())!.y + (await storage.boundingBox())!.height,
    ).toBeLessThan(page.viewportSize()!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`guest-empty-${colorScheme}.png`),
      fullPage: true,
    });

    await page
      .getByRole('button', { name: 'Save your first job', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Job title/).fill('Synthetic guest opportunity');
    await dialog.getByLabel(/^Company/).fill('Example Company');
    await dialog.getByLabel(/^Location/).fill('Makati');
    await dialog.getByLabel(/^Source URL/).fill('https://example.test/guest');
    await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Synthetic guest opportunity',
        exact: true,
      }),
    ).toBeVisible();
    const raw = await page.evaluate(() =>
      localStorage.getItem('fats.applications.v1'),
    );
    expect(JSON.parse(raw!).applications).toHaveLength(1);
    await page.goto('/');
    await page.reload();
    await expect(welcome).toBeVisible();
    await expect(storage).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'Synthetic guest opportunity',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`guest-returning-${colorScheme}.png`),
      fullPage: true,
    });

    // Navigate with the keyboard through the existing mobile/desktop menu.
    if (info.project.name === 'mobile') {
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await expect(
        page
          .getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link', { name: 'Dashboard', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Open navigation', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
    }
    const settings = page.getByRole('link', { name: 'Settings', exact: true });
    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your guest workspace', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'You’re using FATS without signing in. Your saved work belongs to this browser workspace.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('demo profile');
    await page.screenshot({
      path: info.outputPath(`guest-settings-${colorScheme}.png`),
      fullPage: true,
    });
    const signIn = page.getByRole('link', {
      name: 'Sign in to an account',
      exact: true,
    });
    await signIn.focus();
    expect(
      await signIn.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole('heading', { name: 'Welcome back.', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Signing in does not upload or delete browser records.', {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Back to your workspace', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(welcome).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'Synthetic guest opportunity',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBe(raw);
  });
}
