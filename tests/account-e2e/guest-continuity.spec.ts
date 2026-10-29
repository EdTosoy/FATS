import { test as base, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createServices } from '../../apps/web/src/server/services';
import { browserTestOrigin } from '../helpers/browser-origin';
import { completeAccountVerification } from '../helpers/test-inbox';
const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await run(page);
    expect(errors).toEqual([]);
  },
});
const password = 'Synthetic-continuity-passphrase-42!';
const db = createServices(
  process.env.FATS_TEST_DATABASE_URL!,
  browserTestOrigin,
  randomUUID() + randomUUID(),
);
const owners: string[] = [];
test.beforeEach(async () => {
  await db.pool.query('DELETE FROM "rateLimit"');
});
test.afterAll(async () => {
  for (const id of owners)
    await db.pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await db.pool.end();
});
async function register(page: Page, interrupted = false) {
  const email = `continuity-${randomUUID()}@example.test`;
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByLabel('Your name', { exact: true })
    .fill('Synthetic Graduate');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Verify your email', exact: true }),
  ).toBeVisible();
  const created = await db.pool.query('SELECT id FROM "user" WHERE email=$1', [
    email,
  ]);
  owners.push(created.rows[0].id);
  if (interrupted) {
    await page.reload();
    await page
      .getByRole('link', { name: 'Verify your email or request a new code' })
      .click();
    await page.getByLabel('Email', { exact: true }).fill(email);
  }
  await completeAccountVerification(page, email, password);
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/account')).json()).user?.email,
    )
    .toBe(email);
  const { user } = await (await page.request.get('/api/account')).json();
  return { email, id: user.id as string };
}
async function saveJob(page: Page, title = 'Synthetic graduate role') {
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Job title/).fill(title);
  await form.getByLabel(/^Company/).fill('Example Company');
  await form.getByLabel(/^Location/).fill('Makati');
  await form.getByLabel(/^Source URL/).fill('https://example.test/job');
  await form.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  return new URL(page.url()).pathname;
}
async function workspace(page: Page) {
  return (await page.request.get('/api/workspace')).json();
}
async function signIn(page: Page, email: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Bring your browser records with you',
      exact: true,
    }),
  ).toBeVisible();
}
const transfer = (page: Page) =>
  page.getByRole('region', {
    name: 'Bring your browser records with you',
    exact: true,
  });
async function preview(page: Page) {
  await transfer(page)
    .getByRole('button', { name: 'Preview browser transfer' })
    .click();
  await expect(
    transfer(page).getByText('Applications to add', { exact: true }),
  ).toBeVisible();
}
async function copy(page: Page) {
  await transfer(page).getByRole('checkbox').check();
  await transfer(page)
    .getByRole('button', { name: 'Copy to account', exact: true })
    .click();
}
for (const theme of ['light', 'dark'] as const)
  test(`${theme}: new registration retains Offer Desk through interruptions, cancellation, confirmed copy and reload`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const detail = await saveJob(page);
    const original = await page.evaluate(() =>
      localStorage.getItem('fats.applications.v1'),
    );
    await page
      .getByRole('combobox', { name: 'Application status', exact: true })
      .selectOption('Offer');
    await expect(
      page.locator('.application-status').getByRole('status'),
    ).toHaveText('Status updated to Offer.');
    const raw = await page.evaluate(() =>
      localStorage.getItem('fats.applications.v1'),
    );
    expect(raw).not.toBe(original);
    await page.locator('#offer-desk').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('offer-gate.png'),
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Sign in for Offer Desk' }).click();
    await expect(
      page.getByText('Then review your browser records', { exact: false }),
    ).toBeVisible();
    await page.reload();
    await page.screenshot({
      path: info.outputPath('sign-in.png'),
      fullPage: true,
    });
    await register(page, true);
    await expect(transfer(page)).toBeVisible();
    expect((await workspace(page)).applications).toHaveLength(0);
    await page.reload();
    await preview(page);
    await expect(
      transfer(page).getByRole('button', {
        name: 'Copy to account',
        exact: true,
      }),
    ).toBeDisabled();
    await transfer(page)
      .getByRole('button', { name: 'Cancel transfer' })
      .click();
    await expect(transfer(page).getByRole('status')).toContainText(
      'No records changed',
    );
    expect((await workspace(page)).applications).toHaveLength(0);
    await preview(page);
    await transfer(page).getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(transfer(page).getByRole('checkbox')).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(
      transfer(page).getByRole('button', { name: 'Cancel transfer' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      transfer(page).getByRole('button', {
        name: 'Copy to account',
        exact: true,
      }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath('preview.png'),
      fullPage: true,
    });
    await page.keyboard.press('Enter');
    await expect(transfer(page).getByRole('status')).toContainText(
      'Original local records were kept',
    );
    await expect(
      page.getByRole('link', { name: 'Continue to Offer Desk', exact: true }),
    ).toBeVisible();
    await expect(transfer(page).getByRole('heading')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Continue to Offer Desk', exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath('success.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBe(raw);
    expect((await workspace(page)).applications).toHaveLength(1);
    // A reload loses consent, not the destination. A new preview safely identifies the completed snapshot.
    await page.reload();
    await preview(page);
    await expect(transfer(page)).toContainText(
      'This browser snapshot was already transferred',
    );
    await expect(transfer(page).getByRole('checkbox')).not.toBeChecked();
    await copy(page);
    expect((await workspace(page)).applications).toHaveLength(1);
    await page
      .getByRole('link', { name: 'Continue to Offer Desk', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(detail + '#offer-desk$'));
    await expect(
      page.getByRole('heading', {
        name: 'Synthetic graduate role',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .locator('#offer-desk')
        .getByRole('button', { name: 'Record offer', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Application status', exact: true }),
    ).toHaveValue('Offer');
    await page.screenshot({
      path: info.outputPath('offer-return.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test('existing account keeps its records through failed and lost transfer responses and reauthentication', async ({
  page,
}, info) => {
  await page.goto('/sign-in');
  const owner = await register(page);
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  await saveJob(page, 'Existing account role');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your guest workspace', exact: true }),
  ).toBeVisible();
  const detail = await saveJob(page);
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Offer');
  await expect(
    page.locator('.application-status').getByRole('status'),
  ).toHaveText('Status updated to Offer.');
  const raw = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  await page.getByRole('link', { name: 'Sign in for Offer Desk' }).click();
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Wrong-synthetic-password-42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await signIn(page, owner.email);
  await preview(page);
  await db.pool.query('DELETE FROM session WHERE "userId"=$1', [owner.id]);
  await page.reload();
  await page.getByRole('link', { name: 'Sign in again', exact: true }).click();
  await signIn(page, owner.email);
  await expect(transfer(page).getByRole('checkbox')).toHaveCount(0);
  await preview(page);
  let attempts = 0;
  await page.route('**/api/workspace', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON()?.action === 'migrate'
    ) {
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Synthetic transfer failure. Retry your confirmed preview.',
          }),
        });
      if (attempts === 2) {
        await route.fetch();
        return route.abort('failed');
      }
    }
    await route.continue();
  });
  await copy(page);
  await expect(transfer(page).getByRole('alert')).toContainText(
    'Synthetic transfer failure',
  );
  expect((await workspace(page)).applications).toHaveLength(1);
  await transfer(page)
    .getByRole('button', { name: 'Copy to account', exact: true })
    .click();
  await expect(transfer(page).getByRole('alert')).toContainText('interrupted');
  expect((await workspace(page)).applications).toHaveLength(2);
  await transfer(page).getByRole('button', { name: 'Cancel transfer' }).click();
  await expect(transfer(page).getByRole('status')).toContainText(
    'If copying was interrupted',
  );
  await preview(page);
  await expect(transfer(page)).toContainText(
    'This browser snapshot was already transferred',
  );
  await transfer(page).getByRole('checkbox').check();
  await page.screenshot({
    path: info.outputPath('interrupted-copy.png'),
    fullPage: true,
  });
  await transfer(page)
    .getByRole('button', { name: 'Copy to account', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Continue to Offer Desk', exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(3);
  expect(
    (await workspace(page)).applications
      .map((a: { title: string }) => a.title)
      .sort(),
  ).toEqual(['Existing account role', 'Synthetic graduate role']);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(raw);
  await page
    .getByRole('link', { name: 'Continue to Offer Desk', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(detail + '#offer-desk$'));
});

test('empty browser workspace explains the boundary without an empty transfer or invented application', async ({
  page,
}, info) => {
  await page.goto('/continue-offer/synthetic-missing-id');
  await page.getByRole('link', { name: 'Sign in for Offer Desk' }).click();
  await register(page);
  await expect(transfer(page)).toContainText(
    'No browser applications were found',
  );
  await expect(
    transfer(page).getByRole('button', { name: 'Preview browser transfer' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Continue to Offer Desk', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('empty-browser.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Open account applications without copying' })
    .click();
  await expect(page).toHaveURL(/\/applications$/);
  expect((await workspace(page)).applications).toHaveLength(0);
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
});

test('a saved copy with a failed view refresh reports the partial outcome and recovers without duplicates', async ({
  page,
}, info) => {
  const detail = await saveJob(page);
  await page
    .getByRole('combobox', { name: 'Application status', exact: true })
    .selectOption('Offer');
  await expect(
    page.locator('.application-status').getByRole('status'),
  ).toHaveText('Status updated to Offer.');
  await page.getByRole('link', { name: 'Sign in for Offer Desk' }).click();
  await register(page);
  await expect(transfer(page)).toBeVisible();
  await preview(page);
  let failRead = false;
  await page.route('**/api/workspace', async (route) => {
    const request = route.request();
    if (
      request.method() === 'POST' &&
      request.postDataJSON()?.action === 'migrate'
    ) {
      const response = await route.fetch();
      failRead = true;
      return route.fulfill({ response });
    }
    if (request.method() === 'GET' && failRead) {
      failRead = false;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic account view unavailable.' }),
      });
    }
    await route.continue();
  });
  await copy(page);
  await expect(transfer(page).getByRole('alert')).toContainText(
    'Records were copied, but your account view could not refresh',
  );
  await expect(
    page.getByRole('link', { name: 'Continue to Offer Desk', exact: true }),
  ).toHaveCount(0);
  expect((await workspace(page)).applications).toHaveLength(1);
  await page.screenshot({
    path: info.outputPath('saved-copy-refresh-failed.png'),
    fullPage: true,
  });
  await page.unroute('**/api/workspace');
  await page.reload();
  await preview(page);
  await expect(transfer(page)).toContainText(
    'This browser snapshot was already transferred',
  );
  await copy(page);
  await page
    .getByRole('link', { name: 'Continue to Offer Desk', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(detail + '#offer-desk$'));
  expect((await workspace(page)).applications).toHaveLength(1);
});

test('signed-in continuation avoids another authentication prompt', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await register(page);
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  await page.goto(
    '/sign-in?next=' +
      encodeURIComponent('/continue-offer/synthetic-missing-id'),
  );
  await expect(
    page.getByRole('heading', { name: 'You’re signed in.', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Continue to Offer Desk', exact: true })
    .click();
  await expect(transfer(page)).toContainText(
    'No browser applications were found',
  );
  expect((await workspace(page)).applications).toHaveLength(0);
});
