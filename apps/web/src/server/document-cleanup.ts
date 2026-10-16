import type { Pool } from 'pg';
import type { DocumentStorage } from './document-storage.ts';
export async function cleanupDocumentGarbage(
  pool: Pool,
  storage: DocumentStorage,
  owner?: string,
) {
  const client = await pool.connect();
  let remaining = 0;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
    const { rows } = await client.query(
      `SELECT g.storage_key FROM document_garbage g
      WHERE ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM document_objects o WHERE o.storage_key=g.storage_key AND o.user_id=$1))
      AND NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.storage_key=g.storage_key)
      FOR UPDATE OF g SKIP LOCKED`,
      [owner ?? null],
    );
    for (const row of rows) {
      try {
        await storage.remove(row.storage_key);
      } catch {
        remaining++;
        continue;
      }
      await client.query('DELETE FROM document_objects WHERE storage_key=$1', [
        row.storage_key,
      ]);
      await client.query('DELETE FROM document_garbage WHERE storage_key=$1', [
        row.storage_key,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return remaining;
}
