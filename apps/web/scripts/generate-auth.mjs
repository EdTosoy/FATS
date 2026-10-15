// Run only against an empty, explicitly selected local database. Generation
// prints no secrets and writes SQL for review; it does not execute the plan.
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../src/server/auth-config.ts';
import { writeFile } from 'node:fs/promises';
if (
  !process.env.DATABASE_URL ||
  !process.env.BETTER_AUTH_URL ||
  !process.env.BETTER_AUTH_SECRET
)
  throw new Error(
    'Set database and authentication environment variables first.',
  );
if (
  !['localhost', '127.0.0.1'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw new Error(
    'Auth schema generation is restricted to a local development database.',
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const plan = await getMigrations(
    authOptions(
      pool,
      process.env.BETTER_AUTH_URL,
      process.env.BETTER_AUTH_SECRET,
    ),
  );
  if (plan.toBeCreated.length === 0)
    throw new Error(
      'Use an empty local database to generate the initial auth migration.',
    );
  await writeFile(
    new URL('../migrations/0001_auth.sql', import.meta.url),
    '-- Generated from Better Auth 1.7.8 with database rate limiting; review before applying.\n' +
      (await plan.compileMigrations()),
    { flag: 'wx' },
  );
  console.log(
    'Generated migrations/0001_auth.sql for review. No migration was executed.',
  );
} finally {
  await pool.end();
}
