import { readFile } from 'node:fs/promises';
import { expect, test as base, type Page } from '@playwright/test';
import { createApplication, createInterview, createBackup } from '@fats/domain';
import { portableOfferFixture } from '../helpers/portable-offer-fixture';

const key = 'fats.applications.v1';
const now = '2026-10-15T00:00:00.000Z';
const jobInput = {
  title: 'Graduate Developer',
  company: 'Example Philippines',
  sourceUrl: 'https://example.com/job',
  location: 'Remote',
  description: 'Synthetic backup fixture',
};
const application = createApplication(jobInput, 'job-backup', now);
const interview = createInterview(
  {
    applicationId: application.id,
    title: 'Meet the team',
    stage: 'Technical',
    scheduledAt: '2030-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.com/meeting',
    location: '',
    preparationNotes: 'Expected questions. Topics to prepare.',
    reflections: 'Questions asked. What went well. Improvements.',
  },
  'interview-backup',
  now,
);
const data = {
  applications: [application],
  interviews: [
    interview,
    { ...interview, id: 'interview-completed', status: 'completed' as const },
    { ...interview, id: 'interview-cancelled', status: 'cancelled' as const },
  ],
};
const backup = createBackup(data, now);
const emptyBackup = createBackup({ applications: [], interviews: [] }, now);
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
async function seed(page: Page, workspace = data) {
  await page.goto('/settings');
  await page.evaluate(
    ({ key, workspace }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, ...workspace }));
      localStorage.setItem('unrelated-preference', 'not part of FATS');
    },
    { key, workspace },
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Export backup', exact: true }),
  ).toBeEnabled();
}
async function choose(page: Page, contents: unknown) {
  await page.getByLabel('Choose JSON backup', { exact: true }).setInputFiles({
    name: 'synthetic-fats-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      typeof contents === 'string' ? contents : JSON.stringify(contents),
    ),
  });
  await page
    .getByRole('button', { name: 'Preview backup', exact: true })
    .click();
}
async function saved(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), key);
}
async function exportText(page: Page) {
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^fats-backup-.*\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, 'utf8');
}

test('exports the exact workspace and restores multiple interviews, notes, and statuses across reloads', async ({
  page,
}, testInfo) => {
  await seed(page);
  const exported = await exportText(page);
  await expect(
    page.getByRole('button', { name: 'Export backup', exact: true }),
  ).toBeFocused();
  expect(JSON.parse(exported)).toMatchObject({
    format: 'fats-backup',
    version: 1,
    data,
  });
  expect(exported).not.toContain('not part of FATS');
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Backup download requested',
  );
  await page.locator('#data-management-title').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('data-management.png'),
    fullPage: true,
  });
  const other = createApplication(
    { ...jobInput, company: 'Another company' },
    'other-job',
    now,
  );
  await seed(page, { applications: [application, other], interviews: [] });
  const before = await saved(page);
  await choose(page, exported);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Backup applications');
  await expect(dialog.locator('dd')).toHaveText(['1', '3', '2', '0']);
  await expect(
    dialog.getByRole('button', { name: 'Replace workspace', exact: true }),
  ).toBeDisabled();
  expect(await saved(page)).toBe(before);
  await dialog.getByRole('checkbox').check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('restore-preview.png'),
    fullPage: false,
  });
  await dialog
    .getByRole('button', { name: 'Replace workspace', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Restore completed. 1 application and 3 interviews',
  );
  expect(JSON.parse((await saved(page))!)).toEqual({
    version: 1,
    ...data,
    activityDays: ['2026-10-15'],
  });
  await page.reload();
  expect(JSON.parse(await exportText(page)).data).toEqual(data);
  await page.goto('/');
  await expect(page.getByLabel('Upcoming interview count')).toHaveText(
    '1 upcoming',
  );
  await page.goto(`/applications/${application.id}`);
  await expect(page.locator('.interview-rows > li')).toHaveCount(3);
  await page.goto(`/interviews/${interview.id}`);
  await expect(
    page.getByLabel('Preparation notes', { exact: true }),
  ).toHaveValue(interview.preparationNotes);
  expect(
    await page.evaluate(() => localStorage.getItem('unrelated-preference')),
  ).toBe('not part of FATS');
});

test('supports keyboard cancellation and explicitly confirmed empty restores', async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await choose(page, emptyBackup);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This backup is empty');
  await expect(dialog.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Preview backup', exact: true }),
  ).toBeFocused();
  expect(await saved(page)).toBe(before);
  await choose(page, emptyBackup);
  await dialog
    .getByRole('button', { name: 'Cancel import', exact: true })
    .click();
  expect(await saved(page)).toBe(before);
  await choose(page, emptyBackup);
  await expect(dialog.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Cancel import', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Replace workspace', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await page.reload();
  expect(JSON.parse(await exportText(page)).data).toEqual({
    applications: [],
    interviews: [],
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Save your first job', exact: true }),
  ).toBeVisible();
});

test('rejects malformed files, unsupported versions, invalid records, and missing parents without writes', async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  const cases = [
    { value: '{unreadable', error: 'not valid JSON' },
    { value: { ...backup, version: 7 }, error: 'version is not supported' },
    {
      value: {
        ...backup,
        data: {
          ...data,
          applications: [{ ...application, sourceUrl: 'javascript:alert(1)' }],
        },
      },
      error: 'http:// or https://',
    },
    {
      value: { ...backup, data: { ...data, applications: [] } },
      error: 'missing parent',
    },
    {
      value: {
        ...backup,
        data: { ...data, interviews: [interview, interview] },
      },
      error: 'Duplicate',
    },
  ];
  for (const item of cases) {
    await choose(page, item.value);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      item.error,
    );
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await saved(page)).toBe(before);
  }
  await page.getByLabel('Choose JSON backup', { exact: true }).setInputFiles({
    name: 'oversized.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await page
    .getByRole('button', { name: 'Preview backup', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '10 MiB',
  );
  expect(await saved(page)).toBe(before);
});

test('failed persistence keeps the saved workspace and preview available for retry', async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await choose(page, emptyBackup);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { failBackupWrite: boolean }).failBackupWrite = true;
    Storage.prototype.setItem = function (key, value) {
      if (
        key === 'fats.applications.v1' &&
        (window as unknown as { failBackupWrite: boolean }).failBackupWrite
      )
        throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog
    .getByRole('button', { name: 'Replace workspace', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('could not be saved');
  expect(await saved(page)).toBe(before);
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await page.evaluate(() => {
    (window as unknown as { failBackupWrite: boolean }).failBackupWrite = false;
  });
  await dialog
    .getByRole('button', { name: 'Replace workspace', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  expect(JSON.parse((await saved(page))!)).toEqual({
    version: 1,
    applications: [],
    interviews: [],
    activityDays: ['2026-10-15'],
  });
});

test('recovers unreadable storage only after confirmation and rejects stale previews', async ({
  page,
  context,
}) => {
  await page.goto('/settings');
  await page.evaluate((key) => localStorage.setItem(key, '{corrupt'), key);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Export backup', exact: true }),
  ).toBeDisabled();
  await choose(page, backup);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Current saved data cannot be read');
  expect(await saved(page)).toBe('{corrupt');
  await dialog.getByRole('checkbox').check();
  await dialog
    .getByRole('button', { name: 'Replace workspace', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.reload();
  expect(JSON.parse((await saved(page))!)).toEqual({
    version: 1,
    ...data,
    activityDays: [],
  });
  await choose(page, emptyBackup);
  const otherTab = await context.newPage();
  try {
    await otherTab.goto('/settings');
    await otherTab.evaluate((key) => {
      const value = JSON.parse(localStorage.getItem(key)!);
      value.applications[0].company = 'Changed in another tab';
      localStorage.setItem(key, JSON.stringify(value));
    }, key);
    const latest = await saved(page);
    await dialog.getByRole('checkbox').check();
    await dialog
      .getByRole('button', { name: 'Replace workspace', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(
      'changed since this preview',
    );
    expect(await saved(page)).toBe(latest);
    await dialog
      .getByRole('button', { name: 'Cancel import', exact: true })
      .click();
  } finally {
    await otherTab.close();
  }
});

test('version 2 offer backups require a verified account and never discard guest records', async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await choose(page, portableOfferFixture());
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'verified account',
  );
  expect(await saved(page)).toBe(before);
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
