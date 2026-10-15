import { createDatabasePool } from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
export default async function setup() {
  const url = process.env.FATS_TEST_DATABASE_URL;
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith('_test')
  )
    throw new Error('Use a dedicated local test database.');
  const pool = createDatabasePool(url);
  try {
    await runMigrations(pool);
    await pool.query('DELETE FROM "rateLimit"');
  } finally {
    await pool.end();
  }
}
