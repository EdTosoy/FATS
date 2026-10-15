import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function runMigrations(
  pool: Pool,
  directory = new URL('../../migrations/', import.meta.url),
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(16432, 4)');
    await client.query(`CREATE TABLE IF NOT EXISTS fats_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(directory))
      .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(
        'SELECT checksum FROM fats_schema_migrations WHERE name = $1',
        [name],
      );
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(
            `Migration checksum differs: ${name}. Add a new migration instead of editing applied SQL.`,
          );
        continue;
      }
      await client.query(sql);
      await client.query(
        'INSERT INTO fats_schema_migrations (name, checksum) VALUES ($1, $2)',
        [name, checksum],
      );
    }
    await client.query('COMMIT');
    return files;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
