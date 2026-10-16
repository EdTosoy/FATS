import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { WorkspaceError } from './workspace-error.ts';

export const receiptHash = (receipt: string) =>
  createHash('sha256').update(receipt).digest('hex');
// In mutations this row lock is held until COMMIT; erasure takes FOR UPDATE.
export async function assertActiveAccount(
  db: Pool | PoolClient,
  owner: string,
  lock = false,
) {
  const { rows } = await db.query(
    `SELECT id FROM "user" WHERE id=$1 ${lock ? 'FOR SHARE' : ''}`,
    [owner],
  );
  if (
    !rows.length ||
    (await db.query('SELECT 1 FROM account_erasures WHERE user_id=$1', [owner]))
      .rowCount
  )
    throw new WorkspaceError(
      'This account is unavailable or being deleted. Account records cannot be opened or changed.',
      401,
    );
}
export async function beginAccountErasure(
  pool: Pool,
  owner: string,
  receipt: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    // Auth requests hold the shared counterpart through the library operation.
    await client.query('SELECT pg_advisory_xact_lock(16432,8)');
    const { rows } = await client.query(
      'SELECT email FROM "user" WHERE id=$1 FOR UPDATE',
      [owner],
    );
    if (!rows.length) throw new WorkspaceError('Account not found.', 401);
    const existing = (
      await client.query(
        'SELECT receipt_hash FROM account_erasures WHERE user_id=$1',
        [owner],
      )
    ).rows[0];
    if (existing && existing.receipt_hash !== receiptHash(receipt))
      throw new WorkspaceError(
        'Account deletion has already begun. Keep your original deletion receipt.',
        409,
      );
    await client.query(
      'INSERT INTO account_erasures(receipt_hash,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [receiptHash(receipt), owner],
    );
    await client.query('DELETE FROM session WHERE "userId"=$1', [owner]);
    // Better Auth 1.7.8 stores reset ownership in value and hashes OTP identifiers.
    const otp = createHash('sha256')
      .update('email-verification-otp-' + rows[0].email.toLowerCase())
      .digest('base64url');
    await client.query(
      'DELETE FROM verification WHERE value=$1 OR identifier=$2',
      [owner, otp],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
