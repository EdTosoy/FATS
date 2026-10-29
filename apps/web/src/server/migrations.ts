import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';

async function migrationSources(directory: URL) {
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, directory), 'utf8');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

export async function previewMigrations(
  pool: Pool,
  directory = new URL('../../migrations/', import.meta.url),
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock_shared(16432,4)');
    const sources = await migrationSources(directory);
    const exists = (
      await client.query(
        "SELECT to_regclass('public.fats_schema_migrations') AS name",
      )
    ).rows[0].name;
    const applied: { name: string; checksum: string }[] = exists
      ? (await client.query('SELECT name,checksum FROM fats_schema_migrations'))
          .rows
      : [];
    if (
      !exists &&
      (
        await client.query(
          "SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1",
        )
      ).rowCount
    )
      throw new Error('The selected database contains unrelated tables.');
    for (const row of applied)
      if (
        sources.find((source) => source.name === row.name)?.checksum !==
        row.checksum
      )
        throw new Error('Applied migrations differ from this checkout.');
    await client.query('COMMIT');
    return {
      applied: applied.map((row) => row.name).sort(),
      pending: sources
        .filter((row) => !applied.some((a) => a.name === row.name))
        .map((row) => row.name),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

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
    const sources = await migrationSources(directory);
    for (const { name, sql, checksum } of sources) {
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
    return sources.map((source) => source.name);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
