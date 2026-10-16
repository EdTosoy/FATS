import { it, expect } from 'vitest';
import {
  mkdtemp,
  rm,
  stat,
  writeFile,
  symlink,
  chmod,
  readFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  FilesystemDocumentStorage,
  verifiedDocumentBytes,
  documentHash,
} from '../../apps/web/src/server/document-storage';
import { validateDocument } from '../../apps/web/src/server/document-validation';
import { documentDetails, MAX_DOCUMENT_BYTES } from '@fats/domain';
import {
  pdfFixture,
  docxFixture,
  activePdfFixture,
} from '../helpers/document-fixtures';
it('stores real private bytes atomically, refuses overwrite and traversal, and detects missing/corrupted/symlinked files', async () => {
  const root = await mkdtemp('/tmp/fats-files-test-');
  const store = new FilesystemDocumentStorage(root),
    key = randomUUID(),
    bytes = await pdfFixture();
  try {
    await store.put(key, bytes);
    expect((await stat(root + '/' + key + '.blob')).mode & 0o077).toBe(0);
    expect(await store.inventory()).toEqual([key + '.blob']);
    const row = {
      storage_key: key,
      byte_size: bytes.length,
      sha256: documentHash(bytes),
    };
    expect(Buffer.from(await verifiedDocumentBytes(store, row))).toEqual(bytes);
    await expect(store.put(key, Buffer.from('replacement'))).rejects.toThrow();
    expect(await readFile(root + '/' + key + '.blob')).toEqual(bytes);
    for (const bad of ['../secret', '/tmp/secret', 'x/../../a', key + '%2f..'])
      await expect(store.read(bad, 1)).rejects.toThrow();
    await expect(store.read(randomUUID(), 1)).rejects.toMatchObject({
      health: 'missing',
    });
    await writeFile(root + '/' + key + '.blob', Buffer.alloc(bytes.length));
    await expect(verifiedDocumentBytes(store, row)).rejects.toMatchObject({
      health: 'corrupt',
    });
    await rm(root + '/' + key + '.blob');
    await symlink('/etc/passwd', root + '/' + key + '.blob');
    await expect(store.read(key, 1)).rejects.toThrow();
    await store.remove(key);
    const partial = randomUUID() + '.partial';
    await writeFile(root + '/' + partial, 'incomplete');
    expect(await store.inventory()).toContain(partial);
    await chmod(root, 0o755);
    await expect(store.put(randomUUID(), bytes)).rejects.toThrow('private');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('validates actual PDF and DOCX structures without trusting MIME or filenames', async () => {
  await expect(
    validateDocument(await activePdfFixture(), 'active.pdf'),
  ).rejects.toThrow();
  const pdf = await pdfFixture(),
    docx = docxFixture();
  expect(await validateDocument(pdf, 'Resume.PDF')).toMatchObject({
    format: 'pdf',
    originalFilename: 'Resume.PDF',
  });
  expect(await validateDocument(docx, 'letter.docx')).toMatchObject({
    format: 'docx',
  });
  for (const [bytes, name] of [
    [pdf, 'resume.docx'],
    [docx, 'resume.pdf'],
    [Buffer.from('%PDF-1.7\n%%EOF'), 'bad.pdf'],
    [Buffer.from('<html>bad</html>'), 'bad.pdf'],
    [docx.subarray(0, -15), 'bad.docx'],
    [docxFixture({ 'word/document.xml': '<broken>' }), 'bad.docx'],
    [docxFixture({ 'word/vbaProject.bin': 'macro' }), 'bad.docx'],
    [docxFixture({ 'word/embeddings/test.bin': 'embedded' }), 'bad.docx'],
    [
      docxFixture({
        'word/document.xml':
          '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>',
      }),
      'bad.docx',
    ],
    [docxFixture({ '../escape': 'bad' }), 'bad.docx'],
    [Buffer.alloc(MAX_DOCUMENT_BYTES + 1), 'big.pdf'],
    [pdf, '../resume.pdf'],
    [pdf, 'resume.html'],
    [Buffer.alloc(0), 'empty.pdf'],
  ] as const)
    await expect(validateDocument(bytes, name)).rejects.toThrow();
  const damaged = Buffer.from(docx);
  damaged[60] ^= 1;
  await expect(validateDocument(damaged, 'bad.docx')).rejects.toThrow();
  const bomb = docxFixture({ 'word/bomb.xml': ' '.repeat(21 * 1024 * 1024) });
  await expect(validateDocument(bomb, 'bomb.docx')).rejects.toThrow();
  expect(documentDetails('  My resume  ', 'Resumes')).toEqual({
    name: 'My resume',
    category: 'Resumes',
  });
  expect(() => documentDetails('', 'Resumes')).toThrow();
  expect(() => documentDetails('Resume', 'unknown')).toThrow();
}, 20000);

it('keeps quarantine private, promotes exclusively, verifies hashes and removes every partial location', async () => {
  const root = await mkdtemp('/tmp/fats-quarantine-'),
    store = new FilesystemDocumentStorage(root),
    key = randomUUID(),
    bytes = await pdfFixture();
  try {
    await store.quarantine(key, bytes);
    expect((await stat(root + '/quarantine')).mode & 0o077).toBe(0);
    await expect(store.read(key, bytes.length)).rejects.toMatchObject({
      health: 'missing',
    });
    expect(await store.readQuarantine(key, bytes.length)).toEqual(bytes);
    await expect(
      store.promote(key, bytes.length, '0'.repeat(64)),
    ).rejects.toThrow();
    await store.promote(key, bytes.length, documentHash(bytes));
    expect(await store.read(key, bytes.length)).toEqual(bytes);
    await store.quarantine(key, bytes);
    await expect(
      store.promote(key, bytes.length, documentHash(bytes)),
    ).rejects.toThrow();
    for (const dir of ['', '/quarantine'])
      await writeFile(root + dir + '/' + key + '.partial', 'partial', {
        mode: 0o600,
      });
    await store.remove(key);
    expect(await store.inventory()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
