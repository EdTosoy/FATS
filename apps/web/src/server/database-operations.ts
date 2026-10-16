import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  appendFile,
  copyFile,
  link,
  open,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Pool, type PoolClient } from 'pg';
import {
  FilesystemDocumentStorage,
  verifiedDocumentBytes,
  isStorageKey,
  type DocumentStorage,
} from './document-storage.ts';

const exec = promisify(execFile);
const tables = [
  'user',
  'account',
  'session',
  'verification',
  'rateLimit',
  'workspaces',
  'applications',
  'interviews',
  'workspace_stages',
  'local_migrations',
  'fats_schema_migrations',
  'documents',
  'document_versions',
  'application_document_versions',
  'document_garbage',
  'document_objects',
  'document_upload_usage',
  'account_erasures',
  'matching_previews',
  'matching_reports',
  'matching_usage',
  'offers',
  'offer_events',
];
export class DatabaseOperationError extends Error {}
export interface DatabaseTarget {
  connectionString: string;
  container: string;
  database: string;
}
interface Manifest {
  format: 'fats-postgres-backup';
  version: 2;
  documents: { storage_key: string; byte_size: number; sha256: string }[];
  postgresMajor: 17;
  createdAt: string;
  sourceDatabase: string;
  sha256: string;
  migrations: Record<string, string>;
  counts: {
    users: number;
    accounts: number;
    applications: number;
    interviews: number;
  };
}
async function docker(args: string[]): Promise<string> {
  try {
    return (
      await exec('docker', args, { timeout: 15000, maxBuffer: 1024 * 1024 })
    ).stdout.trim();
  } catch {
    throw new DatabaseOperationError(
      'The selected local database container is unavailable. Check its name and start it first.',
    );
  }
}
async function checkedTarget(target: DatabaseTarget) {
  let url: URL;
  try {
    url = new URL(target.connectionString);
  } catch {
    throw new DatabaseOperationError(
      'Configure a valid local database connection in a private environment file.',
    );
  }
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(target.database) ||
    ['postgres', 'template0', 'template1'].includes(target.database) ||
    decodeURIComponent(url.pathname.slice(1)) !== target.database ||
    !/^[a-zA-Z0-9_-]+$/.test(target.container) ||
    !/^[a-z][a-z0-9_]*$/.test(decodeURIComponent(url.username))
  )
    throw new DatabaseOperationError(
      'Select an explicit local FATS container and matching database name. System databases, URL options, and remote targets are refused.',
    );
  const labels = await docker([
    'inspect',
    '--format',
    '{{index .Config.Labels "fats.task"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}',
    target.container,
  ]);
  const [task, project, service] = labels.split('|');
  if (task !== 'phase4' && !(project === 'ats' && service === 'postgres'))
    throw new DatabaseOperationError(
      'The selected container is not a FATS development or disposable test database.',
    );
  const ports = JSON.parse(
    await docker([
      'inspect',
      '--format',
      '{{json .HostConfig.PortBindings}}',
      target.container,
    ]),
  );
  const bindings = ports?.['5432/tcp'];
  if (
    bindings?.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    bindings[0].HostPort !== (url.port || '5432')
  )
    throw new DatabaseOperationError(
      'Container loopback port does not match the selected database connection.',
    );
  return { url, user: decodeURIComponent(url.username) };
}
async function expectedMigrations() {
  const directory = new URL('../../migrations/', import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        createHash('sha256')
          .update(await readFile(new URL(name, directory)))
          .digest('hex'),
      ]),
    ),
  );
}
async function digest(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function databaseIdentity(
  client: PoolClient,
  target: DatabaseTarget,
  user: string,
) {
  const { rows } = await client.query(
    "SELECT current_database() AS database,current_user AS username,current_setting('server_version_num') AS version",
  );
  if (
    rows[0].database !== target.database ||
    rows[0].username !== user ||
    Math.floor(Number(rows[0].version) / 10000) !== 17
  )
    throw new DatabaseOperationError(
      'Database identity or PostgreSQL major version differs from the requested local PostgreSQL 17 target.',
    );
  const present = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  if (present.rows.some((row) => !tables.includes(row.tablename)))
    throw new DatabaseOperationError(
      'This database contains unrelated tables. Select a dedicated FATS database.',
    );
}
async function recordCounts(client: PoolClient): Promise<Manifest['counts']> {
  const { rows } = await client.query(
    `SELECT json_build_object('users',(SELECT count(*)::int FROM "user"),'accounts',(SELECT count(*)::int FROM account),'applications',(SELECT count(*)::int FROM applications),'interviews',(SELECT count(*)::int FROM interviews)) AS counts`,
  );
  return rows[0].counts;
}
// Child output may contain SQL or private rows. Never inherit it or include it
// in thrown errors. Passwords are used only by pg's private in-process pool.
async function databaseProcess(
  container: string,
  args: string[],
  output?: string,
  input?: string,
) {
  const child = spawn(
    'docker',
    ['exec', ...(input ? ['-i'] : []), container, ...args],
    { stdio: ['pipe', output ? 'pipe' : 'ignore', 'pipe'] },
  );
  let diagnostic = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    // Keep only a SQLSTATE, never the original diagnostic or row values.
    const code = chunk
      .toString()
      .match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];
    if (code) diagnostic = ` (SQLSTATE ${code})`;
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', () =>
      reject(
        new DatabaseOperationError(
          'Database utility could not start. No private diagnostic output was printed.',
        ),
      ),
    );
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new DatabaseOperationError(
              'Database utility failed. Restore transactions roll back; keep the application stopped and retain the original archive.',
            ),
          ),
    );
  });
  // Observe rejection immediately, even if streaming finishes later.
  void done.catch(() => {});
  const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
  try {
    const streams: Promise<unknown>[] = [];
    if (output)
      streams.push(
        pipeline(
          child.stdout!,
          createWriteStream(output, { flags: 'wx', mode: 0o600 }),
        ),
      );
    if (input) streams.push(pipeline(createReadStream(input), child.stdin!));
    else child.stdin!.end();
    await Promise.all([...streams, done]);
  } catch {
    child.kill('SIGTERM');
    await done.catch(() => {});
    throw new DatabaseOperationError(
      `Database utility failed${diagnostic}. No successful backup or restore is claimed; the restore transaction rolls back.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function createDatabaseBackup(
  target: DatabaseTarget,
  file: string,
  documentStorage?: DocumentStorage,
): Promise<Manifest> {
  const { user } = await checkedTarget(target);
  if (!file.endsWith('.dump'))
    throw new DatabaseOperationError(
      'Use a .dump filename in a private backup directory.',
    );
  const output = resolve(file);
  if (
    (await stat(output).catch(() => null)) ||
    (await stat(output + '.manifest.json').catch(() => null)) ||
    (await stat(output + '.documents').catch(() => null))
  )
    throw new DatabaseOperationError(
      'Backup output already exists. Choose a new filename.',
    );
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const temporary = output + '.' + randomUUID() + '.partial';
  const pool = new Pool({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(16432,5)');
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await databaseIdentity(client, target, user);
    const migrations = await expectedMigrations();
    const applied = Object.fromEntries(
      (
        await client.query(
          'SELECT name,checksum FROM fats_schema_migrations ORDER BY name',
        )
      ).rows.map((row) => [row.name, row.checksum]),
    );
    if (JSON.stringify(applied) !== JSON.stringify(migrations))
      throw new DatabaseOperationError(
        'Apply the current FATS migrations before creating this backup.',
      );
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS id'))
      .rows[0].id;
    const counts = await recordCounts(client);
    const documents = (
      await client.query(
        'SELECT storage_key,byte_size,sha256 FROM document_versions ORDER BY storage_key',
      )
    ).rows as Manifest['documents'];
    if (documents.length && !documentStorage)
      throw new DatabaseOperationError(
        'This database contains private document files. Configure FATS_DOCUMENTS_DIR; a metadata-only archive is not a complete backup.',
      );
    if (documents.length) {
      await mkdir(output + '.documents', { mode: 0o700 });
      const bundle = new FilesystemDocumentStorage(output + '.documents');
      for (const row of documents) {
        try {
          await bundle.put(
            row.storage_key,
            await verifiedDocumentBytes(documentStorage!, row),
          );
        } catch {
          throw new DatabaseOperationError(
            'Document content is missing, damaged, or unavailable. No complete backup was created. Recover the files before trying again.',
          );
        }
      }
    }
    await databaseProcess(
      target.container,
      [
        'pg_dump',
        '-U',
        user,
        '-d',
        target.database,
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--schema=public',
        '--snapshot=' + snapshot,
      ],
      temporary,
    );
    const manifest: Manifest = {
      format: 'fats-postgres-backup',
      version: 2,
      documents,
      postgresMajor: 17,
      createdAt: new Date().toISOString(),
      sourceDatabase: target.database,
      sha256: await digest(temporary),
      migrations,
      counts,
    };
    if (
      Buffer.byteLength(JSON.stringify(manifest, null, 2) + '\n') >
      16 * 1024 * 1024
    )
      throw new DatabaseOperationError(
        'This document inventory exceeds the local archive manifest limit. No complete backup was created.',
      );
    await client.query('COMMIT');
    // Manifest and archive are independent private files. A missing/mismatched
    // sidecar makes an interrupted backup unusable rather than restorable.
    await writeFile(
      output + '.manifest.json',
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await link(temporary, output); // Exclusive destination; never replace an older archive.
    return manifest;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock(16432,5)').catch(() => {});
    client.release();
    await pool.end();
    await rm(temporary, { force: true });
  }
}
async function validateArchive(
  target: DatabaseTarget,
  file: string,
  copy: string,
): Promise<Manifest> {
  try {
    if ((await stat(file + '.manifest.json')).size > 16 * 1024 * 1024)
      throw new Error();
    const manifest = JSON.parse(
      await readFile(file + '.manifest.json', 'utf8'),
    ) as Manifest;
    const expected = await expectedMigrations();
    if (
      manifest.format !== 'fats-postgres-backup' ||
      manifest.version !== 2 ||
      !Array.isArray(manifest.documents) ||
      manifest.documents.some(
        (row) =>
          !row ||
          Object.keys(row).sort().join(',') !==
            'byte_size,sha256,storage_key' ||
          !isStorageKey(row.storage_key) ||
          !Number.isInteger(row.byte_size) ||
          row.byte_size < 1 ||
          row.byte_size > 10485760 ||
          !/^[0-9a-f]{64}$/.test(row.sha256),
      ) ||
      new Set(manifest.documents.map((row) => row.storage_key)).size !==
        manifest.documents.length ||
      manifest.postgresMajor !== 17 ||
      JSON.stringify(manifest.migrations) !== JSON.stringify(expected) ||
      !manifest.counts ||
      Object.keys(manifest.counts).sort().join(',') !==
        'accounts,applications,interviews,users' ||
      Object.values(manifest.counts).some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      )
    )
      throw new Error();
    if (manifest.documents.length) {
      const bundle = new FilesystemDocumentStorage(file + '.documents');
      for (const row of manifest.documents)
        await verifiedDocumentBytes(bundle, row);
    }
    await copyFile(file, copy);
    if ((await digest(copy)) !== manifest.sha256) throw new Error();
    const handle = await open(copy, 'r');
    const header = Buffer.alloc(5);
    try {
      await handle.read(header, 0, 5, 0);
    } finally {
      await handle.close();
    }
    if (header.toString() !== 'PGDMP') throw new Error();
    // pg_restore parses the archive fully when generating the private SQL.
    await databaseProcess(
      target.container,
      ['pg_restore', '--list'],
      undefined,
      copy,
    );
    return manifest;
  } catch {
    throw new DatabaseOperationError(
      'Backup is invalid, incomplete, changed, or incompatible with this FATS/PostgreSQL version. Nothing was restored. Keep the original file and select a trusted complete backup pair.',
    );
  }
}
export async function restoreDatabaseBackup(
  target: DatabaseTarget,
  file: string,
  confirmation?: string,
  checkOnly = false,
  restoreDocumentsDirectory?: string,
) {
  const { user } = await checkedTarget(target);
  const directory = await mkdtemp(tmpdir() + '/fats-restore-');
  const archive = directory + '/archive.dump',
    sql = directory + '/restore.sql';
  let createdDocumentsDirectory: string | undefined;
  let restored = false;
  let restoreStarted = false;
  try {
    const manifest = await validateArchive(target, resolve(file), archive);
    if (manifest.documents.length) {
      if (!restoreDocumentsDirectory)
        throw new DatabaseOperationError(
          'This archive includes private files. Independently configure FATS_RESTORE_DOCUMENTS_DIR to a fresh private directory.',
        );
      const selected = new FilesystemDocumentStorage(restoreDocumentsDirectory);
      if (await stat(selected.root).catch(() => null))
        throw new DatabaseOperationError(
          'Select a fresh, nonexistent restore document directory. Existing document directories are never replaced.',
        );
    }
    const pool = new Pool({
      connectionString: target.connectionString,
      connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    try {
      await databaseIdentity(client, target, user);
      if (checkOnly) return manifest;
      if (confirmation !== `RESTORE ${target.database}`)
        throw new DatabaseOperationError(
          'No database changed. Preview first, stop the application, then explicitly confirm RESTORE followed by the exact target database name.',
        );
      const other = (
        await client.query(
          'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()',
        )
      ).rows[0].count;
      if (other !== 0)
        throw new DatabaseOperationError(
          'Other connections are using this database. Stop the application and database tools before restoring.',
        );
      if (manifest.documents.length) {
        const destination = new FilesystemDocumentStorage(
          restoreDocumentsDirectory!,
        );
        await mkdir(destination.root, { mode: 0o700 });
        createdDocumentsDirectory = destination.root;
        const source = new FilesystemDocumentStorage(
          resolve(file) + '.documents',
        );
        for (const row of manifest.documents) {
          await destination.put(
            row.storage_key,
            await verifiedDocumentBytes(source, row),
          );
          await verifiedDocumentBytes(destination, row);
        }
      }
      await databaseProcess(
        target.container,
        [
          'pg_restore',
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-acl',
          '--file=-',
        ],
        sql,
        archive,
      );
      const ledger = JSON.stringify(manifest.migrations);
      const documentChecks = `IF (SELECT COALESCE(jsonb_agg(jsonb_build_object('storage_key',storage_key,'byte_size',byte_size,'sha256',sha256) ORDER BY storage_key),'[]'::jsonb) FROM public.document_versions) IS DISTINCT FROM '${JSON.stringify(manifest.documents)}'::jsonb THEN RAISE EXCEPTION 'Restored document inventory differs'; END IF;`;
      const checks = Object.entries(manifest.counts)
        .map(([key, count]) => {
          const table =
            key === 'users' ? '"user"' : key === 'accounts' ? 'account' : key;
          return `IF (SELECT count(*) FROM public.${table}) <> ${count} THEN RAISE EXCEPTION 'Restored counts differ'; END IF;`;
        })
        .join('\n');
      await appendFile(
        sql,
        `\nDELETE FROM public.session; DELETE FROM public.verification; DELETE FROM public.workspace_stages; DELETE FROM public.matching_previews; UPDATE public.matching_reports SET status='failed',failure='interrupted',sources=NULL WHERE status='running';\nDO $fats$ BEGIN IF (SELECT jsonb_object_agg(name,checksum) FROM public.fats_schema_migrations) IS DISTINCT FROM '${ledger}'::jsonb THEN RAISE EXCEPTION 'Restored schema differs'; END IF; ${checks} ${documentChecks} END; $fats$;\n`,
      );
      // psql wraps schema/data, count/ledger checks, and token revocation in
      // one transaction. Any error leaves the previous target intact.
      restoreStarted = true;
      await databaseProcess(
        target.container,
        [
          'psql',
          '-X',
          '-q',
          '-U',
          user,
          '-d',
          target.database,
          '--single-transaction',
          '--set=ON_ERROR_STOP=1',
          '--set=VERBOSITY=sqlstate',
          '--file=-',
        ],
        undefined,
        sql,
      );
      restored = true;
      return manifest;
    } finally {
      client.release();
      await pool.end();
    }
  } finally {
    if (createdDocumentsDirectory && !restored && !restoreStarted)
      await rm(createdDocumentsDirectory, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
}
