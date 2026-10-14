import { expect, test as base, type Page } from '@playwright/test';
import { APPLICATION_STATUSES } from '@fats/domain';

const test = base.extend({
  page: async ({ page }, runTest) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await runTest(page);
    expect(errors, 'Unexpected browser runtime errors').toEqual([]);
  },
});

async function saveJob(
  page: Page,
  title = 'Junior Developer',
  company = 'Example Philippines',
) {
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill(title);
  await dialog.getByLabel(/^Company/).fill(company);
  await dialog.getByLabel(/^Location/).fill('Makati · Hybrid');
  await dialog
    .getByLabel(/^Source URL/)
    .fill('https://example.com/careers/graduate');
  await dialog
    .getByLabel(/^Job description/)
    .fill('Build accessible websites.\nGraduate applicants welcome.');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
}

async function expectStat(page: Page, label: string, number: number) {
  await expect(
    page.locator('.stat-card').filter({ hasText: label }).locator('strong'),
  ).toHaveText(String(number));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Maria.' }),
  ).toBeVisible();
  // Each test gets a fresh browser context and real localStorage.
});

test('first-time dashboard is honest, usable, and fits the viewport', async ({
  page,
}, testInfo) => {
  await expect(
    page.getByRole('button', { name: 'Save your first job' }),
  ).toBeVisible();
  for (const label of [
    'Total applications',
    'Saved jobs',
    'In progress',
    'Offers',
  ])
    await expectStat(page, label, 0);
  await expect(
    page.getByRole('heading', { name: 'No scheduled interviews' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('dashboard-empty.png'),
    fullPage: true,
  });
  await page.goto('/applications');
  await expect(
    page.getByRole('heading', { name: 'A blank page. A bright beginning.' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Showing 0 of 0');
});

test('creates, edits, updates status, reloads, and updates dashboard statistics', async ({
  page,
}, testInfo) => {
  await saveJob(page);
  await expect(page.locator('.detail-company .status')).toHaveText('Saved');
  const detailUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Junior Developer' }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Applied');
  await expect(page.getByRole('status')).toHaveText(
    'Status updated to Applied.',
  );
  await page.getByRole('button', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Graduate Developer');
  await dialog.getByLabel(/^Location/).fill('Cebu · Remote');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Graduate Developer' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.detail-company .status')).toHaveText('Applied');
  await expect(page.getByText('Cebu · Remote', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('application-detail.png'),
    fullPage: true,
  });
  await page.goto('/applications');
  await expect(
    page.getByRole('link', { name: 'Graduate Developer', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Graduate Developer', exact: true })
    .click();
  await expect(page).toHaveURL(detailUrl);
  await saveJob(page, 'Graduate Analyst', 'Another Company');
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Offer');
  await expect(page.getByRole('status')).toHaveText('Status updated to Offer.');
  await page.goto('/');
  await expectStat(page, 'Total applications', 2);
  await expectStat(page, 'Saved jobs', 0);
  await expectStat(page, 'In progress', 1);
  await expectStat(page, 'Offers', 1);
  await page.screenshot({
    path: testInfo.outputPath('dashboard-populated.png'),
    fullPage: true,
  });
});

test('search and status filters work together, and every status persists', async ({
  page,
}, testInfo) => {
  await saveJob(page);
  const firstUrl = page.url();
  for (const status of APPLICATION_STATUSES) {
    if (status !== 'Saved') {
      await page
        .getByRole('combobox', { name: 'Application status', exact: true })
        .selectOption(status);
      await expect(page.getByRole('status')).toHaveText(
        `Status updated to ${status}.`,
      );
    }
    await page.reload();
    await expect(page.locator('.detail-company .status')).toHaveText(status);
  }
  await saveJob(page, 'Marketing Associate', 'Another Company');
  await page.goto('/applications');
  const search = page.getByRole('searchbox', { name: 'Search applications' });
  const filter = page.getByRole('combobox', {
    name: 'Filter by status',
    exact: true,
  });
  await search.fill('  EXAMPLE  ');
  await expect(
    page.getByRole('link', { name: 'Junior Developer', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Marketing Associate', exact: true }),
  ).not.toBeVisible();
  await filter.selectOption('Saved');
  await expect(
    page.getByRole('heading', { name: 'No applications match just yet.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear search & filters' }).click();
  await expect(search).toHaveValue('');
  await expect(filter).toHaveValue('All');
  await expect(page.getByRole('status')).toContainText('Showing 2 of 2');
  await search.fill('accessible');
  await filter.selectOption('Withdrawn');
  await expect(page.getByRole('status')).toContainText('Showing 1 of 2');
  await page
    .getByRole('link', { name: 'Junior Developer', exact: true })
    .click();
  await expect(page).toHaveURL(firstUrl);
  await page.goto('/applications');
  await expect(
    page.getByRole('link', { name: 'Junior Developer', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('applications-populated.png'),
    fullPage: true,
  });
});

test('form validates required fields, supports keyboard focus, and cancels without saving', async ({
  page,
}, testInfo) => {
  const opener = page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Close form' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Save job', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Close form' }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog.getByLabel(/^Job title/)).toBeFocused();
  await dialog.getByLabel(/^Job title/).fill('Unsubmitted draft');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: testInfo.outputPath('save-job-dialog.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expectStat(page, 'Total applications', 0);
});

test('failed browser writes keep the draft and previous application intact', async ({
  page,
}) => {
  await saveJob(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fats.applications.v1')
        throw new DOMException('Storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Keep this draft');
  await dialog.getByLabel(/^Company/).fill('Example Company');
  await dialog.getByLabel(/^Location/).fill('Remote');
  await dialog.getByLabel(/^Source URL/).fill('https://example.com/job');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be saved');
  await expect(dialog.getByLabel(/^Job title/)).toHaveValue('Keep this draft');
  await expect(
    dialog.getByRole('button', { name: 'Save job', exact: true }),
  ).toBeEnabled();
  const count = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('fats.applications.v1') ?? '{}')
        .applications.length,
  );
  expect(count).toBe(1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.detail-company .status')).toHaveText('Saved');
});

test('navigation and planned page shells are honest on desktop and mobile', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Resumes', exact: true })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeVisible();
  } else {
    await page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Resumes', exact: true })
      .click();
  }
  await expect(
    page.getByRole('heading', { name: 'Your resume library is on the way.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload/ })).not.toBeVisible();
  await page.goto('/interviews');
  await expect(
    page.getByRole('heading', { name: 'No scheduled interviews.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Schedule/ }),
  ).not.toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Saved in this browser' }),
  ).toBeVisible();
  await page.goto('/help');
  await expect(
    page.getByRole('heading', { name: 'A little guidance' }),
  ).toBeVisible();
});

test('corrupt storage is reported and preserved rather than replaced with a fake empty state', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem('fats.applications.v1', '{unreadable'),
  );
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'left untouched',
  );
  await expect(
    page
      .getByRole('banner')
      .getByRole('button', { name: 'Save a job', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.stat-card')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe('{unreadable');
  await page.goto('/help');
  await expect(
    page.getByRole('heading', { name: 'Taking care of your saved data' }),
  ).toBeVisible();
});
