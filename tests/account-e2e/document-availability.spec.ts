import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
const password = 'Synthetic-availability-passphrase-42!';
test.afterAll(async () => {
  for (const id of owners)
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
});
async function register(page: Page) {
  const email = `availability-${randomUUID()}@example.test`;
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
  const { rows } = await pool.query('SELECT id FROM "user" WHERE email=$1', [
    email,
  ]);
  owners.push(rows[0].id);
  await completeAccountVerification(page, email, password);
  await expect(
    page.getByRole('heading', {
      name: 'Your resumes & documents',
      exact: true,
    }),
  ).toBeVisible();
}
for (const theme of ['light', 'dark'] as const)
  test(`${theme}: signing in preserves the honest restriction and metadata/PDF options`, async ({
    page,
  }, info) => {
    test.skip(
      process.env.FATS_TEST_CLAMAV === '1',
      'Requires the actual unavailable-scanner configuration.',
    );
    const errors: string[] = [];
    const uploads: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (
        r.method() === 'PUT' &&
        new URL(r.url()).pathname === '/api/documents'
      )
        uploads.push('upload');
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/resumes');
    await expect(page.locator('#document-availability')).toContainText(
      'Signing in does not remove this restriction',
    );
    await page
      .getByRole('link', { name: 'Sign in to manage documents', exact: true })
      .click();
    await register(page);
    const upload = page.getByRole('button', {
      name: 'Upload document',
      exact: true,
    });
    await expect(upload).toBeDisabled();
    await expect(
      page.getByRole('button', {
        name: 'Upload your first resume',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(upload).toHaveAttribute(
      'aria-describedby',
      'document-availability',
    );
    await expect(page.locator('#document-availability')).toContainText(
      'New document uploads are unavailable',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('account-library.png'),
      fullPage: true,
    });
    await page.reload();
    await expect(upload).toBeDisabled();
    await page
      .getByRole('link', { name: 'Open PDF Tools', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByLabel('Choose a local PDF', { exact: true }),
    ).toBeEnabled();
    await page.goto('/career-vault');
    await expect(
      page.getByRole('button', { name: 'Add employment', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText(
        'Track employment details and document notes without uploading files.',
        { exact: false },
      ),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('account-vault.png'),
      fullPage: true,
    });
    expect(uploads).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
