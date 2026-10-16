import { test as base, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { offerToday } from '@fats/domain';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { testEmail } from '../helpers/test-inbox';
import { pdfFixture } from '../helpers/document-fixtures';
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-offer-browser-passphrase-42!';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!),
  owners: string[] = [];
const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await run(page);
    expect(errors).toEqual([]);
  },
});
test.afterAll(async () => {
  for (const id of owners) {
    await pool.query('DELETE FROM offers WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM document_versions WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await pool.end();
});
async function setup(page: Page) {
  const email = `offer-browser-${randomUUID()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Offer Graduate' },
      })
    ).ok(),
  ).toBe(true);
  const text = await testEmail(email, 'Verify your FATS email');
  expect(
    (
      await page.request.post('/api/auth/verify-email', {
        headers: { origin },
        data: { email, code: text.match(/code is (\d{8})/)![1] },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  const { user } = await (await page.request.get('/api/account')).json();
  owners.push(user.id);
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Graduate Analyst');
  await dialog.getByLabel(/^Company/).fill('Synthetic First Employer');
  await dialog.getByLabel(/^Location/).fill('Makati');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/offer');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Graduate Analyst', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Application status').selectOption('Offer');
  await expect(page.getByText('Status updated to Offer.')).toBeVisible();
  return { url: page.url(), applicationId: page.url().split('/').pop()! };
}
async function decide(page: Page, action: string, submit: string) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: submit, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('offer terms, review, letter, deadline, negotiation, revisions and confirmed decisions survive reload', async ({
  page,
}, info) => {
  const { url, applicationId } = await setup(page);
  await page.getByRole('button', { name: 'Record offer', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(
    dialog.getByLabel('Gross salary amount', { exact: true }),
  ).not.toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Save offer', exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath('offer-form.png'),
    fullPage: true,
  });
  await dialog
    .getByLabel('Date offer received (required)', { exact: true })
    .fill('2026-10-16');
  await dialog
    .getByText('Salary and benefits (optional)', { exact: true })
    .click();
  await dialog
    .getByLabel('Gross salary amount', { exact: true })
    .fill('35000.0001');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Currency', { exact: true })).toBeFocused();
  await dialog.getByLabel('Payment frequency').selectOption('monthly');
  await dialog
    .getByText('Work and important dates (optional)', { exact: true })
    .click();
  await dialog
    .getByLabel('Offer response deadline', { exact: true })
    .fill(offerToday('Asia/Manila'));
  await dialog.getByRole('button', { name: 'Save offer', exact: true }).click();
  const desk = page.locator('#offer-desk');
  await expect(
    desk.getByText('PHP 35000.0001 / monthly', { exact: true }).first(),
  ).toBeVisible();
  await expect(desk.getByText(/Response due today/)).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Offer responses' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Review offer', exact: true }).click();
  await expect(page).toHaveURL(url + '#offer-desk');
  // Upload uses the established authenticated library endpoint; linking uses the offer form.
  const upload = await page.request.put('/api/documents', {
    headers: {
      origin,
      'content-type': 'application/octet-stream',
      'x-fats-upload': encodeURIComponent(
        JSON.stringify({
          requestId: randomUUID(),
          filename: 'offer-letter.pdf',
          name: 'Synthetic offer letter',
          category: 'Other application documents',
        }),
      ),
    },
    data: await pdfFixture('Synthetic offer letter'),
  });
  expect(upload.ok()).toBe(true);
  const { versionId } = await upload.json();
  await page.reload();
  await desk
    .getByRole('button', { name: 'Add negotiation note', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Negotiation note (required)')
    .fill('Requested PHP 40000 monthly.');
  await dialog.getByRole('button', { name: 'Save negotiation note' }).click();
  await expect(dialog).not.toBeVisible();
  await desk
    .getByRole('button', { name: 'Record revised terms or letter' })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Gross salary amount', { exact: true }).fill('38000');
  await dialog
    .getByText('Contract notes and letter (optional)', { exact: true })
    .click();
  await dialog
    .getByLabel('Offer letter or contract version')
    .selectOption(versionId);
  await dialog
    .getByRole('button', { name: 'Save revised terms', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await desk
    .getByRole('button', { name: 'Review checklist and HR questions' })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Salary and payment frequency')
    .selectOption('Reviewed');
  await dialog
    .getByLabel('Working hours and schedule')
    .selectOption('Need to clarify');
  await dialog
    .getByLabel('Your questions for HR')
    .fill('What time does the workday start?');
  await dialog
    .getByRole('button', { name: 'Save review', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    desk.getByText('1 of 10 terms reviewed · 1 to clarify'),
  ).toBeVisible();
  await desk.getByText('Offer history', { exact: true }).click();
  await expect(desk.getByText('Requested PHP 40000 monthly.')).toBeVisible();
  await expect(
    desk.getByText('PHP 35000.0001 / monthly', { exact: true }).first(),
  ).toBeVisible();
  await desk
    .getByRole('link', { name: /^Download offer-letter/ })
    .first()
    .click();
  await desk
    .getByRole('button', { name: 'Preview PDF', exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await desk
    .getByRole('button', { name: 'Record acceptance', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Confirm: record acceptance', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(desk.getByText('Reviewing', { exact: true })).toBeVisible();
  await expect(
    desk.getByRole('button', { name: 'Record acceptance', exact: true }),
  ).toBeFocused();
  await decide(page, 'Record acceptance', 'Confirm: record acceptance');
  await page.reload();
  await expect(
    desk.getByText('Acceptance recorded', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Application status')).toHaveValue('Offer');
  await page.screenshot({
    path: info.outputPath('offer-desk.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const saved = await (await page.request.get('/api/offers')).json();
  expect(saved[0]).toMatchObject({
    applicationId,
    state: 'accepted',
    version: 5,
  });
  expect(
    saved[0].events
      .filter((e: { kind: string }) => e.kind === 'terms')
      .map((e: { terms: { salaryAmount: string } }) => e.terms.salaryAmount),
  ).toEqual(['35000.0001', '38000']);
  await decide(page, 'Continue reviewing', 'Confirm: continue reviewing');
  await decide(page, 'Record decline', 'Confirm: record decline');
  await expect(
    desk.getByText('Decline recorded', { exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Offer responses' }),
  ).not.toBeVisible();
});
test('minimal offer, failed save recovery, deadline awareness, stale-tab protection and employer withdrawal', async ({
  page,
}, info) => {
  const { applicationId } = await setup(page);
  await page.getByRole('button', { name: 'Record offer', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date offer received (required)').fill('2026-10-16');
  await page.route('**/api/offers', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Synthetic unavailable storage. Keep your inputs and retry.',
          }),
        })
      : route.continue(),
  );
  await dialog.getByRole('button', { name: 'Save offer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Synthetic unavailable storage',
  );
  await expect(dialog.getByLabel('Date offer received (required)')).toHaveValue(
    '2026-10-16',
  );
  await page.unroute('**/api/offers');
  await dialog.getByRole('button', { name: 'Save offer', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const desk = page.locator('#offer-desk');
  await expect(
    desk.getByText('Salary not recorded', { exact: true }).first(),
  ).toBeVisible();
  await desk
    .getByRole('button', { name: 'Record revised terms or letter' })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByText('Work and important dates (optional)', { exact: true })
    .click();
  await dialog
    .getByLabel('Offer response deadline', { exact: true })
    .fill('2020-10-20');
  expect(
    (
      await page.request.post('/api/offers', {
        headers: { origin },
        data: {
          applicationId,
          requestId: randomUUID(),
          baseVersion: 1,
          command: {
            kind: 'negotiation',
            occurredOn: '2026-10-18',
            notes: 'Other tab note',
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await dialog
    .getByRole('button', { name: 'Save revised terms', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'changed in another tab',
  );
  await dialog
    .getByRole('button', { name: 'Reload saved offer; keep my draft' })
    .click();
  await expect(
    dialog.getByLabel('Offer response deadline', { exact: true }),
  ).toHaveValue('2020-10-20');
  await dialog
    .getByRole('button', { name: 'Save revised terms', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(desk.getByText(/Response deadline passed/)).toBeVisible();
  await expect(desk.getByText('Reviewing', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('offer-passed-deadline.png'),
    fullPage: true,
  });
  await decide(
    page,
    'Mark withdrawn by employer',
    'Confirm: mark withdrawn by employer',
  );
  await page.reload();
  await expect(
    desk.getByText('Withdrawn by employer', { exact: true }),
  ).toBeVisible();
});

test('a lost committed response and background refresh preserve the original creation request for retry', async ({
  page,
}) => {
  const { applicationId } = await setup(page);
  await page.getByRole('button', { name: 'Record offer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date offer received (required)').fill('2026-10-01');
  await page.route('**/api/offers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Synthetic lost response. Keep your inputs and retry.',
      }),
    });
  });
  await dialog.getByRole('button', { name: 'Save offer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Synthetic lost response',
  );
  await page.unroute('**/api/offers');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#offer-desk .offer-salary')).toHaveText(
    'Salary not recorded',
  );
  await expect(
    dialog.getByRole('heading', { name: 'Record offer', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Save offer', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const offers = await (await page.request.get('/api/offers')).json();
  const offer = offers.find(
    (o: { applicationId: string }) => o.applicationId === applicationId,
  );
  expect(offer.version).toBe(1);
  expect(offer.events).toHaveLength(1);
  expect(offer.events[0]).toMatchObject({
    occurredOn: '2026-10-01',
    terms: { receivedOn: '2026-10-01' },
  });
});
