import { browserTestOrigin } from '../helpers/browser-origin';
import { checkDashboardReadability } from '../helpers/dashboard-readability';
import { test as base, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createServices } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';
import {
  createBackup,
  serializeBackup,
  type WorkspaceData,
} from '@fats/domain';
const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await run(page);
    expect(errors, 'Unexpected browser runtime errors').toEqual([]);
  },
});
const password = 'Synthetic-browser-passphrase-42!';
const db = createServices(
  process.env.FATS_TEST_DATABASE_URL!,
  browserTestOrigin,
  randomUUID() + randomUUID(),
);
const owners: string[] = [];
test.afterAll(async () => {
  for (const id of owners) {
    await db.pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await db.pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await db.pool.end();
});
async function register(page: Page) {
  const email = `browser-${randomUUID()}@example.test`;
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page.getByLabel('Your name', { exact: true }).fill('Test Graduate');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await completeAccountVerification(page, email, password);
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  const { user } = await (await page.request.get('/api/account')).json();
  owners.push(user.id);
  return { email, id: user.id as string };
}
async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
}
async function saveJob(page: Page, title = 'Account opportunity') {
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill(title);
  await dialog.getByLabel(/^Company/).fill('Example Account');
  await dialog.getByLabel(/^Location/).fill('Remote');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/account');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  return page.url();
}
function localData(): WorkspaceData {
  const stamp = '2026-10-15T00:00:00.000Z',
    id = 'legacy-app-' + randomUUID();
  return {
    applications: [
      {
        id,
        title: 'Legacy opportunity',
        company: 'Example Legacy',
        location: 'Makati',
        sourceUrl: 'https://example.test/legacy',
        description: 'Original notes\nkeep spacing.',
        status: 'Interview',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    interviews: (['completed', 'cancelled', 'scheduled'] as const).map(
      (status, index) => ({
        id: 'legacy-interview-' + randomUUID(),
        applicationId: id,
        title: 'Conversation ' + index,
        stage: 'HR',
        scheduledAt: '2030-10-16T02:00:00.000Z',
        timeZone: 'Asia/Manila',
        meetingUrl: 'https://example.test/meeting',
        location: '',
        preparationNotes: 'Prepare projects.',
        reflections: index === 0 ? 'What went well.' : '',
        status,
        createdAt: stamp,
        updatedAt: stamp,
      }),
    ),
  };
}
async function seedLocal(page: Page, data: WorkspaceData) {
  await page.goto('/');
  await page.evaluate((data) => {
    localStorage.setItem(
      'fats.applications.v1',
      JSON.stringify({ version: 1, ...data }),
    );
  }, data);
  return page.evaluate(() => localStorage.getItem('fats.applications.v1'));
}

test('dashboard preserves populated account summaries and interview preparation in both themes', async ({
  page,
}, info) => {
  await register(page);
  await saveJob(page, 'Synthetic saved role');
  await saveJob(page, 'Synthetic interview role');
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Applied');
  await page
    .getByRole('button', { name: 'Schedule interview', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(/^Interview title/)
    .fill('Synthetic account conversation');
  await dialog.getByLabel(/^Date/).fill('2030-10-16');
  await dialog.getByLabel(/^Time \(/).fill('10:00');
  await dialog.getByLabel(/^Timezone/).fill('Asia/Manila');
  await dialog
    .getByLabel('Meeting URL', { exact: true })
    .fill('https://example.test/conversation');
  await dialog
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Synthetic account conversation',
      exact: true,
    }),
  ).toBeVisible();
  const interviewUrl = page.url();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Hello, Test.', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('.stat-card')
        .filter({ hasText: 'Total applications' })
        .locator('strong'),
    ).toHaveText('2');
    await expect(
      page
        .locator('.stat-card')
        .filter({ hasText: 'In progress' })
        .locator('strong'),
    ).toHaveText('1');
    await expect(page.getByLabel('Upcoming interview count')).toHaveText(
      '1 upcoming',
    );
    await expect(
      page.getByRole('link', { name: 'Synthetic saved role', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Synthetic interview role', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBeNull();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await checkDashboardReadability(page, info);
    await page.screenshot({
      path: info.outputPath(`account-populated-${colorScheme}.png`),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Open interview preparation', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(interviewUrl);
  }
});

test('guest identity becomes the live account identity and returns with browser work intact', async ({
  page,
}, info) => {
  await saveJob(page, 'Synthetic guest identity opportunity');
  const guestRaw = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  const owner = await register(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Hello, Test.', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Your saved jobs, conversations, and next steps.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('.page-heading')).not.toContainText(
      'Guest workspace',
    );
    await expect(page.locator('body')).not.toContainText('Maria');
    await expect(
      page.getByRole('link', {
        name: 'Synthetic guest identity opportunity',
        exact: true,
      }),
    ).toHaveCount(0);
    if (info.project.name === 'desktop') {
      await expect(page.locator('.profile')).toContainText('Test Graduate');
      await expect(page.locator('.profile')).toContainText('Account workspace');
    }
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    await expect(
      page.locator(
        '.stat-card, .dashboard-interviews, .recent-card, .document-next-step, .momentum',
      ),
    ).toHaveCount(0);
    await expect(page.locator('.button-primary:visible')).toHaveCount(1);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`account-dashboard-${colorScheme}.png`),
      fullPage: true,
    });
    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: 'Your account', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('.content-card')
        .filter({
          has: page.getByRole('heading', { name: 'Your account', exact: true }),
        })
        .getByText(owner.email, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Your guest workspace', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`account-settings-${colorScheme}.png`),
      fullPage: true,
    });
  }
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(guestRaw);
  await page.getByRole('button', { name: 'Sign out', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Your guest workspace', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Welcome to your workspace.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Synthetic guest identity opportunity',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(guestRaw);
});

test('registration, account CRUD, interview notes, session cookie, logout/login, and reload persistence', async ({
  page,
}, info) => {
  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Email', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('sign-in.png'),
    fullPage: true,
  });
  const owner = await register(page);
  const matchingRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/matching')
      matchingRequests.push(request.method());
  });
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) =>
    cookie.name.includes('session_token'),
  );
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  const appUrl = await saveJob(page);
  await expect(
    page.getByRole('heading', {
      name: 'Resume comparison',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(matchingRequests).toEqual([]);
  for (const action of [null, 'prepare', 'compare', 'delete']) {
    const endpoint = '/api/matching?applicationId=' + appUrl.split('/').pop();
    const response = action
      ? await page.request.post(endpoint, {
          headers: { origin: browserTestOrigin },
          data: { action, confirmed: true },
        })
      : await page.request.get(endpoint);
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MATCHING_DISABLED' });
  }
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Applied');
  await expect(
    page.locator('.application-status').getByRole('status'),
  ).toHaveText('Status updated to Applied.');
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/^Job title/)
    .fill('Corrected account opportunity');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Schedule interview', exact: true })
    .click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Interview title/).fill('Account interview');
  await form.getByLabel(/^Date/).fill('2030-10-16');
  await form.getByLabel(/^Time \(/).fill('10:00');
  await form.getByLabel(/^Timezone/).fill('Asia/Manila');
  await form
    .getByLabel('Meeting URL', { exact: true })
    .fill('https://example.test/meeting');
  await form
    .getByRole('button', { name: 'Save interview', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Account interview', exact: true }),
  ).toBeVisible();
  const interviewUrl = page.url();
  await page
    .getByLabel('Preparation notes', { exact: true })
    .fill('Review projects.');
  await page
    .getByLabel('Post-interview reflections', { exact: true })
    .fill('Answered teamwork questions.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Your notes are saved.');
  await page
    .getByRole('button', { name: 'Mark completed', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Interview completed.');
  await page.reload();
  await expect(
    page.getByLabel('Post-interview reflections', { exact: true }),
  ).toHaveValue('Answered teamwork questions.');
  await page.goto('/settings');
  await page.screenshot({
    path: info.outputPath('account-settings.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in to an account', exact: true }),
  ).toBeVisible();
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  await page.goto(appUrl);
  await expect(
    page.getByRole('heading', {
      name: 'Corrected account opportunity',
      exact: true,
    }),
  ).toHaveCount(0);
  await signIn(page, owner.email);
  await page.goto(interviewUrl);
  await expect(
    page.getByLabel('Preparation notes', { exact: true }),
  ).toHaveValue('Review projects.');
  expect(
    (
      await db.pool.query('SELECT id FROM applications WHERE user_id=$1', [
        owner.id,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('explicit browser migration previews counts, cancels, preserves originals, and safely retries a lost commit response', async ({
  page,
}, info) => {
  const source = localData(),
    raw = await seedLocal(page, source);
  await register(page);
  expect(
    (await (await page.request.get('/api/workspace')).json()).applications,
  ).toHaveLength(0);
  const transfer = page.getByRole('region', {
    name: 'Bring your browser records with you',
    exact: true,
  });
  await transfer
    .getByRole('button', { name: 'Preview browser transfer', exact: true })
    .click();
  await expect(
    transfer.getByText('Applications to add', { exact: true }),
  ).toBeVisible();
  await transfer
    .getByRole('button', { name: 'Cancel transfer', exact: true })
    .click();
  expect(
    (await (await page.request.get('/api/workspace')).json()).applications,
  ).toHaveLength(0);
  await transfer
    .getByRole('button', { name: 'Preview browser transfer', exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath('migration-preview.png'),
    fullPage: true,
  });
  let drop = true;
  await page.route('**/api/workspace', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === 'migrate' && drop) {
      drop = false;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await transfer.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await transfer
    .getByRole('button', { name: 'Copy to account', exact: true })
    .click();
  await expect(transfer.getByRole('alert')).toContainText('interrupted');
  expect(
    (await (await page.request.get('/api/workspace')).json()).applications,
  ).toHaveLength(1);
  await transfer
    .getByRole('button', { name: 'Copy to account', exact: true })
    .click();
  await expect(transfer.getByRole('status')).toContainText(
    'Original local records were kept',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
  const copied = await (await page.request.get('/api/workspace')).json();
  expect(copied.applications).toEqual(source.applications);
  expect(copied.interviews).toEqual(
    [...source.interviews].sort((a, b) => a.id.localeCompare(b.id)),
  );
  await transfer
    .getByRole('button', { name: 'Preview browser transfer', exact: true })
    .click();
  await expect(
    transfer.getByText('This browser snapshot was already transferred.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.reload();
  await page.goto('/');
  await expect(page.getByLabel('Upcoming interview count')).toHaveText(
    '1 upcoming',
  );
  await page.goto('/applications');
  await expect(
    page.getByRole('link', { name: 'Legacy opportunity', exact: true }),
  ).toBeVisible();
});

test('account backup export and confirmed restore preserve all records and stay separate from browser data', async ({
  page,
}) => {
  const local = localData(),
    raw = await seedLocal(page, local);
  await register(page);
  const backup = serializeBackup(createBackup(local, new Date().toISOString()));
  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await page
    .getByRole('button', { name: 'Preview backup', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog
    .getByRole('button', { name: 'Replace workspace', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(
    JSON.parse(Buffer.concat(chunks).toString()).data.applications,
  ).toEqual(local.applications);
  await page.reload();
  expect(
    (await (await page.request.get('/api/workspace')).json()).interviews,
  ).toHaveLength(3);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
});

test('expired sessions preserve a form draft and never fall back to writing it locally', async ({
  page,
}) => {
  const owner = await register(page);
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Keep this unsaved draft');
  await dialog.getByLabel(/^Company/).fill('Example');
  await dialog.getByLabel(/^Location/).fill('Remote');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/unsaved');
  await db.pool.query(
    'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
    [owner.id],
  );
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('session ended');
  await expect(dialog.getByLabel(/^Job title/)).toHaveValue(
    'Keep this unsaved draft',
  );
  await expect(
    dialog.getByRole('link', { name: 'Sign in in a new tab', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  expect(
    (
      await db.pool.query('SELECT id FROM applications WHERE user_id=$1', [
        owner.id,
      ])
    ).rows,
  ).toHaveLength(0);
  const reconnect = await page.context().newPage();
  try {
    await signIn(reconnect, owner.email);
    await page.bringToFront();
    await expect(
      dialog.getByRole('button', { name: 'Save job', exact: true }),
    ).toBeEnabled();
    await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Keep this unsaved draft',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await db.pool.query('SELECT id FROM applications WHERE user_id=$1', [
          owner.id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBeNull();
  } finally {
    await reconnect.close();
  }
  await db.pool.query(
    'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
    [owner.id],
  );
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Let’s reconnect your account.',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Sign in again', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.', exact: true }),
  ).toBeVisible();
});

test('invalid login stays useful and another account cannot see or update saved records', async ({
  page,
  browser,
}) => {
  const owner = await register(page);
  const detail = await saveJob(page, 'Private account opportunity');
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    await second.goto(browserTestOrigin + '/sign-in');
    await second.getByLabel('Email', { exact: true }).fill(owner.email);
    await second
      .getByLabel('Password', { exact: true })
      .fill('Incorrect-password-42!');
    await second.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(second.getByRole('main').getByRole('alert')).toHaveText(
      'Unable to sign in. Check your email and password, or verify your email.',
    );
    await register(second);
    await second.goto(detail);
    await expect(
      second.getByRole('heading', {
        name: 'Private account opportunity',
        exact: true,
      }),
    ).toHaveCount(0);
    const id = detail.split('/').pop();
    const denied = await second.request.post('/api/workspace', {
      headers: { origin: browserTestOrigin },
      data: { action: 'delete-application', id },
    });
    expect(denied.status()).toBe(404);
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Private account opportunity',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test('momentum stays separate across guest/account workspaces and survives a fresh sign-in', async ({
  page,
}) => {
  async function momentum() {
    if ((page.viewportSize()?.width ?? 0) <= 760) {
      const toggle = page.getByRole('button', {
        name: /^(Open|Close) navigation$/,
      });
      await expect(toggle).toBeVisible();
      if ((await toggle.getAttribute('aria-expanded')) === 'false')
        await toggle.click();
    }
    return page.locator('.momentum:visible');
  }
  await saveJob(page, 'Synthetic guest momentum');
  await expect((await momentum()).locator('.momentum-streak')).toHaveText(
    '1day in a row',
  );
  const guestRaw = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  const account = await register(page);
  await expect((await momentum()).locator('.momentum-streak')).toHaveText(
    '0days in a row',
  );
  await saveJob(page, 'Synthetic account momentum');
  await expect((await momentum()).locator('.momentum-streak')).toHaveText(
    '1day in a row',
  );
  await page.reload();
  await expect((await momentum()).locator('.momentum-count')).toHaveText(
    '1 active day this week',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(guestRaw);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in to an account', exact: true }),
  ).toBeVisible();
  await expect((await momentum()).locator('.momentum-streak')).toHaveText(
    '1day in a row',
  );
  await signIn(page, account.email);
  await expect((await momentum()).locator('.momentum-streak')).toHaveText(
    '1day in a row',
  );
});

test('account application filters survive reload and detail return', async ({
  page,
}) => {
  await register(page);
  await saveJob(page, 'Synthetic filtered account');
  await page.goto('/applications?q=Synthetic&status=Saved');
  await expect(page.getByRole('searchbox')).toHaveValue('Synthetic');
  await page.reload();
  await expect(page.getByLabel('Filter by status')).toHaveValue('Saved');
  await page
    .getByRole('link', { name: 'Synthetic filtered account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Synthetic filtered account',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Back to applications', exact: true })
    .click();
  await expect(page.getByRole('searchbox')).toHaveValue('Synthetic');
  await expect(page.getByLabel('Filter by status')).toHaveValue('Saved');
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});
