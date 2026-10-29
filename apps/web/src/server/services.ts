import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { authOptions, type AuthRuntimeOptions } from './auth-config';
import type { AccountMailer } from './account-email';
import { after } from 'next/server.js';
import { attachDatabasePool } from '@vercel/functions';
import { databaseConnection } from './database-config';

export function createDatabasePool(connectionString: string) {
  const connection = databaseConnection(connectionString);
  const pool = new Pool({
    connectionString: connection.connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    query_timeout: 15000,
    enableChannelBinding: true,
    // PgBouncer rejects/ignores session startup settings. Hosted operators set
    // the role's statement timeout; transaction guards use SET LOCAL as well.
    ...(connection.local ? { statement_timeout: 15000 } : {}),
  });
  pool.on('error', () =>
    console.error('FATS database connection interrupted.'),
  );
  if (process.env.VERCEL === '1') attachDatabasePool(pool);
  return pool;
}
export function createServices(
  connectionString: string,
  origin: string,
  secret: string,
  mailer?: AccountMailer,
  runtime: AuthRuntimeOptions = {},
) {
  const pool = createDatabasePool(connectionString);
  return {
    pool,
    auth: betterAuth(authOptions(pool, origin, secret, mailer, runtime)),
    origin,
  };
}
export type Services = ReturnType<typeof createServices>;
const serviceCache = globalThis as typeof globalThis & {
  fatsServices?: Services;
};
export function getServices(): Services {
  if (!serviceCache.fatsServices) {
    const { DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET } = process.env;
    if (!DATABASE_URL || !BETTER_AUTH_URL || !BETTER_AUTH_SECRET)
      throw new Error(
        'Account storage is not configured. Your local workspace is still available.',
      );
    serviceCache.fatsServices = createServices(
      DATABASE_URL,
      BETTER_AUTH_URL,
      BETTER_AUTH_SECRET,
      undefined,
      {
        scheduleEmail: (task) => after(task),
        vercelProxy: process.env.VERCEL === '1',
      },
    );
  }
  return serviceCache.fatsServices;
}
