import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { completeAccountVerification } from '../helpers/test-inbox';

test('hosted account without file storage retains local PDFs and fails uploads closed', async ({
  page,
}) => {
  test.skip(
    process.env.FATS_TEST_WITHOUT_STORAGE !== '1',
    'Dedicated hosted configuration only.',
  );
  const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
  const email = `hosted-storage-${randomUUID()}@example.test`;
  const password = 'Synthetic-hosted-storage-passphrase!';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/sign-in');
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
    await completeAccountVerification(page, email, password);
    await expect(
      page.getByRole('heading', { name: 'Workspace settings', exact: true }),
    ).toBeVisible();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto('/resumes');
      await expect(
        page.getByRole('heading', {
          name: 'Your documents are unavailable.',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Private document storage is not configured' }),
      ).toBeVisible();
      await expect(page.locator('#document-availability')).toContainText(
        'New document uploads are unavailable',
      );
      await expect(
        page.getByRole('button', { name: 'Upload document', exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole('link', { name: 'Open PDF Tools', exact: true })
        .click();
      await expect(
        page.getByLabel('Choose a local PDF', { exact: true }),
      ).toBeEnabled();
    }
    const denied = await page.request.put('/api/documents', {
      headers: {
        origin: new URL(page.url()).origin,
        'content-type': 'application/octet-stream',
      },
      data: Buffer.from('Synthetic untrusted bytes'),
    });
    expect(denied.status()).toBe(503);
    const { rows } = await pool.query('SELECT id FROM "user" WHERE email=$1', [
      email,
    ]);
    expect(
      (
        await pool.query('SELECT 1 FROM document_versions WHERE user_id=$1', [
          rows[0].id,
        ])
      ).rowCount,
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await pool.query('DELETE FROM "user" WHERE email=$1', [email]);
    await pool.end();
  }
});
