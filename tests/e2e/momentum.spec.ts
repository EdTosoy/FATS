import { expect, test, type Page } from '@playwright/test';

async function visibleMomentum(page: Page) {
  if ((page.viewportSize()?.width ?? 0) <= 760) {
    const toggle = page.getByRole('button', {
      name: /^(Open|Close) navigation$/,
    });
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) === 'false')
      await toggle.click();
    return page.locator('.mobile-navigation .momentum');
  }
  return page.locator('.sidebar .momentum');
}

test('meaningful guest activity persists without counting browsing, unchanged edits, or repeated work', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.clock.setFixedTime(new Date('2026-10-21T00:00:00.000Z'));
  if (testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 1916, height: 952 });
  await page.goto('/');
  let widget = await visibleMomentum(page);
  await expect(widget).toContainText('A small step is a lovely start.');
  await expect(widget.locator('.momentum-streak')).toHaveText('0days in a row');
  await expect(widget.getByRole('listitem')).toHaveCount(7);
  await expect(widget.locator('[aria-current="date"]')).toHaveAttribute(
    'aria-label',
    /Wednesday.*today/,
  );
  if (testInfo.project.name === 'desktop') {
    expect(
      await page
        .locator('.sidebar')
        .evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true);
    await expect(page.locator('.sidebar .profile')).toBeInViewport();
  }
  await page.screenshot({
    path: testInfo.outputPath('momentum-empty.png'),
    fullPage: true,
  });
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Synthetic graduate opportunity');
  await dialog.getByLabel(/^Company/).fill('Example');
  await dialog.getByLabel(/^Location/).fill('Manila');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/momentum');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Synthetic graduate opportunity',
      exact: true,
    }),
  ).toBeVisible();
  widget = await visibleMomentum(page);
  await expect(widget.locator('.momentum-streak')).toHaveText('1day in a row');
  const raw = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  await page.clock.setFixedTime(new Date('2026-10-22T00:00:00.000Z'));
  await page.reload();
  widget = await visibleMomentum(page);
  await expect(widget.locator('.momentum-streak')).toHaveText('1day in a row');
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Applied');
  await expect(page.getByRole('status')).toHaveText(
    'Status updated to Applied.',
  );
  widget = await visibleMomentum(page);
  await expect(widget.locator('.momentum-streak')).toHaveText('2days in a row');
  await expect(widget.locator('.momentum-count')).toHaveText(
    '2 active days this week',
  );
  await page.reload();
  widget = await visibleMomentum(page);
  await expect(widget.locator('.momentum-streak')).toHaveText('2days in a row');
  await page.screenshot({
    path: testInfo.outputPath('momentum-active.png'),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({
    path: testInfo.outputPath('momentum-dark.png'),
    fullPage: true,
  });
  expect(
    await widget.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--momentum-ink').trim(),
    ),
  ).toBe('#e9f0ed');
  if (testInfo.project.name === 'desktop') {
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 800, height: 700 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      widget = await visibleMomentum(page);
      await widget.scrollIntoViewIfNeeded();
      await expect(widget).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`momentum-${viewport.width}.png`),
        fullPage: true,
      });
    }
  }
  await page.clock.setFixedTime(new Date('2026-10-24T00:00:00.000Z'));
  await page.reload();
  widget = await visibleMomentum(page);
  await expect(widget.locator('.momentum-streak')).toHaveText('0days in a row');
  await expect(widget).toContainText('Here when you’re ready');
  expect(errors).toEqual([]);
});

test('unreadable activity stays intact and has an honest unavailable state', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Maria.' }),
  ).toBeVisible();
  const corrupt = JSON.stringify({
    version: 1,
    applications: [],
    interviews: [],
    activityDays: ['2026-02-30'],
  });
  await page.evaluate(
    (raw) => localStorage.setItem('fats.applications.v1', raw),
    corrupt,
  );
  await page.reload();
  const widget = await visibleMomentum(page);
  await expect(widget).toContainText('Momentum is unavailable');
  await expect(widget.locator('.momentum-streak')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(corrupt);
});
