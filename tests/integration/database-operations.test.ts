import { syntheticScanner } from '../helpers/document-scanner';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  createDatabasePool,
  createServices,
} from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import {
  handleAuth,
  handleWorkspace,
} from '../../apps/web/src/server/handlers';
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  type DatabaseTarget,
} from '../../apps/web/src/server/database-operations';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import { PostgresOfferRepository } from '../../apps/web/src/server/offer-repository';
import { serializeBackup } from '@fats/domain';
import { portableOfferFixture } from '../helpers/portable-offer-fixture';

const base = process.env.FATS_TEST_DATABASE_URL;
if (
  !base ||
  new URL(base).hostname !== '127.0.0.1' ||
  new URL(base).port !== '16432' ||
  new URL(base).pathname !== '/fats_phase4_test'
)
  throw new Error(
    'Backup integration tests require the labelled disposable FATS database helper.',
  );
const suffix = randomUUID().replaceAll('-', '');
const sourceName = 'fats_backup_' + suffix + '_test',
  restoreName = 'fats_restore_' + suffix + '_test';
function target(database: string): DatabaseTarget {
  const url = new URL(base!);
  url.pathname = '/' + database;
  return {
    connectionString: url.href,
    container: 'fats-phase4-tests',
    database,
  };
}
const source = target(sourceName),
  destination = target(restoreName);
const admin = createDatabasePool(base);
const sourcePool = createDatabasePool(source.connectionString),
  restoredPool = createDatabasePool(destination.connectionString);
let directory: string,
  archive: string,
  services: ReturnType<typeof createServices>;
const origin = 'http://127.0.0.1:3000',
  secret = randomUUID() + randomUUID(),
  password = 'Synthetic-backup-passphrase-42!';
let ownerId: string, sessionCookie: string;
const messages: { text: string }[] = [];
async function auth(path: string, body: unknown, instance = services) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    instance,
  );
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${sourceName}`);
  await admin.query(`CREATE DATABASE ${restoreName}`);
  await runMigrations(sourcePool);
  await runMigrations(restoredPool);
  // Close all operational pools before the restore checks active connections.
  await restoredPool.end();
  services = createServices(
    source.connectionString,
    origin,
    secret,
    async (message) => {
      messages.push(message);
    },
  );
  const email = `backup-${suffix}@example.test`;
  expect(
    (await auth('sign-up/email', { name: 'Backup test', email, password }))
      .status,
  ).toBe(200);
  const code = messages[0].text.match(/code is (\d{8})/)![1];
  expect((await auth('verify-email', { email, code })).status).toBe(200);
  const login = await auth('sign-in/email', { email, password });
  const result = await login.json();
  ownerId = result.user.id;
  sessionCookie = login.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
  const repository = new PostgresWorkspaceRepository(services.pool, ownerId);
  const app = await repository.create({
    title: 'Recovered opportunity',
    company: 'Example',
    sourceUrl: 'https://example.test/recovered',
    location: 'Makati',
    description: 'Keep every field.',
  });
  await repository.createInterview({
    applicationId: app.id,
    title: 'Recovered interview',
    stage: 'Technical',
    scheduledAt: '2030-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.test/meeting',
    location: '',
    preparationNotes: 'Original preparation.',
    reflections: '',
  });
  await auth('request-password-reset', { email });
  const backup = await repository.exportBackup();
  await repository.previewRestore(backup);
  directory = await mkdtemp(tmpdir() + '/fats-backup-test-');
  archive = directory + '/workspace.dump';
});
afterAll(async () => {
  await services?.pool.end();
  await sourcePool.end();
  for (const name of [sourceName, restoreName])
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('backs up a consistent PostgreSQL archive and refuses overwriting files', async () => {
  const manifest = await createDatabaseBackup(source, archive);
  expect(manifest.counts).toEqual({
    users: 1,
    accounts: 1,
    applications: 1,
    interviews: 1,
  });
  expect((await stat(archive)).mode & 0o077).toBe(0);
  expect((await stat(archive + '.manifest.json')).mode & 0o077).toBe(0);
  await expect(createDatabaseBackup(source, archive)).rejects.toThrow(
    'already exists',
  );
  const metadata = await readFile(archive + '.manifest.json', 'utf8');
  expect(metadata.includes(password)).toBe(false);
  expect(metadata.includes(new URL(source.connectionString).password)).toBe(
    false,
  );
});
it('previews without writes, requires the exact target confirmation, and rejects wrong targets and incompatible/incomplete archives', async () => {
  expect(
    (await restoreDatabaseBackup(destination, archive, undefined, true)).counts
      .interviews,
  ).toBe(1);
  await expect(restoreDatabaseBackup(destination, archive)).rejects.toThrow(
    'explicitly confirm',
  );
  await expect(
    restoreDatabaseBackup(destination, archive, 'RESTORE ' + sourceName),
  ).rejects.toThrow('explicitly confirm');
  await expect(
    restoreDatabaseBackup(
      { ...destination, database: sourceName },
      archive,
      'RESTORE ' + sourceName,
    ),
  ).rejects.toThrow('matching database');
  await expect(
    restoreDatabaseBackup(
      { ...destination, container: 'other-unowned-container' },
      archive,
      'RESTORE ' + restoreName,
    ),
  ).rejects.toThrow();
  const bad = directory + '/invalid.dump';
  await writeFile(bad, 'not an archive', { mode: 0o600 });
  await expect(
    restoreDatabaseBackup(destination, bad, 'RESTORE ' + restoreName),
  ).rejects.toThrow('invalid');
  await copyFile(archive + '.manifest.json', bad + '.manifest.json');
  await expect(
    restoreDatabaseBackup(destination, bad, 'RESTORE ' + restoreName),
  ).rejects.toThrow('invalid');
  const manifest = JSON.parse(
    await readFile(archive + '.manifest.json', 'utf8'),
  );
  manifest.postgresMajor = 18;
  await writeFile(bad + '.manifest.json', JSON.stringify(manifest));
  await expect(
    restoreDatabaseBackup(destination, bad, 'RESTORE ' + restoreName),
  ).rejects.toThrow('incompatible');
  const pool = createDatabasePool(destination.connectionString);
  try {
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM "user"')).rows[0]
        .count,
    ).toBe(0);
  } finally {
    await pool.end();
  }
});
it('performs a real confirmed restore and verifies records, relationships, credentials, schema and revoked recovery/session state', async () => {
  const before = await new PostgresWorkspaceRepository(
    services.pool,
    ownerId,
  ).getWorkspace();
  await restoreDatabaseBackup(destination, archive, 'RESTORE ' + restoreName);
  const recovered = createServices(
    destination.connectionString,
    origin,
    secret,
    async () => {},
  );
  try {
    expect(
      await new PostgresWorkspaceRepository(
        recovered.pool,
        ownerId,
      ).getWorkspace(),
    ).toEqual(before);
    for (const table of ['session', 'verification', 'workspace_stages'])
      expect(
        (
          await recovered.pool.query(
            `SELECT count(*)::int AS count FROM ${table}`,
          )
        ).rows[0].count,
      ).toBe(0);
    const oldSession = await handleWorkspace(
      new Request(origin + '/api/workspace', {
        headers: { origin, cookie: sessionCookie },
      }),
      recovered,
    );
    expect(oldSession.status).toBe(401);
    const email = `backup-${suffix}@example.test`;
    expect(
      (await auth('sign-in/email', { email, password }, recovered)).status,
    ).toBe(200);
    expect(
      (
        await recovered.pool.query(
          'SELECT count(*)::int AS count FROM fats_schema_migrations',
        )
      ).rows[0].count,
    ).toBe(9);
    await expect(
      recovered.pool.query('DELETE FROM applications WHERE user_id=$1', [
        ownerId,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
  } finally {
    await recovered.pool.end();
  }
  expect(
    await new PostgresWorkspaceRepository(
      services.pool,
      ownerId,
    ).getWorkspace(),
  ).toEqual(before);
});
it('refuses an in-use target and keeps an existing restored workspace intact when another archive is invalid', async () => {
  const pool = createDatabasePool(destination.connectionString);
  try {
    const before = await new PostgresWorkspaceRepository(
      pool,
      ownerId,
    ).getWorkspace();
    await expect(
      restoreDatabaseBackup(destination, archive, 'RESTORE ' + restoreName),
    ).rejects.toThrow('Other connections');
    const broken = directory + '/broken.dump';
    await writeFile(broken, (await readFile(archive)).subarray(0, 100), {
      mode: 0o600,
    });
    await copyFile(archive + '.manifest.json', broken + '.manifest.json');
    await expect(
      restoreDatabaseBackup(destination, broken, 'RESTORE ' + restoreName),
    ).rejects.toThrow('invalid');
    expect(
      await new PostgresWorkspaceRepository(pool, ownerId).getWorkspace(),
    ).toEqual(before);
  } finally {
    await pool.end();
  }
});
it('rolls back schema replacement and token revocation when post-restore verification fails', async () => {
  const pool = createDatabasePool(destination.connectionString);
  let before;
  let sessions;
  try {
    await pool.query(
      'UPDATE applications SET description=$2 WHERE user_id=$1',
      [ownerId, 'A destination edit made after the archive.'],
    );
    before = await new PostgresWorkspaceRepository(
      pool,
      ownerId,
    ).getWorkspace();
    sessions = (await pool.query('SELECT id FROM session ORDER BY id')).rows;
    expect(sessions.length).toBeGreaterThan(0);
  } finally {
    await pool.end();
  }
  const mismatch = directory + '/mismatched-counts.dump';
  await copyFile(archive, mismatch);
  const manifest = JSON.parse(
    await readFile(archive + '.manifest.json', 'utf8'),
  );
  manifest.counts.applications += 1;
  await writeFile(mismatch + '.manifest.json', JSON.stringify(manifest), {
    mode: 0o600,
  });
  await expect(
    restoreDatabaseBackup(destination, mismatch, 'RESTORE ' + restoreName),
  ).rejects.toThrow('Database utility failed');
  const after = createDatabasePool(destination.connectionString);
  try {
    expect(
      await new PostgresWorkspaceRepository(after, ownerId).getWorkspace(),
    ).toEqual(before);
    expect(
      (await after.query('SELECT id FROM session ORDER BY id')).rows,
    ).toEqual(sessions);
  } finally {
    await after.end();
  }
});

it('backs up and restores matching immutable document versions and application links with verified private file bytes', async () => {
  const { FilesystemDocumentStorage } =
    await import('../../apps/web/src/server/document-storage');
  const { PostgresDocumentRepository } =
    await import('../../apps/web/src/server/document-repository');
  const { pdfFixture, docxFixture } =
    await import('../helpers/document-fixtures');
  const storage = new FilesystemDocumentStorage(directory + '/source-files');
  const documents = new PostgresDocumentRepository(
    services.pool,
    ownerId,
    storage,
    syntheticScanner,
  );
  const first = await documents.upload(await pdfFixture(), 'resume.pdf', {
    requestId: randomUUID(),
    name: 'Recovery resume',
    category: 'Resumes',
  });
  await documents.upload(docxFixture(), 'resume-v2.docx', {
    requestId: randomUUID(),
    documentId: first.documentId,
  });
  const app = (
    await new PostgresWorkspaceRepository(services.pool, ownerId).getWorkspace()
  ).applications[0];
  await documents.associate(app.id, first.versionId);
  const offers = new PostgresOfferRepository(services.pool, ownerId);
  const offerTerms = {
    receivedOn: '2026-10-16',
    salaryAmount: '35000.0001',
    currency: 'PHP',
    frequency: 'monthly',
    employmentType: 'Probationary',
    arrangement: 'hybrid',
    location: 'Makati',
    benefits: 'Meal allowance',
    startOn: '2026-11-02',
    deadlineOn: '2026-10-20',
    timeZone: 'Asia/Manila',
    notes: 'Clarify hours',
    documentVersionId: first.versionId,
  };
  await offers.command(app.id, randomUUID(), 0, {
    kind: 'terms',
    occurredOn: '2026-10-16',
    notes: 'Original offer',
    terms: offerTerms,
  });
  await offers.command(app.id, randomUUID(), 1, {
    kind: 'terms',
    occurredOn: '2026-10-20',
    notes: 'Revised offer',
    terms: { ...offerTerms, salaryAmount: '38000' },
  });
  await offers.command(app.id, randomUUID(), 2, {
    kind: 'review',
    occurredOn: '2026-10-20',
    checklist: Array(10).fill('Need to clarify'),
    questions: 'What are the hours?',
  });
  await offers.command(app.id, randomUUID(), 3, {
    kind: 'decision',
    occurredOn: '2026-10-21',
    notes: 'Communicated to HR',
    decision: 'accepted',
    confirmed: true,
  });
  const workspace = new PostgresWorkspaceRepository(services.pool, ownerId);
  const portable = await workspace.previewRestore(
    serializeBackup(portableOfferFixture()),
  );
  await workspace.restoreBackup(portable.token);
  const offersBefore = await offers.list();
  expect(offersBefore).toHaveLength(2);
  expect(
    offersBefore.find((offer) => offer.applicationId === 'portable-application')
      ?.events[0].unavailableDocumentReference,
  ).toBeTruthy();
  const file = directory + '/with-documents.dump',
    recoveredRoot = directory + '/recovered-files';
  await expect(createDatabaseBackup(source, file)).rejects.toThrow(
    'metadata-only',
  );
  const { MatchingRepository } =
    await import('../../apps/web/src/server/matching-repository');
  const matchingProvider = {
    configuration: {
      provider: 'deterministic-test',
      model: 'backup-fixture',
      version: 'matching-v1',
    },
    label: 'Backup test fixture',
    external: false,
    analyze: async () => ({ requirements: [] }),
  };
  const matching = new MatchingRepository(
    services.pool,
    ownerId,
    storage,
    matchingProvider,
  );
  const prepared = await matching.prepare(
    app.id,
    first.versionId,
    'Backup test',
  );
  if (!('id' in prepared))
    throw new Error('Expected a readable synthetic resume.');
  await matching.compare(prepared.id, randomUUID());
  const matchingBefore = await matching.list(app.id);
  const interrupted = randomUUID();
  const pending = await matching.prepare(
    app.id,
    first.versionId,
    'Backup test',
  );
  if (!('id' in pending))
    throw new Error('Expected a readable synthetic resume.');
  await services.pool.query(
    "INSERT INTO matching_reports(user_id,id,preview_id,application_id,version_id,job_revision,job_hash,configuration,sources,status) SELECT user_id,$2,id,application_id,version_id,job_revision,job_hash,configuration,sources,'running' FROM matching_previews WHERE user_id=$1 AND id=$3",
    [ownerId, interrupted, pending.id],
  );
  const usageBefore = (
    await services.pool.query(
      'SELECT day,scope,attempts FROM matching_usage ORDER BY day,scope',
    )
  ).rows;
  const manifest = await createDatabaseBackup(source, file, storage);
  expect(manifest.documents).toHaveLength(2);
  expect(manifest.version).toBe(2);
  await expect(
    restoreDatabaseBackup(destination, file, undefined, true),
  ).rejects.toThrow('FATS_RESTORE_DOCUMENTS_DIR');
  expect(
    (
      await restoreDatabaseBackup(
        destination,
        file,
        undefined,
        true,
        recoveredRoot,
      )
    ).documents,
  ).toHaveLength(2);
  await expect(stat(recoveredRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  const entry = manifest.documents[0],
    bundlePath = file + '.documents/' + entry.storage_key + '.blob';
  const original = await readFile(bundlePath);
  await writeFile(bundlePath, Buffer.alloc(entry.byte_size));
  await expect(
    restoreDatabaseBackup(
      destination,
      file,
      'RESTORE ' + restoreName,
      false,
      recoveredRoot,
    ),
  ).rejects.toThrow('invalid');
  await expect(stat(recoveredRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(bundlePath, original);
  // Invalid post-restore checks roll back SQL; retain private bytes after a restore attempt in case the commit response is ambiguous.
  const rollbackRoot = directory + '/failed-restore-files';
  const metadata = JSON.parse(await readFile(file + '.manifest.json', 'utf8'));
  metadata.counts.applications++;
  await writeFile(file + '.manifest.json', JSON.stringify(metadata));
  await expect(
    restoreDatabaseBackup(
      destination,
      file,
      'RESTORE ' + restoreName,
      false,
      rollbackRoot,
    ),
  ).rejects.toThrow('Database utility failed');
  expect((await stat(rollbackRoot)).isDirectory()).toBe(true);
  await writeFile(file + '.manifest.json', JSON.stringify(manifest));
  await restoreDatabaseBackup(
    destination,
    file,
    'RESTORE ' + restoreName,
    false,
    recoveredRoot,
  );
  const pool = createDatabasePool(destination.connectionString);
  try {
    const recovered = new PostgresDocumentRepository(
      pool,
      ownerId,
      new FilesystemDocumentStorage(recoveredRoot),
    );
    expect(
      (await recovered.library()).documents[0].versions.every(
        (v) => v.health === 'unverified',
      ),
    ).toBe(true);
    await expect(recovered.download(first.versionId)).rejects.toMatchObject({
      status: 409,
    });
    const { recheckDocuments } =
      await import('../../apps/web/src/server/document-recheck');
    expect(
      await recheckDocuments(
        pool,
        new FilesystemDocumentStorage(recoveredRoot),
        syntheticScanner,
      ),
    ).toEqual({ accepted: 2, pending: 0 });
    expect(await recovered.library()).toEqual(await documents.library());
    expect(await new PostgresOfferRepository(pool, ownerId).list()).toEqual(
      offersBefore,
    );
    const recoveredMatching = await new MatchingRepository(
      pool,
      ownerId,
      new FilesystemDocumentStorage(recoveredRoot),
      matchingProvider,
    ).list(app.id);
    expect(
      recoveredMatching.filter((report) => report.id !== interrupted),
    ).toEqual(matchingBefore);
    expect(
      recoveredMatching.find((report) => report.id === interrupted),
    ).toMatchObject({
      status: 'failed',
      failure: 'interrupted',
      sources: null,
      result: null,
    });
    expect((await pool.query('SELECT 1 FROM matching_previews')).rowCount).toBe(
      0,
    );
    expect(
      (
        await pool.query(
          'SELECT day,scope,attempts FROM matching_usage ORDER BY day,scope',
        )
      ).rows,
    ).toEqual(usageBefore);
    expect(
      Buffer.from((await recovered.download(first.versionId)).bytes),
    ).toEqual(Buffer.from((await documents.download(first.versionId)).bytes));
    await expect(recovered.delete(first.documentId)).rejects.toThrow(
      'offer history',
    );
  } finally {
    await pool.end();
  }
  await expect(
    restoreDatabaseBackup(destination, file, undefined, true, recoveredRoot),
  ).rejects.toThrow('fresh');
  const sourceRow = (
    await services.pool.query(
      'SELECT storage_key FROM document_versions WHERE user_id=$1 AND id=$2',
      [ownerId, first.versionId],
    )
  ).rows[0];
  await rm(storage.root + '/' + sourceRow.storage_key + '.blob');
  await expect(
    createDatabaseBackup(source, directory + '/missing-content.dump', storage),
  ).rejects.toThrow('missing');
});
