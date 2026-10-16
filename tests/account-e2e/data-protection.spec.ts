import { access } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { testEmail } from '../helpers/test-inbox';
import { pdfFixture, docxFixture } from '../helpers/document-fixtures';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-erasure-browser-passphrase!';
const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
const storage = new FilesystemDocumentStorage(
  new URL('../../test-results/account-documents/', import.meta.url).pathname,
);
test.afterAll(async () => {
  for (const id of owners) {
    const receipt = randomBytes(32).toString('hex');
    try {
      await beginAccountErasure(pool, id, receipt);
      await recoverAccountErasure(pool, receipt, storage);
    } catch {}
  }
  await pool.end();
});
test('account deletion confirmation, keyboard cancel, invalid upload feedback and actual private file erasure', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = `erasure-browser-${randomUUID()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Synthetic Graduate' },
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
  await page.goto('/resumes');
  await page
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Document name', { exact: true })
    .fill('Synthetic resume');
  await dialog.getByLabel('Document file', { exact: true }).setInputFiles({
    name: 'bad.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n%%EOF'),
  });
  await dialog
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'malformed, unsupported, or exceeded safe processing limits',
  );
  await expect(dialog.getByLabel('Document name', { exact: true })).toHaveValue(
    'Synthetic resume',
  );
  await dialog.getByLabel('Document file', { exact: true }).setInputFiles({
    name: 'resume.docx',
    mimeType: 'application/octet-stream',
    buffer: docxFixture(),
  });
  await dialog
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  // A second actual PDF establishes both native parser paths in the production server.
  const upload = await page.request.put('/api/documents', {
    headers: {
      origin,
      'content-type': 'application/octet-stream',
      'x-fats-upload': encodeURIComponent(
        JSON.stringify({
          requestId: randomUUID(),
          filename: 'resume.pdf',
          name: 'Synthetic PDF',
          category: 'Resumes',
        }),
      ),
    },
    data: await pdfFixture(),
  });
  expect(upload.ok()).toBe(true);
  const files = (
    await pool.query(
      'SELECT storage_key FROM document_objects WHERE user_id=$1',
      [user.id],
    )
  ).rows;
  expect(files).toHaveLength(2);
  await page.goto('/settings');
  const opener = page.getByRole('button', {
    name: 'Delete account…',
    exact: true,
  });
  await opener.click();
  dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', {
    name: 'Permanently delete account',
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Type DELETE MY ACCOUNT', { exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByLabel('Type DELETE MY ACCOUNT', { exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect((await page.request.get('/api/workspace')).ok()).toBe(true);
  await opener.click();
  await dialog
    .getByLabel('Type DELETE MY ACCOUNT', { exact: true })
    .fill('DELETE MY ACCOUNT');
  await dialog.getByRole('checkbox').check();
  await expect(submit).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/hardening-confirmation-${info.project.name}.png`,
    fullPage: true,
  });
  const other = await page.context().newPage();
  await other.goto('/resumes');
  await expect(
    other.getByRole('button', {
      name: 'Open document Synthetic resume',
      exact: true,
    }),
  ).toBeVisible();
  await page.bringToFront();
  await submit.click();
  await expect(page.getByRole('status')).toHaveText(
    'Your account and its live private files have been deleted.',
  );
  expect((await page.request.get('/api/documents')).status()).toBe(401);
  for (const file of files) {
    await expect(
      access(storage.root + '/' + file.storage_key + '.blob'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }
  expect(
    (await pool.query('SELECT 1 FROM "user" WHERE id=$1', [user.id])).rowCount,
  ).toBe(0);
  await expect(
    other.getByRole('heading', { name: 'Account deletion', exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole('button', {
      name: 'Open document Synthetic resume',
      exact: true,
    }),
  ).not.toBeVisible();
  await other.close();
  await page.getByRole('button', { name: 'Return to sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(errors).toEqual([]);
});
