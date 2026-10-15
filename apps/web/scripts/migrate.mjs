import { Pool } from 'pg';
import { runMigrations } from '../src/server/migrations.ts';
const connectionString = process.env.DATABASE_URL;
if (
  !connectionString ||
  !['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname)
)
  throw new Error(
    'Select a local PostgreSQL DATABASE_URL before running development migrations.',
  );
const pool = new Pool({ connectionString });
try {
  const files = await runMigrations(pool);
  console.log(
    `PASS: ${files.length} versioned database migrations are applied.`,
  );
} finally {
  await pool.end();
}
