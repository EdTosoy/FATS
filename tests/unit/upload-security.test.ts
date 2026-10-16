import { it, expect } from 'vitest';
import { MAX_DOCUMENT_BYTES } from '@fats/domain';
import { readUploadBody } from '../../apps/web/src/server/upload-body';
import { validateDocument } from '../../apps/web/src/server/document-validation';
import { docxFixture, pdfFixture } from '../helpers/document-fixtures';
function streamed(body: ReadableStream, signal?: AbortSignal) {
  return new Request('http://localhost/api/documents', {
    method: 'PUT',
    body,
    duplex: 'half',
    signal,
  } as RequestInit);
}
it('bounds streamed uploads without trusting content-length, cancels excess, and rejects missing bytes', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(MAX_DOCUMENT_BYTES));
      c.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(readUploadBody(streamed(body))).rejects.toMatchObject({
    status: 413,
  });
  expect(cancelled).toBe(true);
  await expect(
    readUploadBody(
      new Request('http://localhost', { method: 'PUT', body: '' }),
    ),
  ).rejects.toThrow('nonempty');
  await expect(
    readUploadBody(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'content-length': String(MAX_DOCUMENT_BYTES + 1) },
        body: 'small',
      }),
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it('releases slow and aborted upload streams within the time budget', async () => {
  let cancelled = false;
  await expect(
    readUploadBody(
      streamed(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
      20,
    ),
  ).rejects.toMatchObject({ status: 408 });
  expect(cancelled).toBe(true);
  const abort = new AbortController();
  const pending = readUploadBody(streamed(new ReadableStream(), abort.signal));
  abort.abort();
  await expect(pending).rejects.toMatchObject({ status: 408 });
});
it('enforces ZIP expansion ratio, entry count, XML depth and malformed structure in isolated processes', async () => {
  const many = Object.fromEntries(
    Array.from({ length: 501 }, (_, i) => ['word/extra' + i + '.xml', '<x/>']),
  );
  for (const bytes of [
    docxFixture({ 'word/bomb.xml': ' '.repeat(1024 * 1024) }),
    docxFixture(many),
    docxFixture({ 'word/deep.xml': '<x>'.repeat(101) + '</x>'.repeat(101) }),
    docxFixture({ 'word/bad.xml': '<x>' }),
    docxFixture({ '/absolute.xml': 'x' }),
  ])
    await expect(validateDocument(bytes, 'unsafe.docx')).rejects.toThrow(
      'malformed',
    );
  await expect(
    validateDocument(await pdfFixture(), 'mismatch.docx'),
  ).rejects.toThrow();
  await expect(
    validateDocument(docxFixture(), 'good.docx'),
  ).resolves.toMatchObject({ format: 'docx' });
});
