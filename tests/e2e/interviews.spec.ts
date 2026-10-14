import { expect, test as base, type Page } from '@playwright/test';
const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await run(page);
    expect(errors, 'Unexpected runtime errors').toEqual([]);
  },
});
async function saveJob(page: Page, company = 'Example Philippines') {
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Job title/).fill('Graduate Developer');
  await form.getByLabel(/^Company/).fill(company);
  await form.getByLabel(/^Location/).fill('Remote');
  await form.getByLabel(/^Source URL/).fill('https://example.com/job');
  await form.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Graduate Developer' }),
  ).toBeVisible();
  return page.url();
}
async function fillInterview(
  page: Page,
  title = 'Meet the team',
  date = '2030-10-16',
) {
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Interview title/).fill(title);
  await form.getByLabel('Interview stage').selectOption('Technical');
  await form.getByLabel(/^Date/).fill(date);
  await form.getByLabel(/^Time \(/).fill('10:00');
  await form.getByLabel(/^Timezone/).fill('Asia/Manila');
  await form
    .getByLabel('Meeting URL', { exact: true })
    .fill('https://example.com/meeting');
  await form
    .getByLabel(/^Preparation notes/)
    .fill('Review projects and expect teamwork questions.');
}
async function schedule(
  page: Page,
  title = 'Meet the team',
  date = '2030-10-16',
) {
  await page
    .getByRole('button', { name: 'Schedule interview', exact: true })
    .click();
  await fillInterview(page, title, date);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
  return page.url();
}
async function expectCount(page: Page, count: number) {
  await page.goto('/');
  await expect(page.getByLabel('Upcoming interview count')).toHaveText(
    `${count} upcoming`,
  );
}

test('full lifecycle persists, links multiple interviews, and synchronizes dashboard', async ({
  page,
}, testInfo) => {
  const applicationUrl = await saveJob(page);
  const interviewUrl = await schedule(page);
  await expect(page.locator('time')).toContainText('Asia/Manila');
  await expect(
    page.getByRole('link', { name: 'Open meeting link' }),
  ).toHaveAttribute('href', 'https://example.com/meeting');
  await page.reload();
  await expect(
    page.getByLabel('Preparation notes', { exact: true }),
  ).toHaveValue('Review projects and expect teamwork questions.');
  await expectCount(page, 1);
  await expect(
    page.getByRole('link', { name: 'Open interview preparation' }),
  ).toHaveAttribute('href', new URL(interviewUrl).pathname);
  await page.getByRole('link', { name: 'View interview details' }).click();
  await expect(page).toHaveURL(interviewUrl);
  await page.getByRole('button', { name: 'Edit / reschedule' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Interview title/).fill('Final conversation');
  await form.getByLabel('Interview stage').selectOption('Final');
  await form.getByLabel(/^Date/).fill('2030-10-18');
  await form.getByLabel(/^Time \(/).fill('00:15');
  await form.getByLabel('Meeting URL', { exact: true }).fill('');
  await form.getByLabel('Physical location').fill('Makati office, room 4');
  await form
    .getByLabel(/^Preparation notes/)
    .fill('Prepare concrete examples.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Interview details saved.');
  await expect(
    page.getByLabel('Preparation notes', { exact: true }),
  ).toHaveValue('Prepare concrete examples.');
  await page.reload();
  await expect(page.getByText('Location: Makati office, room 4')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open meeting link' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!).interviews[0]
          .scheduledAt,
    ),
  ).toBe('2030-10-17T16:15:00.000Z');
  await page
    .getByLabel('Preparation notes', { exact: true })
    .fill('Expect project questions. Ask about mentoring.');
  await page
    .getByLabel('Post-interview reflections', { exact: true })
    .fill(
      'Asked about teamwork. Clear introduction went well. Improve concrete examples.',
    );
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Your notes are saved.');
  await page
    .getByRole('button', { name: 'Mark completed', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Interview completed.');
  await page.reload();
  await expect(
    page.getByLabel('Post-interview reflections', { exact: true }),
  ).toHaveValue(/Improve concrete examples\./);
  await expectCount(page, 0);
  await page.goto(applicationUrl);
  await expect(page.locator('.detail-company .status')).toHaveText('Saved');
  await expect(
    page.getByRole('link', { name: 'Final conversation', exact: true }),
  ).toBeVisible();
  const secondUrl = await schedule(page, 'HR introduction', '2030-10-17');
  await expectCount(page, 1);
  await page.goto(secondUrl);
  await page
    .getByRole('button', { name: 'Cancel interview', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Interview cancelled.');
  await page.reload();
  await expect(page.locator('.interview-detail-heading .status')).toHaveText(
    'Cancelled',
  );
  await expectCount(page, 0);
  await page.goto('/interviews');
  await page
    .getByRole('combobox', { name: 'Filter interviews', exact: true })
    .selectOption('Past & completed');
  await expect(
    page.getByRole('link', { name: 'Final conversation', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Filter interviews', exact: true })
    .selectOption('Cancelled');
  await expect(
    page.getByRole('link', { name: 'HR introduction', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Filter interviews', exact: true })
    .selectOption('All');
  await page
    .getByRole('searchbox', { name: 'Search interviews' })
    .fill('  FINAL  ');
  await expect(
    page.getByRole('link', { name: 'Final conversation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'HR introduction', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search interviews' }).fill('');
  await page
    .getByRole('combobox', { name: 'Filter by application', exact: true })
    .selectOption({ label: 'Example Philippines · Graduate Developer' });
  await expect(page.getByRole('status')).toContainText('Showing 2 of 2');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('interview-workspace.png'),
    fullPage: true,
  });
  await page.goto(interviewUrl);
  await page.screenshot({
    path: testInfo.outputPath('interview-detail.png'),
    fullPage: true,
  });
});

test('validates timezone, meeting URLs, DST gaps and repeated times, and supports keyboard cancellation', async ({
  page,
}, testInfo) => {
  await saveJob(page);
  const opener = page.getByRole('button', {
    name: 'Schedule interview',
    exact: true,
  });
  await opener.click();
  const form = page.getByRole('dialog');
  await expect(form.getByRole('button', { name: 'Close form' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    form.getByRole('button', { name: 'Save interview', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(form.getByRole('button', { name: 'Close form' })).toBeFocused();
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByLabel(/^Interview title/)).toBeFocused();
  await fillInterview(page);
  await form.getByLabel(/^Timezone/).fill('Invalid/Zone');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByRole('alert')).toContainText('valid IANA');
  await form.getByLabel(/^Timezone/).fill('America/New_York');
  await form
    .getByLabel('Meeting URL', { exact: true })
    .fill('javascript:alert(1)');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByRole('alert')).toContainText('http:// or https://');
  await form
    .getByLabel('Meeting URL', { exact: true })
    .fill('https://example.com/meet');
  await form.getByLabel(/^Date/).fill('2030-03-10');
  await form.getByLabel(/^Time \(/).fill('02:30');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByRole('alert')).toContainText('does not exist');
  await form.getByLabel(/^Date/).fill('2030-11-03');
  await form.getByLabel(/^Time \(/).fill('01:30');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByRole('alert')).toContainText('occurs twice');
  await form.getByLabel('Repeated time occurrence').selectOption('later');
  // A choice for one appointment must not silently disambiguate a new time.
  await form.getByLabel(/^Date/).fill('2030-11-04');
  await expect(form.getByLabel('Repeated time occurrence')).toHaveCount(0);
  await form.getByLabel(/^Date/).fill('2030-11-03');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByRole('alert')).toContainText('occurs twice');
  await form.getByLabel('Repeated time occurrence').selectOption('later');
  await page.screenshot({
    path: testInfo.outputPath('interview-dialog.png'),
    fullPage: false,
  });
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!).interviews[0]
          .scheduledAt,
    ),
  ).toBe('2030-11-03T06:30:00.000Z');
  await page.getByRole('button', { name: 'Edit / reschedule' }).click();
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!).interviews[0]
          .scheduledAt,
    ),
  ).toBe('2030-11-03T06:30:00.000Z');
  await page.goto('/interviews');
  const add = page.getByRole('button', { name: 'Add interview', exact: true });
  await add.click();
  await page.keyboard.press('Escape');
  await expect(form).not.toBeVisible();
  await expect(add).toBeFocused();
});

test('nearest interview and count update across tabs after a successful write', async ({
  page,
  context,
}, testInfo) => {
  const applicationUrl = await saveJob(page);
  const laterUrl = await schedule(page, 'Later conversation', '2030-10-18');
  await page.goto(applicationUrl);
  await schedule(page, 'Nearest conversation', '2030-10-17');
  const dashboard = await context.newPage();
  try {
    await dashboard.goto('/');
    await expect(dashboard.getByLabel('Upcoming interview count')).toHaveText(
      '2 upcoming',
    );
    await expect(
      dashboard.getByText('Nearest conversation', { exact: true }),
    ).toBeVisible();
    await dashboard.screenshot({
      path: testInfo.outputPath('interview-dashboard.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Mark completed', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText('Interview completed.');
    await expect(dashboard.getByLabel('Upcoming interview count')).toHaveText(
      '1 upcoming',
    );
    await expect(
      dashboard.getByRole('link', { name: 'View interview details' }),
    ).toHaveAttribute('href', new URL(laterUrl).pathname);
    await expect(
      dashboard.getByText('Later conversation', { exact: true }),
    ).toBeVisible();
  } finally {
    await dashboard.close();
  }
});

test('failed create, edit, and note writes preserve drafts and persisted data', async ({
  page,
}) => {
  const appUrl = await saveJob(page);
  await schedule(page);
  const before = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await page
    .getByLabel('Post-interview reflections', { exact: true })
    .fill('Keep my reflection draft');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'could not be saved',
  );
  await expect(
    page.getByLabel('Post-interview reflections', { exact: true }),
  ).toHaveValue('Keep my reflection draft');
  await page.getByRole('button', { name: 'Edit / reschedule' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Interview title/).fill('Keep my edited title');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form.getByRole('alert')).toContainText('could not be saved');
  await expect(form.getByLabel(/^Interview title/)).toHaveValue(
    'Keep my edited title',
  );
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'View related application' }).click();
  await expect(page).toHaveURL(appUrl);
  await page
    .getByRole('button', { name: 'Schedule interview', exact: true })
    .click();
  await fillInterview(page, 'Keep my new interview');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form.getByRole('alert')).toContainText('could not be saved');
  await expect(form.getByLabel(/^Interview title/)).toHaveValue(
    'Keep my new interview',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(before);
});

test('orphaned and malformed interviews are reported without erasing saved data', async ({
  page,
}) => {
  await saveJob(page);
  const url = await schedule(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('fats.applications.v1')!);
    data.applications = [];
    localStorage.setItem('fats.applications.v1', JSON.stringify(data));
  });
  const raw = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'left untouched',
  );
  await expect(
    page.getByRole('button', { name: 'Edit / reschedule' }),
  ).toHaveCount(0);
  await page.goto('/interviews');
  await expect(
    page.getByRole('heading', { name: 'Your interviews are unavailable.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
  await page.evaluate(() =>
    localStorage.setItem(
      'fats.applications.v1',
      JSON.stringify({
        version: 1,
        applications: [],
        interviews: [{ id: 'bad' }],
      }),
    ),
  );
  await page.goto(url);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'left untouched',
  );
});

test('main form chooses applications, past scheduled records remain truthful, and missing routes are helpful', async ({
  page,
}, testInfo) => {
  await saveJob(page, 'First Company');
  await saveJob(page, 'Second Company');
  await page.goto('/interviews');
  await page
    .getByRole('button', { name: 'Add interview', exact: true })
    .first()
    .click();
  const form = page.getByRole('dialog');
  await form
    .getByLabel(/^Application \(/)
    .selectOption({ label: 'First Company · Graduate Developer' });
  await fillInterview(page, 'Past conversation', '2025-01-15');
  await form.getByLabel('Interview stage').selectOption('Custom');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(form).not.toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Past conversation' }),
  ).toBeVisible();
  await expectCount(page, 0);
  await page.goto('/interviews');
  await page
    .getByRole('combobox', { name: 'Filter interviews', exact: true })
    .selectOption('Past & completed');
  await expect(
    page.getByText('Time has passed', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.interview-rows .status')).toHaveText('Scheduled');
  await page
    .getByRole('combobox', { name: 'Filter by application', exact: true })
    .selectOption({ label: 'Second Company · Graduate Developer' });
  await expect(
    page.getByRole('heading', { name: 'No interviews in this view.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show all interviews' }).click();
  await expect(
    page.getByRole('link', { name: 'Past conversation', exact: true }),
  ).toBeVisible();
  await page.goto('/interviews/missing');
  await expect(
    page.getByRole('heading', { name: 'We couldn’t find this interview.' }),
  ).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Interviews', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your interviews', exact: true }),
    ).toBeVisible();
  }
});
