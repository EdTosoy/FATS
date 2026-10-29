// Operator-only. Never imported by the application or invoked during builds.
import { parseArgs } from 'node:util';
import { Pool } from 'pg';
import { hostedMigrationTarget } from '../src/server/hosted-migration.ts';
import { previewMigrations, runMigrations } from '../src/server/migrations.ts';

let pool;
try {
  const { values } = parseArgs({
    options: {
      host: { type: 'string' },
      database: { type: 'string' },
      confirm: { type: 'string' },
      check: { type: 'boolean', default: false },
    },
  });
  const connectionString = hostedMigrationTarget(
    process.env.DATABASE_URL_UNPOOLED,
    values.host,
    values.database,
    values.confirm,
    values.check,
  );
  pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    enableChannelBinding: true,
  });
  const plan = await previewMigrations(pool);
  if (values.check)
    console.log(
      `PASS: ${plan.applied.length} applied, ${plan.pending.length} pending versioned migrations. No schema changes made.`,
    );
  else {
    const files = await runMigrations(pool);
    console.log(
      `PASS: ${files.length} versioned migrations applied or already current.`,
    );
  }
} catch {
  console.error(
    'Hosted migration refused or failed. Use DATABASE_URL_UNPOOLED with a direct Neon host and sslmode=verify-full, independent --host and --database, then --check or --confirm "MIGRATE <host>/<database>". Check target availability and migration checksums. Connection details are withheld.',
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
