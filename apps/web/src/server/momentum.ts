import type { PoolClient } from 'pg';

// Call only inside the successful mutation's transaction, after validation.
export async function recordMomentum(
  client: PoolClient,
  owner: string,
  recordedAt?: string,
) {
  await client.query(
    `INSERT INTO momentum_days(user_id,active_on)
     VALUES($1,(COALESCE($2::timestamptz,transaction_timestamp()) AT TIME ZONE 'Asia/Manila')::date)
     ON CONFLICT DO NOTHING`,
    [owner, recordedAt ?? null],
  );
}
