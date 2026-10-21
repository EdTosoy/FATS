import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  encryptedPdfFixture,
  signedPdfFixture,
  syntheticPdfPassword,
} from '../helpers/pdf-tools-security-fixtures';
import { pdfWorkspaceFixture } from '../helpers/pdf-tools-v2-fixtures';

const run = promisify(execFile);
test('real encrypted and cryptographically signed PDFs are rejected without modifying their bytes', async ({
  page,
}, info) => {
  const bin = process.env.PDF_TOOLS_POPPLER_BIN;
  test.skip(
    !bin,
    'Independent security-fixture validation requires already installed Poppler and OpenSSL.',
  );
  const signed = await signedPdfFixture();
  const encrypted = encryptedPdfFixture();
  const signedPath = info.outputPath('synthetic-signed.pdf');
  const encryptedPath = info.outputPath('synthetic-encrypted.pdf');
  await writeFile(signedPath, signed);
  await writeFile(encryptedPath, encrypted);
  const validateSignature = async () => {
    const result = await run(
      join(bin!, 'pdfsig'),
      ['-nocert', '-no-ocsp', signedPath],
      { timeout: 15000 },
    );
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Signature Validation: Signature is Valid');
    expect(result.stdout).toContain('Total document signed');
    return result.stdout;
  };
  const proof = await validateSignature();
  await writeFile(info.outputPath('poppler-signature-validation.txt'), proof);
  await expect(
    run(join(bin!, 'pdfinfo'), [encryptedPath], { timeout: 15000 }),
  ).rejects.toMatchObject({
    stderr: expect.stringContaining('Incorrect password'),
  });
  const opened = await run(
    join(bin!, 'pdfinfo'),
    ['-upw', syntheticPdfPassword, encryptedPath],
    { timeout: 15000 },
  );
  expect(opened.stdout).toMatch(/Pages:\s+1/);
  expect(opened.stdout).toMatch(/Encrypted:\s+yes/);
  const digests = [signed, encrypted].map((value) =>
    createHash('sha256').update(value).digest('hex'),
  );
  const errors: string[] = [],
    downloads: string[] = [];
  page.on('pageerror', () => errors.push('Unhandled page error'));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('Console error');
  });
  page.on('download', () => downloads.push('Unexpected download'));
  await page.goto('/dev/pdf-tools-v2');
  const input = page.getByLabel('Choose a local PDF', { exact: true });
  for (const [name, buffer, error] of [
    ['synthetic-signed.pdf', signed, /plain, unsigned PDF/],
    ['synthetic-encrypted.pdf', encrypted, /Password-protected or encrypted/],
    [
      'synthetic-invalid.pdf',
      Buffer.from('%PDF-1.7\ninvalid\n%%EOF'),
      /malformed/,
    ],
  ] as const) {
    await input.setInputFiles({ name, mimeType: 'application/pdf', buffer });
    await expect(
      page.locator('[data-pdf-v2-workspace]').getByRole('alert'),
    ).toContainText(error);
    await expect(page.getByTestId('pdf-v2-canvas')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Download completed PDF', exact: true }),
    ).toBeDisabled();
  }
  expect(await validateSignature()).toBe(proof);
  expect(
    await Promise.all(
      [signedPath, encryptedPath].map(async (path) =>
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ),
    ),
  ).toEqual(digests);
  await input.setInputFiles({
    name: 'synthetic-recovered.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(true),
  });
  await expect(
    page.getByRole('img', { name: 'PDF page 1', exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
  expect(errors).toEqual([]);
  expect(downloads).toEqual([]);
});
