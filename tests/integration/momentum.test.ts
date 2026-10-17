import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { activityDate, OFFER_CHECKLIST } from '@fats/domain';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import { PostgresOfferRepository } from '../../apps/web/src/server/offer-repository';
import { recordMomentum } from '../../apps/web/src/server/momentum';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
import { syntheticScanner } from '../helpers/document-scanner';
import { pdfFixture } from '../helpers/document-fixtures';

const url = process.env.FATS_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Use a dedicated local test database.');
const pool = createDatabasePool(url);
const owners: string[] = [];
let root: string;
beforeAll(async () => {
  await runMigrations(pool);
  root = await mkdtemp('/tmp/fats-momentum-');
});
afterAll(async () => {
  for (const id of owners) {
    await pool.query('DELETE FROM offer_events WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM offers WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM document_versions WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM documents WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await pool.end();
  if (root) await rm(root, { recursive: true, force: true });
});
async function owner() {
  const id = randomUUID();
  owners.push(id);
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [id, 'Synthetic Momentum', `momentum-${id}@example.test`],
  );
  return { id, workspace: new PostgresWorkspaceRepository(pool, id) };
}
const input = {
  title: 'Graduate developer',
  company: 'Example',
  location: 'Manila',
  sourceUrl: 'https://example.test/momentum',
  description: '',
};
async function recorded(id: string) {
  return (
    await pool.query(
      'SELECT active_on::text AS day FROM momentum_days WHERE user_id=$1 ORDER BY active_on',
      [id],
    )
  ).rows.map((row) => row.day);
}
async function clear(id: string) {
  await pool.query('DELETE FROM momentum_days WHERE user_id=$1', [id]);
}

it('uses Philippine midnight independently of the database timezone and rolls activity back atomically', async () => {
  const a = await owner();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL TIME ZONE 'America/Los_Angeles'");
    await recordMomentum(client, a.id, '2026-10-18T15:59:59.999Z');
    await recordMomentum(client, a.id, '2026-10-18T16:00:00.000Z');
    await recordMomentum(client, a.id, '2026-10-18T16:00:00.000Z');
    const { rows } = await client.query(
      'SELECT active_on::text AS day FROM momentum_days WHERE user_id=$1 ORDER BY active_on',
      [a.id],
    );
    expect(rows.map((row) => row.day)).toEqual(['2026-10-18', '2026-10-19']);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  expect(await recorded(a.id)).toEqual([]);
});

it('persists one owner-scoped day for concurrent saves and ignores retries, reads, unchanged edits, and failures', async () => {
  const a = await owner(),
    b = await owner();
  const id = randomUUID();
  const [application] = await Promise.all([
    a.workspace.create(input, id),
    a.workspace.create(input, id),
  ]);
  expect(await recorded(a.id)).toEqual([activityDate(application.createdAt)]);
  expect(await recorded(b.id)).toEqual([]);
  expect(
    (await new PostgresWorkspaceRepository(pool, a.id).getWorkspace())
      .activityDays,
  ).toContain(activityDate(application.createdAt));
  // Removing this synthetic owner's ledger simulates a later, inactive day:
  // these requests must not write any activity entry, even with a fresh request.
  await clear(a.id);
  await a.workspace.create(input, id);
  await a.workspace.getWorkspace();
  await a.workspace.update(id, { ...input, status: 'Saved' });
  await expect(a.workspace.create({ ...input, title: '' })).rejects.toThrow();
  await expect(
    b.workspace.update(id, { ...input, status: 'Applied' }),
  ).rejects.toThrow('not found');
  expect(await recorded(a.id)).toEqual([]);
  expect(await recorded(b.id)).toEqual([]);
  await a.workspace.update(id, { ...input, status: 'Applied' });
  expect(await recorded(a.id)).toHaveLength(1);
});

it('records interview preparation, independent of the scheduled interview date', async () => {
  const a = await owner();
  const application = await a.workspace.create(input);
  await clear(a.id);
  const interview = await a.workspace.createInterview({
    applicationId: application.id,
    title: 'Conversation',
    stage: 'HR',
    scheduledAt: '2030-01-01T00:00:00.000Z',
    timeZone: 'America/New_York',
    location: 'Manila',
    meetingUrl: '',
    preparationNotes: '',
    reflections: '',
  });
  expect(await recorded(a.id)).toEqual([activityDate(interview.createdAt)]);
  await clear(a.id);
  await a.workspace.updateInterview(interview.id, interview);
  expect(await recorded(a.id)).toEqual([]);
  await a.workspace.updateInterview(interview.id, {
    ...interview,
    preparationNotes: 'Prepare questions about training.',
  });
  expect(await recorded(a.id)).toHaveLength(1);
});

it('counts only accepted new document bytes, preserving quarantine and metadata boundaries', async () => {
  const a = await owner();
  const storage = new FilesystemDocumentStorage(root);
  const documents = new PostgresDocumentRepository(
    pool,
    a.id,
    storage,
    syntheticScanner,
  );
  const bytes = await pdfFixture();
  const requestId = randomUUID();
  const details = { requestId, name: 'Synthetic resume', category: 'Resumes' };
  const saved = await documents.upload(bytes, 'resume.pdf', details);
  expect(await recorded(a.id)).toHaveLength(1);
  await clear(a.id);
  await documents.upload(bytes, 'resume.pdf', details);
  await documents.upload(bytes, 'resume.pdf', {
    ...details,
    requestId: randomUUID(),
    documentId: saved.documentId,
  });
  await documents.edit(saved.documentId, {
    name: 'Renamed',
    category: 'Resumes',
    archived: false,
    isDefault: true,
  });
  expect(await recorded(a.id)).toEqual([]);
  const rejecting = new PostgresDocumentRepository(pool, a.id, storage, {
    async scan() {
      throw new Error('Synthetic rejection');
    },
  });
  await expect(
    rejecting.upload(await pdfFixture('Rejected bytes'), 'resume.pdf', {
      ...details,
      requestId: randomUUID(),
    }),
  ).rejects.toThrow();
  expect(await recorded(a.id)).toEqual([]);
  await documents.upload(
    await pdfFixture('Updated skills and project experience'),
    'resume.pdf',
    { ...details, requestId: randomUUID(), documentId: saved.documentId },
  );
  expect(await recorded(a.id)).toHaveLength(1);
});

it('counts substantive offer terms/reviews while ignoring retry IDs and unchanged review submissions', async () => {
  const a = await owner();
  const application = await a.workspace.create(input);
  const offers = new PostgresOfferRepository(pool, a.id);
  const command = {
    kind: 'terms',
    occurredOn: '2026-01-01',
    notes: '',
    terms: {
      receivedOn: '2026-01-01',
      salaryAmount: '30000',
      currency: 'PHP',
      frequency: 'monthly',
      employmentType: '',
      arrangement: '',
      location: '',
      benefits: '',
      startOn: '',
      deadlineOn: '',
      timeZone: 'Asia/Manila',
      notes: '',
      documentVersionId: '',
    },
  };
  await clear(a.id);
  const requestId = randomUUID();
  await offers.command(application.id, requestId, 0, command);
  expect(await recorded(a.id)).toHaveLength(1);
  await clear(a.id);
  await offers.command(application.id, requestId, 0, command);
  await offers.command(application.id, randomUUID(), 1, command);
  const review = {
    kind: 'review',
    occurredOn: '2026-01-01',
    checklist: OFFER_CHECKLIST.map(() => 'Not reviewed'),
    questions: '',
  };
  await offers.command(application.id, randomUUID(), 2, review);
  expect(await recorded(a.id)).toEqual([]);
  await offers.command(application.id, randomUUID(), 3, {
    ...review,
    questions: 'What training is available?',
  });
  expect(await recorded(a.id)).toHaveLength(1);
});
