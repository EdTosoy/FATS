// Validate without including credentials or connection strings in diagnostics.
export function databaseConnection(connection: string) {
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error('Configure a valid PostgreSQL connection.');
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.pathname.slice(1) ||
    url.hash ||
    [...url.searchParams.keys()].some(
      (key) =>
        ![
          'sslmode',
          'channel_binding',
          'application_name',
          'connect_timeout',
        ].includes(key) || url.searchParams.getAll(key).length !== 1,
    ) ||
    (!local && url.searchParams.get('sslmode') !== 'verify-full')
  )
    throw new Error(
      'Configure PostgreSQL with a database and role; remote connections require sslmode=verify-full.',
    );
  return { connectionString: url.href, local };
}
