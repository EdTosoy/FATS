import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { testEmail } from '../helpers/test-inbox';
import { pdfFixture, docxFixture } from '../helpers/document-fixtures';
const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await run(page);
    expect(errors).toEqual([]);
  },
});
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-library-passphrase-42!',
  pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const owners: string[] = [];
test.afterAll(async () => {
  for (const id of owners) {
    await pool.query(
      'DELETE FROM application_document_versions WHERE user_id=$1',
      [id],
    );
    await pool.query('DELETE FROM document_versions WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await pool.end();
});
test('private library, exact submitted version, preview/download, archive, filters and reload', async ({
  page,
}, info) => {
  const email = `library-${randomUUID()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Library Graduate' },
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
  const pdf = await pdfFixture('Synthetic developer resume');
  await page.goto('/resumes');
  await expect(
    page.getByRole('heading', { name: 'Make a little room for your story.' }),
  ).toBeVisible();
  const upload = page.getByRole('button', {
    name: 'Upload document',
    exact: true,
  });
  await upload.click();
  let dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Upload a document' }),
  ).toBeVisible();
  await dialog.getByLabel('Document name', { exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Close upload' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(upload).toBeFocused();
  await upload.click();
  await dialog.getByLabel('Document file', { exact: true }).setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/octet-stream',
    buffer: pdf,
  });
  await dialog
    .getByLabel('Document name', { exact: true })
    .fill('Software Developer Resume');
  await dialog
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('button', {
      name: 'Open document Software Developer Resume',
      exact: true,
    })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Make default resume' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Clear default' }),
  ).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await dialog
    .getByRole('link', { name: /Download resume.pdf version 1/ })
    .click();
  expect((await downloaded).suggestedFilename()).toBe('resume.pdf');
  const previewResponse = page.waitForResponse((r) =>
    r.url().includes('preview=1'),
  );
  await dialog.getByRole('button', { name: 'Preview PDF' }).click();
  expect((await previewResponse).status()).toBe(200);
  const preview = page.getByRole('dialog', {
    name: 'PDF preview',
    exact: true,
  });
  await expect(
    preview.getByRole('img', { name: 'PDF page 1' }),
  ).toHaveAttribute('data-rendered', 'true');
  expect(
    await preview.locator('canvas').evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d')!;
      const pixels = context.getImageData(
        0,
        0,
        element.width,
        element.height,
      ).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i] < 180 &&
          pixels[i + 1] < 180 &&
          pixels[i + 2] < 180 &&
          pixels[i + 3] > 0
        )
          dark++;
      return dark > 100;
    }),
  ).toBe(true);
  await preview.screenshot({ path: info.outputPath('pdf-preview.png') });
  await preview.getByRole('button', { name: 'Close preview' }).click();
  await dialog.getByRole('button', { name: 'Close document' }).click();
  // Real form -> application API -> PostgreSQL, followed by an explicit version choice.
  await page.goto('/applications');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save a job', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Graduate Developer');
  await dialog.getByLabel(/^Company/).fill('Example Library');
  await dialog.getByLabel(/^Location/).fill('Remote');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/library');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Graduate Developer', exact: true }),
  ).toBeVisible();
  const appUrl = page.url();
  const submitted = page.locator('.application-documents');
  await submitted
    .getByRole('button', { name: 'Select submitted resume' })
    .click();
  await submitted
    .getByLabel('Resume', { exact: true })
    .selectOption({ label: 'Software Developer Resume · Default' });
  await submitted
    .getByLabel('Resume version', { exact: true })
    .selectOption({ index: 1 });
  await submitted
    .getByRole('button', { name: 'Record submitted version' })
    .click();
  await expect(
    submitted.getByText('Version 1 · resume.pdf', { exact: true }),
  ).toBeVisible();
  await page.goto('/resumes');
  await page
    .getByRole('button', {
      name: 'Open document Software Developer Resume',
      exact: true,
    })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Add version', exact: true })
    .click();
  await dialog.getByLabel('New version file').setInputFiles({
    name: 'resume-v2.docx',
    mimeType: 'application/octet-stream',
    buffer: docxFixture(),
  });
  await dialog
    .getByRole('button', { name: 'Upload new version', exact: true })
    .click();
  await expect(
    dialog.getByText('Version 2 · Latest', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/Deletion is blocked/)).toBeVisible();
  await dialog
    .getByLabel('Document name', { exact: true })
    .fill('Developer Resume');
  await dialog.getByRole('button', { name: 'Save details' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Developer Resume', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close document' }).click();
  await page.goto(appUrl);
  await page.reload();
  await expect(
    submitted.getByText('Version 1 · resume.pdf', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('submitted-resume.png'),
    fullPage: true,
  });
  await page.goto('/resumes');
  await page
    .getByRole('button', {
      name: 'Open document Developer Resume',
      exact: true,
    })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Archive document', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Close document' }).click();
  await expect(
    page.getByRole('heading', { name: 'No documents match.', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Show', { exact: true }).selectOption('Archived');
  await expect(
    page.getByRole('heading', { name: 'Developer Resume', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search documents', { exact: true }).fill('no-match');
  await expect(
    page.getByRole('heading', { name: 'No documents match.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.screenshot({
    path: info.outputPath('document-library.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(appUrl);
  await expect(
    submitted.getByRole('heading', {
      name: 'Developer Resume · Archived',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    submitted.getByText('Version 1 · resume.pdf', { exact: true }),
  ).toBeVisible();
  // Removing bytes must retain history and show recovery guidance after reload.
  const row = (
    await pool.query(
      'SELECT storage_key,byte_size FROM document_versions WHERE user_id=$1 AND version_number=1',
      [user.id],
    )
  ).rows[0];
  const root = new URL('../../test-results/account-documents/', import.meta.url)
      .pathname,
    path = root + row.storage_key + '.blob';
  await rm(path);
  await page.reload();
  await expect(submitted.getByText(/File missing/)).toBeVisible();
  await expect(
    submitted.getByText('Version 1 · resume.pdf', { exact: true }),
  ).toBeVisible();
  await writeFile(path, pdf, { mode: 0o600 });
});
test('upload failure preserves form inputs and retry works; unlinked document deletion is confirmed', async ({
  page,
}) => {
  const email = `library-failure-${randomUUID()}@example.test`;
  await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { email, password, name: 'Library Failure' },
  });
  const text = await testEmail(email, 'Verify your FATS email');
  await page.request.post('/api/auth/verify-email', {
    headers: { origin },
    data: { email, code: text.match(/code is (\d{8})/)![1] },
  });
  await page.request.post('/api/auth/sign-in/email', {
    headers: { origin },
    data: { email, password },
  });
  const { user } = await (await page.request.get('/api/account')).json();
  owners.push(user.id);
  await page.goto('/resumes');
  await page
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Document name', { exact: true })
    .fill('My certificate');
  await dialog
    .getByLabel('Category', { exact: true })
    .selectOption('Certificates');
  await dialog.getByLabel('Document file', { exact: true }).setInputFiles({
    name: 'certificate.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfFixture('Certificate'),
  });
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 503,
        json: {
          error: 'Synthetic storage interruption. Keep your file and retry.',
        },
      });
    } else await route.continue();
  });
  await dialog
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('Keep your file');
  await expect(dialog.getByLabel('Document name', { exact: true })).toHaveValue(
    'My certificate',
  );
  await page.unroute('**/api/documents');
  await dialog
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Open document My certificate', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Delete document…', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Keep document', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Delete document…', exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Delete document…', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Confirm deletion', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Make a little room for your story.' }),
  ).toBeVisible();
});
