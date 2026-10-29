import type { Pool } from 'pg';
import { cleanupDocumentGarbage } from './document-cleanup.ts';
import {
  getDocumentStorage,
  type DocumentStorage,
} from './document-storage.ts';
import { receiptHash } from './account-lifecycle.ts';

// Retrying is safe after any process/SQL/filesystem failure. SQL and unlink are
// deliberately separate; only an acknowledged, synced unlink retires its intent.
export async function recoverAccountErasure(
  pool: Pool,
  receipt: string,
  storage?: DocumentStorage,
) {
  const job = (
    await pool.query(
      'SELECT user_id,completed_at FROM account_erasures WHERE receipt_hash=$1',
      [receiptHash(receipt)],
    )
  ).rows[0];
  if (!job) return null;
  if (job.completed_at) return 'complete' as const;
  return eraseOwner(pool, job.user_id, storage);
}
async function eraseOwner(
  pool: Pool,
  owner: string,
  storage?: DocumentStorage,
) {
  const guard = await pool.connect();
  let client: import('pg').PoolClient | undefined;
  let locked = false;
  try {
    await guard.query('BEGIN');
    await guard.query("SET LOCAL statement_timeout='15s'");
    await guard.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    locked = (
      await guard.query(
        'SELECT pg_try_advisory_xact_lock(16435,hashtext($1)) AS locked',
        [owner],
      )
    ).rows[0].locked;
    if (!locked) return 'pending' as const;
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
    await client.query('SELECT pg_advisory_xact_lock(16432,8)');
    await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
    await client.query(
      'INSERT INTO document_objects(storage_key,user_id) SELECT storage_key,user_id FROM document_versions WHERE user_id=$1 ON CONFLICT DO NOTHING',
      [owner],
    );
    // Child-first order respects protected history instead of disabling constraints.
    await client.query(
      'INSERT INTO document_garbage(storage_key) SELECT storage_key FROM document_objects WHERE user_id=$1 ON CONFLICT DO NOTHING',
      [owner],
    );
    for (const table of [
      'matching_previews',
      'matching_reports',
      'career_events',
      'career_employments',
      'offer_events',
      'offers',
      'application_document_versions',
      'document_versions',
      'documents',
      'interviews',
      'applications',
    ])
      await client.query(`DELETE FROM ${table} WHERE user_id=$1`, [owner]);
    await client.query('DELETE FROM matching_usage WHERE scope IN ($1,$2)', [
      owner,
      'extract:' + owner,
    ]);
    await client.query('DELETE FROM verification WHERE value=$1', [owner]);
    await client.query('DELETE FROM "user" WHERE id=$1', [owner]);
    await client.query('COMMIT');
    const count = (
      await pool.query(
        'SELECT 1 FROM document_objects WHERE user_id=$1 LIMIT 1',
        [owner],
      )
    ).rowCount;
    if (count)
      await cleanupDocumentGarbage(
        pool,
        storage ?? getDocumentStorage(),
        owner,
      );
    const completed = await pool.query(
      `UPDATE account_erasures SET user_id=NULL,completed_at=now() WHERE user_id=$1
      AND NOT EXISTS(SELECT 1 FROM document_objects WHERE user_id=$1) RETURNING completed_at`,
      [owner],
    );
    return completed.rowCount ? ('complete' as const) : ('pending' as const);
  } catch {
    await client?.query('ROLLBACK').catch(() => {});
    return 'pending' as const;
  } finally {
    let failed = false;
    try {
      await guard.query('ROLLBACK');
    } catch {
      failed = true;
    }
    client?.release();
    guard.release(failed);
  }
}
export async function recoverDataLifecycle(
  pool: Pool,
  storage: DocumentStorage,
) {
  const pending = await pool.query(
    'SELECT user_id FROM account_erasures WHERE user_id IS NOT NULL ORDER BY requested_at',
  );
  for (const row of pending.rows) await eraseOwner(pool, row.user_id, storage);
  // Reconcile pre-publication intents left by crashed uploads, excluding active
  // uploads with the same database admission lock. Never guess from filenames.
  const owners = await pool.query(
    'SELECT DISTINCT user_id FROM document_objects',
  );
  for (const { user_id: owner } of owners.rows) {
    const guard = await pool.connect();
    let client: import('pg').PoolClient | undefined;
    try {
      await guard.query('BEGIN');
      await guard.query("SET LOCAL statement_timeout='15s'");
      await guard.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
      const locked = (
        await guard.query(
          'SELECT pg_try_advisory_xact_lock(16435,hashtext($1)) AS locked',
          [owner],
        )
      ).rows[0].locked;
      if (!locked) continue;
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
      await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
        owner,
      ]);
      await client.query(
        'INSERT INTO document_garbage(storage_key) SELECT o.storage_key FROM document_objects o WHERE user_id=$1 AND NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.storage_key=o.storage_key) ON CONFLICT DO NOTHING',
        [owner],
      );
      await client.query('COMMIT');
      await cleanupDocumentGarbage(pool, storage, owner);
    } finally {
      await client?.query('ROLLBACK').catch(() => {});
      let failed = false;
      try {
        await guard.query('ROLLBACK');
      } catch {
        failed = true;
      }
      client?.release();
      guard.release(failed);
    }
  }
  await cleanupDocumentGarbage(pool, storage);
  return {
    pendingAccounts: Number(
      (
        await pool.query(
          'SELECT count(*) FROM account_erasures WHERE completed_at IS NULL',
        )
      ).rows[0].count,
    ),
    pendingFiles: Number(
      (await pool.query('SELECT count(*) FROM document_garbage')).rows[0].count,
    ),
  };
}
