import { test, expect } from '@playwright/test';
for (const colorScheme of ['light', 'dark'] as const)
  test(`${colorScheme}: URL filters reload, history, detail return and clear`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ colorScheme });
    await page.goto('/applications');
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Save a job', exact: true })
      .click();
    const form = page.getByRole('dialog');
    await form.getByLabel(/^Job title/).fill('Synthetic Graduate');
    await form.getByLabel(/^Company/).fill('Example');
    await form.getByLabel(/^Location/).fill('Manila');
    await form.getByLabel(/^Source URL/).fill('https://example.test/job');
    await form.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.goto('/applications?keep=example#list');
    const search = page.getByRole('searchbox');
    const status = page.getByLabel('Filter by status');
    await expect(search).toBeEnabled();
    const length = await page.evaluate(() => history.length);
    await search.fill('Synthetic');
    await expect(search).toHaveValue('Synthetic');
    expect(await page.evaluate(() => history.length)).toBe(length);
    await status.selectOption('Saved');
    await expect(page).toHaveURL(/status=Saved/);
    await page.reload();
    await expect(search).toHaveValue('Synthetic');
    await expect(status).toHaveValue('Saved');
    expect(new URL(page.url()).searchParams.get('keep')).toBe('example');
    await page.screenshot({
      path: info.outputPath('filtered.png'),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Synthetic Graduate', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Synthetic Graduate', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole('link', { name: 'Back to applications', exact: true })
      .click();
    await expect(search).toHaveValue('Synthetic');
    await expect(status).toHaveValue('Saved');
    await status.selectOption('Applied');
    await expect(
      page.getByRole('heading', { name: 'No applications match just yet.' }),
    ).toBeVisible();
    await page.goBack();
    await expect(status).toHaveValue('Saved');
    await page.goForward();
    await expect(status).toHaveValue('Applied');
    const clear = page.getByRole('button', {
      name: 'Clear search & filters',
      exact: true,
    });
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(search).toHaveValue('');
    await expect(status).toHaveValue('All');
    await expect(
      page.getByRole('link', { name: 'Synthetic Graduate', exact: true }),
    ).toBeVisible();
    await page.goto('/applications?keep=example&q=missing&status=Saved');
    await expect(
      page.getByRole('heading', { name: 'No applications match just yet.' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Clear search & filters', exact: true })
      .click();
    expect(new URL(page.url()).searchParams.get('keep')).toBe('example');
    await page.goto('/applications?q=one&q=two&status=unknown');
    await expect(search).toHaveValue('');
    await expect(status).toHaveValue('All');
    await search.fill('Synthetic');
    await expect(
      page.getByRole('link', { name: 'Synthetic Graduate', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
