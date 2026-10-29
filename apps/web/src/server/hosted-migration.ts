import { databaseConnection } from './database-config.ts';

export function hostedMigrationTarget(
  connection: string | undefined,
  host: string | undefined,
  database: string | undefined,
  confirmation: string | undefined,
  check: boolean,
) {
  if (!connection)
    throw new Error('A direct migration connection is required.');
  const result = databaseConnection(connection);
  const url = new URL(result.connectionString);
  if (
    result.local ||
    !url.hostname.endsWith('.neon.tech') ||
    url.hostname.split('.')[0].endsWith('-pooler') ||
    !host ||
    url.hostname !== host ||
    !database ||
    decodeURIComponent(url.pathname.slice(1)) !== database ||
    (!check && confirmation !== `MIGRATE ${host}/${database}`)
  )
    throw new Error(
      'Select and confirm the exact direct Neon host and database.',
    );
  return result.connectionString;
}
