import { test, expect } from '@playwright/test';

test('backup guidance matches portable imports and the first-job dialog supports keyboard focus and cancellation', async ({
  page,
}, info) => {
  // This guest server has no account services configured: denial must happen
  // before getServices(), rather than failing with a storage/configuration error.
  for (const method of ['GET', 'POST']) {
    const response = await page.request.fetch(
      '/api/matching?applicationId=synthetic',
      {
        method,
        ...(method === 'POST'
          ? { data: { action: 'compare', confirmed: true } }
          : {}),
      },
    );
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MATCHING_DISABLED' });
  }
  await page.goto('/help');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(
    'A little guidance',
  );
  await expect(
    main.getByText(
      /Backups with offers add missing records and skip identical ones/,
    ),
  ).toBeVisible();
  await expect(
    main.getByText(
      /Imported offer letters are historical references, not downloadable documents/,
    ),
  ).toBeVisible();
  await page.goto('/applications');
  const trigger = page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(/Save a job/);
  const close = dialog.getByRole('button', { name: 'Close form', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  const title = dialog.getByLabel(/^Job title/);
  await expect(title).toBeFocused();
  await title.fill('Synthetic first application');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel(/^Company/)).toBeFocused();
  // Every editable control must expose a name to assistive technology.
  for (const control of await dialog.getByRole('textbox').all())
    await expect(control).toHaveAccessibleName(/.+/);
  const first = close;
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Save job', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('first-job-keyboard.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole('link', {
      name: 'Synthetic first application',
      exact: true,
    }),
  ).toHaveCount(0);
});
