import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { authOptions } from './auth-config';
import type { AccountMailer } from './account-email';

export function createDatabasePool(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  });
  pool.on('error', () =>
    console.error('FATS database connection interrupted.'),
  );
  return pool;
}
export function createServices(
  connectionString: string,
  origin: string,
  secret: string,
  mailer?: AccountMailer,
) {
  const pool = createDatabasePool(connectionString);
  return {
    pool,
    auth: betterAuth(authOptions(pool, origin, secret, mailer)),
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
    // Mailpit is a local inbox, never a hosted delivery provider.
    if (!['localhost', '127.0.0.1'].includes(new URL(BETTER_AUTH_URL).hostname))
      throw new Error(
        'Hosted account email delivery has not been configured. This slice supports local email testing only.',
      );
    serviceCache.fatsServices = createServices(
      DATABASE_URL,
      BETTER_AUTH_URL,
      BETTER_AUTH_SECRET,
    );
  }
  return serviceCache.fatsServices;
}
