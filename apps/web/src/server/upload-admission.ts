import type { Pool } from 'pg';
import { assertActiveAccount } from './account-lifecycle.ts';
import { WorkspaceError } from './workspace-error.ts';
export const UPLOAD_TIMEOUT_MS = 30000;
export async function admitUpload(pool: Pool, owner: string) {
  const guard = await pool.connect();
  let owned = false,
    slot = 0;
  async function releaseLocks() {
    let failed = false;
    try {
      if (slot)
        await guard.query('SELECT pg_advisory_unlock(16436,$1)', [slot]);
      if (owned)
        await guard.query('SELECT pg_advisory_unlock(16435,hashtext($1))', [
          owner,
        ]);
    } catch {
      failed = true;
    }
    guard.release(failed);
  }
  try {
    owned = (
      await guard.query(
        'SELECT pg_try_advisory_lock(16435,hashtext($1)) AS locked',
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
          await guard.query('SELECT pg_try_advisory_lock(16436,$1) AS locked', [
            candidate,
          ])
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
    await guard.query('BEGIN');
    await assertActiveAccount(guard, owner, true);
    await guard.query(
      "DELETE FROM document_upload_usage WHERE user_id=$1 AND window_start < date_trunc('hour',now())",
      [owner],
    );
    const usage = await guard.query(
      "INSERT INTO document_upload_usage(user_id,window_start,attempts) VALUES($1,date_trunc('hour',now()),1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=document_upload_usage.attempts+1 WHERE document_upload_usage.attempts<20 RETURNING attempts",
      [owner],
    );
    if (!usage.rowCount)
      throw new WorkspaceError(
        'You have reached 20 upload attempts this hour. Try again after the next hour begins.',
        429,
      );
    await guard.query('COMMIT');
  } catch (error) {
    await guard.query('ROLLBACK').catch(() => {});
    await releaseLocks();
    throw error;
  }
  return releaseLocks;
}
