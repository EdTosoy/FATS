import { expect, type Page } from '@playwright/test';

// Only the isolated synthetic-account inbox. Never reads a user's mailbox.
export async function testEmail(
  email: string,
  subject: string,
  previousText?: string,
): Promise<string> {
  if (!/^[a-z0-9-]+@example\.test$/.test(email))
    throw new Error('Use a synthetic test email address.');
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const response = await fetch(
      'http://127.0.0.1:18025/api/v1/search?query=' +
        encodeURIComponent('to:' + email),
    );
    if (!response.ok)
      throw new Error('Start the isolated test inbox with pnpm mail:test:up.');
    const list = (await response.json()) as {
      messages: { ID: string; Subject: string }[];
    };
    const message = list.messages.find(
      (message) => message.Subject === subject,
    );
    if (message) {
      const full = (await (
        await fetch('http://127.0.0.1:18025/api/v1/message/' + message.ID)
      ).json()) as { Text: string };
      if (full.Text !== previousText) return full.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    'The synthetic account email did not arrive. No message contents were logged.',
  );
}
export async function completeAccountVerification(
  page: Page,
  email: string,
  password: string,
) {
  await expect(
    page.getByRole('heading', { name: 'Verify your email', exact: true }),
  ).toBeVisible();
  const text = await testEmail(email, 'Verify your FATS email');
  const code = text.match(/code is (\d{8})/)?.[1];
  if (!code) throw new Error('Verification email did not contain a code.');
  await page.getByLabel('Verification code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Email verified.', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Sign in to continue', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
