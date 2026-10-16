// Opt in only after an operator configures an actual local ClamAV installation.
// No synthetic scanner adapter is used by these cases.
import { expect, it } from 'vitest';
import { ClamavDocumentScanner } from '../../apps/web/src/server/document-scanner';
import { pdfFixture, docxFixture } from '../helpers/document-fixtures';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
const actual = it.skipIf(process.env.FATS_TEST_CLAMAV !== '1');
actual(
  'scans actual clean PDF/DOCX with current signatures and detects the harmless EICAR antivirus test string',
  async () => {
    const scanner = new ClamavDocumentScanner(),
      health = await scanner.health();
    expect(health.engine).toMatch(/^ClamAV /);
    expect(Date.now() - Date.parse(health.signatureAt)).toBeLessThanOrEqual(
      48 * 3600000,
    );
    for (const bytes of [await pdfFixture(), docxFixture()])
      expect(await scanner.scan(bytes)).toMatchObject({
        engine: health.engine,
        signatureRevision: health.signatureRevision,
      });
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    await expect(scanner.scan(eicar)).rejects.toMatchObject({ status: 400 });
  },
  100000,
);

actual(
  'promotes clean files through the default scanner pipeline and never publishes detected files',
  async () => {
    const url = process.env.FATS_TEST_DATABASE_URL;
    if (
      !url ||
      !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
      !new URL(url).pathname.endsWith('_test')
    )
      throw Error('Use dedicated local test database.');
    const pool = createDatabasePool(url),
      owner = randomUUID(),
      root = await mkdtemp('/tmp/fats-real-clamav-'),
      storage = new FilesystemDocumentStorage(root);
    try {
      await runMigrations(pool);
      await pool.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [owner, 'Synthetic actual scanner', owner + '@example.test'],
      );
      const repository = new PostgresDocumentRepository(pool, owner, storage);
      for (const [filename, bytes] of [
        ['clean.pdf', await pdfFixture()],
        ['clean.docx', docxFixture()],
      ] as const) {
        const result = await repository.upload(bytes, filename, {
          name: 'Synthetic actual scanner',
          category: 'Resumes',
          requestId: randomUUID(),
        });
        expect((await repository.download(result.versionId)).bytes).toEqual(
          bytes,
        );
      }
      const requestId = randomUUID(),
        eicar = Buffer.from(
          'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        );
      await expect(
        repository.upload(eicar, 'test.pdf', {
          name: 'Synthetic detection',
          category: 'Resumes',
          requestId,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(repository.download(requestId)).rejects.toMatchObject({
        status: 404,
      });
      expect((await repository.library()).documents).toHaveLength(2);
      expect(
        (await storage.inventory()).filter((name) =>
          name.startsWith('quarantine/'),
        ),
      ).toEqual([]);
    } finally {
      if (
        (await pool.query('SELECT 1 FROM "user" WHERE id=$1', [owner])).rowCount
      ) {
        const receipt = randomBytes(32).toString('hex');
        await beginAccountErasure(pool, owner, receipt);
        expect(await recoverAccountErasure(pool, receipt, storage)).toBe(
          'complete',
        );
      }
      await pool.end();
      await rm(root, { recursive: true, force: true });
    }
  },
  120000,
);
