import type { Pool } from 'pg';
import type { DocumentStorage } from './document-storage.ts';
import { verifiedDocumentBytes } from './document-storage.ts';
import {
  ClamavDocumentScanner,
  type DocumentScanner,
} from './document-scanner.ts';
import { runDocumentProcess } from './document-process.ts';
import { admitUpload } from './upload-admission.ts';
import { assertActiveAccount } from './account-lifecycle.ts';
// Explicit local operator action; immutable versions/bytes/history are unchanged.
export async function recheckDocuments(
  pool: Pool,
  storage: DocumentStorage,
  scanner: DocumentScanner = new ClamavDocumentScanner(),
) {
  const candidates = await pool.query(
    "SELECT v.* FROM document_versions v LEFT JOIN document_objects o USING(storage_key) WHERE o.intake_state IS DISTINCT FROM 'accepted' ORDER BY v.user_id,v.id",
  );
  const counts = { accepted: 0, pending: 0 };
  for (const row of candidates.rows) {
    let release: (() => Promise<void>) | undefined;
    try {
      // Operator rechecks retain the same owner/global admission, without using
      // a user's HTTP upload attempt budget to recheck their existing history.
      release = await admitUpload(pool, row.user_id, false);
      const bytes = await verifiedDocumentBytes(storage, row);
      const scan = await scanner.scan(bytes);
      await runDocumentProcess(bytes, row.format, 'validate');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
        await assertActiveAccount(client, row.user_id, true);
        const updated = await client.query(
          "UPDATE document_objects o SET intake_state='accepted',accepted_sha256=$3,scan_engine=$4,signature_revision=$5,signature_at=$6,scanned_at=$7 WHERE o.user_id=$1 AND o.storage_key=$2 AND EXISTS(SELECT 1 FROM document_versions v WHERE v.user_id=o.user_id AND v.storage_key=o.storage_key AND v.sha256=$3)",
          [
            row.user_id,
            row.storage_key,
            scan.sha256,
            scan.engine,
            scan.signatureRevision,
            scan.signatureAt,
            scan.scannedAt,
          ],
        );
        if (!updated.rowCount) throw Error();
        await client.query('COMMIT');
        counts.accepted++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch {
      counts.pending++;
    } finally {
      await release?.();
    }
  }
  return counts;
}
