import { test, expect, type Page } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { testEmail } from '../helpers/test-inbox';
import { pdfFixture } from '../helpers/document-fixtures';
import {
  FilesystemDocumentStorage,
  documentHash,
} from '../../apps/web/src/server/document-storage';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-intake-browser-passphrase!',
  pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!),
  owners: string[] = [];
const storage = new FilesystemDocumentStorage(
  new URL('../../test-results/account-documents/', import.meta.url).pathname,
);
async function user(page: Page) {
  const email = `intake-browser-${randomUUID()}@example.test`;
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
  return user.id as string;
}
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
// Explicit missing-scanner scenario, independent of the operator's PATH. No
// request interception or fake clean verdict is used.
test('unavailable safety checks preserve file form inputs and never publish a document', async ({
  page,
}, info) => {
  test.skip(
    process.env.FATS_TEST_CLAMAV === '1',
    'Run without the scanner opt-in to verify the unavailable-scanner configuration.',
  );
  const id = await user(page);
  await page.goto('/resumes');
  const opener = page.getByRole('button', {
    name: 'Upload document',
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Document name', { exact: true })
    .fill('Synthetic pending resume');
  await dialog.getByLabel('Document file', { exact: true }).setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfFixture(),
  });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/documents') && r.request().method() === 'PUT',
  );
  await dialog
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  expect((await response).status()).toBe(503);
  await expect(dialog.getByRole('alert')).toContainText(
    'Document safety checks are unavailable',
  );
  await expect(dialog.getByLabel('Document name', { exact: true })).toHaveValue(
    'Synthetic pending resume',
  );
  expect(
    (await pool.query('SELECT 1 FROM document_versions WHERE user_id=$1', [id]))
      .rowCount,
  ).toBe(0);
  expect(
    (await pool.query('SELECT 1 FROM document_objects WHERE user_id=$1', [id]))
      .rowCount,
  ).toBe(0);
  expect(
    await dialog
      .getByLabel('Document file', { exact: true })
      .evaluate((el: HTMLInputElement) => el.files?.length),
  ).toBe(1);
  await dialog.screenshot({ path: info.outputPath('scanner-unavailable.png') });
  await dialog
    .getByRole('button', { name: 'Close upload', exact: true })
    .click();
  await expect(opener).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('legacy files cannot preview, download or become usable, while confirmed account erasure removes legacy and quarantine bytes', async ({
  page,
}) => {
  const owner = await user(page),
    document = randomUUID(),
    version = randomUUID(),
    key = randomUUID(),
    pending = randomUUID(),
    bytes = await pdfFixture();
  // Synthetic pre-migration/restored fixture. No invented scan evidence.
  await storage.put(key, bytes);
  await storage.quarantine(pending, bytes);
  await pool.query(
    'INSERT INTO documents(user_id,id,name,category) VALUES($1,$2,$3,$4)',
    [owner, document, 'Synthetic legacy resume', 'Resumes'],
  );
  await pool.query(
    'INSERT INTO document_objects(user_id,storage_key,intake_state) VALUES($1,$2,$3),($1,$4,$5)',
    [owner, key, 'legacy', pending, 'quarantined'],
  );
  await pool.query(
    "INSERT INTO document_versions(user_id,document_id,id,version_number,original_filename,format,byte_size,sha256,storage_key) VALUES($1,$2,$3,1,'legacy.pdf','pdf',$4,$5,$6)",
    [owner, document, version, bytes.length, documentHash(bytes), key],
  );
  for (const suffix of ['', '&preview=1'])
    expect(
      (
        await page.request.get('/api/documents?version=' + version + suffix)
      ).status(),
    ).toBe(409);
  await page.goto('/resumes');
  await page
    .getByRole('button', {
      name: 'Open document Synthetic legacy resume',
      exact: true,
    })
    .click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/needs safety verification/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Download/ })).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Preview PDF', exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Close document', exact: true })
    .click();
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
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog
    .getByLabel('Type DELETE MY ACCOUNT', { exact: true })
    .fill('DELETE MY ACCOUNT');
  await dialog.getByRole('checkbox').check();
  await submit.click();
  await expect(page.getByRole('status')).toHaveText(
    'Your account and its live private files have been deleted.',
  );
  expect((await page.request.get('/api/documents')).status()).toBe(401);
  for (const path of [
    rootPath(key),
    storage.root + '/quarantine/' + pending + '.blob',
  ])
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(
    (
      await pool.query('SELECT 1 FROM document_objects WHERE user_id=$1', [
        owner,
      ])
    ).rowCount,
  ).toBe(0);
});
const rootPath = (key: string) => storage.root + '/' + key + '.blob';
