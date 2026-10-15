// Read-only integrity audit. Never removes or rewrites private files.
import { Pool } from 'pg';
import {
  FilesystemDocumentStorage,
  verifiedDocumentBytes,
  StorageIntegrityError,
} from '../src/server/document-storage.ts';
if (!process.env.DATABASE_URL || !process.env.FATS_DOCUMENTS_DIR) {
  console.error(
    'Configure DATABASE_URL and an absolute private FATS_DOCUMENTS_DIR.',
  );
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    const storage = new FilesystemDocumentStorage(
      process.env.FATS_DOCUMENTS_DIR,
    );
    const { rows } = await pool.query(
      'SELECT storage_key,byte_size,sha256 FROM document_versions',
    );
    const counts = {
      available: 0,
      missing: 0,
      corrupt: 0,
      unavailable: 0,
      unreferenced: 0,
      partial: 0,
      pendingDeletion: 0,
    };
    for (const row of rows)
      try {
        await verifiedDocumentBytes(storage, row);
        counts.available++;
      } catch (error) {
        counts[
          error instanceof StorageIntegrityError ? error.health : 'unavailable'
        ]++;
      }
    const keys = new Set(rows.map((row) => row.storage_key + '.blob'));
    const pending = (
      await pool.query('SELECT storage_key FROM document_garbage')
    ).rows;
    counts.pendingDeletion = pending.length;
    for (const name of await storage.inventory()) {
      if (name.endsWith('.partial')) counts.partial++;
      else if (name.endsWith('.blob') && !keys.has(name)) counts.unreferenced++;
    }
    console.log(JSON.stringify(counts));
    if (counts.missing || counts.corrupt || counts.unavailable)
      process.exitCode = 1;
  } catch {
    console.error(
      'Document audit failed. Check private storage configuration and database access. No private details were printed.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
