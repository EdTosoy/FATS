import type { Pool } from 'pg';
import { assertActiveAccount } from './account-lifecycle.ts';
import { WorkspaceError } from './workspace-error.ts';
export const UPLOAD_TIMEOUT_MS = 30000;
export async function admitUpload(
  pool: Pool,
  owner: string,
  consumeAttempt = true,
) {
  const guard = await pool.connect();
  let slot = 0,
    released = false;
  async function releaseLocks() {
    if (released) return;
    released = true;
    let failed = false;
    try {
      await guard.query('ROLLBACK');
    } catch {
      failed = true;
    }
    guard.release(failed);
  }
  try {
    await guard.query('BEGIN');
    await guard.query("SET LOCAL statement_timeout='15s'");
    await guard.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    const owned = (
      await guard.query(
        'SELECT pg_try_advisory_xact_lock(16435,hashtext($1)) AS locked',
        [owner],
      )
    ).rows[0].locked;
    if (!owned)
      throw new WorkspaceError(
        'Another upload is running for your account. Wait for it to finish, then retry.',
        429,
      );
    for (const candidate of [1, 2]) {
      if (
        (
          await guard.query(
            'SELECT pg_try_advisory_xact_lock(16436,$1) AS locked',
            [candidate],
          )
        ).rows[0].locked
      ) {
        slot = candidate;
        break;
      }
    }
    if (!slot)
      throw new WorkspaceError(
        'Document uploads are busy. Please retry shortly.',
        429,
      );
    // Keep the pooler backend pinned for the entire admission. Usage commits
    // independently so failed uploads still consume their attempt, as before.
    const usageClient = await pool.connect();
    try {
      await usageClient.query('BEGIN');
      await usageClient.query("SET LOCAL lock_timeout='5s'");
      await assertActiveAccount(usageClient, owner, true);
      if (consumeAttempt) {
        await usageClient.query(
          "DELETE FROM document_upload_usage WHERE user_id=$1 AND window_start < date_trunc('hour',now())",
          [owner],
        );
        const usage = await usageClient.query(
          "INSERT INTO document_upload_usage(user_id,window_start,attempts) VALUES($1,date_trunc('hour',now()),1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=document_upload_usage.attempts+1 WHERE document_upload_usage.attempts<20 RETURNING attempts",
          [owner],
        );
        if (!usage.rowCount)
          throw new WorkspaceError(
            'You have reached 20 upload attempts this hour. Try again after the next hour begins.',
            429,
          );
      }
      await usageClient.query('COMMIT');
    } catch (error) {
      await usageClient.query('ROLLBACK');
      throw error;
    } finally {
      usageClient.release();
    }
  } catch (error) {
    await releaseLocks();
    throw error;
  }
  return releaseLocks;
}
