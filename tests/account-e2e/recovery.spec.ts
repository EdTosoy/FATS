import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { browserTestOrigin } from '../helpers/browser-origin';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification, testEmail } from '../helpers/test-inbox';
const password = 'Synthetic-recovery-passphrase-42!';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
test.beforeEach(async () => {
  await pool.query('DELETE FROM "rateLimit"');
});
test.afterAll(async () => {
  for (const id of owners) {
    await pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await pool.end();
});
async function register(page: Page, verify = true) {
  const email = `recovery-${randomUUID()}@example.test`;
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page.getByLabel('Your name', { exact: true }).fill('Recovery Graduate');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Verify your email', exact: true }),
  ).toBeVisible();
  const id = (await pool.query('SELECT id FROM "user" WHERE email=$1', [email]))
    .rows[0].id as string;
  owners.push(id);
  if (verify) {
    await completeAccountVerification(page, email, password);
    await expect(
      page.getByRole('heading', { name: 'Workspace settings', exact: true }),
    ).toBeVisible();
  }
  return { email, id };
}
test('email verification handles incorrect codes, cooldown, keyboard focus, and verified status', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const owner = await register(page, false),
    text = await testEmail(owner.email, 'Verify your FATS email'),
    code = text.match(/code is (\d{8})/)![1];
  await page.getByLabel('Email', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByLabel('Verification code', { exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  await page
    .getByLabel('Verification code', { exact: true })
    .fill(code === '00000000' ? '11111111' : '00000000');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'invalid, expired, or already used',
  );
  await page.getByLabel('Verification code', { exact: true }).fill('');
  await page.screenshot({
    path: info.outputPath('verification-error.png'),
    fullPage: true,
  });
  await completeAccountVerification(page, owner.email, password);
  await expect(page.getByText('Email verified', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('forgot/reset flow uses real email, protects the token URL, revokes sessions and keeps saved records', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const owner = await register(page),
    id = randomUUID();
  const created = await page.request.post('/api/workspace', {
    headers: { origin: browserTestOrigin },
    data: {
      action: 'create',
      id,
      input: {
        title: 'Keep this opportunity',
        company: 'Example',
        sourceUrl: 'https://example.test/recovery',
        location: 'Remote',
        description: 'Recovery keeps records.',
      },
    },
  });
  expect(created.ok()).toBe(true);
  const oldCookie = (await page.context().cookies())
    .map((cookie) => cookie.name + '=' + cookie.value)
    .join('; ');
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page
    .getByRole('button', { name: 'Send reset link', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'If an account uses this email',
  );
  const mail = await testEmail(owner.email, 'Reset your FATS password'),
    link = mail.match(/https?:\/\/\S+/)![0],
    token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto(link);
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.screenshot({
    path: info.outputPath('reset-password.png'),
    fullPage: true,
  });
  const changed = 'Synthetic-recovered-passphrase-43!';
  await page.getByLabel('New password', { exact: true }).fill(changed);
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('Synthetic-different-passphrase!');
  await page
    .getByRole('button', { name: 'Reset password', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'do not match',
  );
  await page.getByLabel('Confirm new password', { exact: true }).fill(changed);
  await page
    .getByRole('button', { name: 'Reset password', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Your password is updated.',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await page.request.get('/api/workspace', {
        headers: { cookie: oldCookie },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole('link', { name: 'Back to sign in', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/workspace')).json()).applications[0]
      .id,
  ).toBe(id);
  await page.goto(link);
  await page.getByLabel('New password', { exact: true }).fill(changed);
  await page.getByLabel('Confirm new password', { exact: true }).fill(changed);
  await page
    .getByRole('button', { name: 'Reset password', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'invalid, expired, or already used',
  );
  expect(urls.every((url) => !url.includes(token))).toBe(true);
  expect(errors).toEqual([]);
});
test('unverified existing accounts keep their records and recovery pages stay accessible after session expiry', async ({
  page,
}) => {
  const owner = await register(page);
  const saved = await page.request.post('/api/workspace', {
    headers: { origin: browserTestOrigin },
    data: {
      action: 'create',
      id: randomUUID(),
      input: {
        title: 'Existing account record',
        company: 'Example',
        sourceUrl: 'https://example.test/legacy-account',
        location: 'Remote',
        description: '',
      },
    },
  });
  expect(saved.ok()).toBe(true);
  await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1', [
    owner.id,
  ]);
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'One more step for your account.',
      exact: true,
    }),
  ).toBeVisible();
  expect((await page.request.get('/api/workspace')).status()).toBe(403);
  await page
    .getByRole('link', { name: 'Verify your email', exact: true })
    .click();
  const previous = await testEmail(owner.email, 'Verify your FATS email');
  await page
    .getByRole('button', { name: 'Send a new code', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Only the newest code works',
  );
  const next = await testEmail(owner.email, 'Verify your FATS email', previous);
  await page
    .getByLabel('Verification code', { exact: true })
    .fill(next.match(/code is (\d{8})/)![1]);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await page
    .getByRole('link', { name: 'Continue to your workspace', exact: true })
    .click();
  await expect(page.getByText('Email verified', { exact: true })).toBeVisible();
  expect(
    (await (await page.request.get('/api/workspace')).json()).applications,
  ).toHaveLength(1);
  await pool.query(
    'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
    [owner.id],
  );
  await page.goto('/forgot-password');
  await page
    .getByLabel('Email', { exact: true })
    .fill('missing-' + randomUUID() + '@example.test');
  await page
    .getByRole('button', { name: 'Send reset link', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'If an account uses this email',
  );
  await page.goto('/reset-password');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'missing or unavailable',
  );
});
