import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  OFFER_CHECKLIST,
  parseBackup,
  serializeBackup,
  createBackup,
  portableEventCommand,
  type OfferTerms,
} from '@fats/domain';
import {
  portableOfferFixture,
  portableTimestamp,
} from '../helpers/portable-offer-fixture';
import {
  createServices,
  createDatabasePool,
} from '../../apps/web/src/server/services';
import { runMigrations } from '../../apps/web/src/server/migrations';
import {
  handleAuth,
  handleWorkspace,
} from '../../apps/web/src/server/handlers';
import { handleOffers } from '../../apps/web/src/server/offer-handlers';
import { PostgresOfferRepository } from '../../apps/web/src/server/offer-repository';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
import { pdfFixture } from '../helpers/document-fixtures';
const database = process.env.FATS_TEST_DATABASE_URL;
if (
  !database ||
  !['localhost', '127.0.0.1'].includes(new URL(database).hostname) ||
  !new URL(database).pathname.endsWith('_test')
)
  throw new Error('Use a dedicated local test database.');
const origin = 'http://127.0.0.1:3000',
  password = 'Synthetic-offer-passphrase-42!';
let services: ReturnType<typeof createServices>,
  root: string,
  storage: FilesystemDocumentStorage;
const owners: string[] = [],
  messages: { to: string; text: string }[] = [];
const terms: OfferTerms = {
  receivedOn: '2026-10-16',
  salaryAmount: '35000',
  currency: 'PHP',
  frequency: 'monthly',
  employmentType: '',
  arrangement: '',
  location: '',
  benefits: '',
  startOn: '',
  deadlineOn: '2026-10-20',
  timeZone: 'Asia/Manila',
  notes: '',
  documentVersionId: '',
};
const termCommand = (value = terms) => ({
  kind: 'terms',
  occurredOn: value.receivedOn,
  notes: '',
  terms: value,
});
async function auth(path: string, body: unknown) {
  return handleAuth(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    services,
  );
}
async function user(verified = true) {
  const email = `offers-${randomUUID()}@example.test`;
  expect(
    (await auth('sign-up/email', { email, password, name: 'Offer Test' }))
      .status,
  ).toBe(200);
  await expect.poll(() => messages.some((m) => m.to === email)).toBe(true);
  const id = (
    await services.pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id;
  owners.push(id);
  expect(
    (
      await auth('verify-email', {
        email,
        code: messages
          .find((m) => m.to === email)!
          .text.match(/code is (\d{8})/)![1],
      })
    ).status,
  ).toBe(200);
  const response = await auth('sign-in/email', { email, password });
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!verified)
    await services.pool.query(
      'UPDATE "user" SET "emailVerified"=false WHERE id=$1',
      [id],
    );
  const workspace = new PostgresWorkspaceRepository(services.pool, id);
  const application = await workspace.create({
    title: 'Graduate Developer',
    company: 'Synthetic Employer',
    location: 'Makati',
    sourceUrl: 'https://example.test/offer',
    description: '',
  });
  return {
    id,
    cookie,
    application,
    workspace,
    offers: new PostgresOfferRepository(services.pool, id),
    documents: new PostgresDocumentRepository(services.pool, id, storage),
  };
}
function request(
  cookie?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return handleOffers(
    new Request(origin + '/api/offers', {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    services,
  );
}
beforeAll(async () => {
  const pool = createDatabasePool(database!);
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
  services = createServices(
    database!,
    origin,
    randomUUID() + randomUUID(),
    async (m) => {
      messages.push(m);
    },
  );
  root = await mkdtemp('/tmp/fats-offers-');
  storage = new FilesystemDocumentStorage(root);
});
beforeEach(async () => {
  await services.pool.query('DELETE FROM "rateLimit"');
});
afterAll(async () => {
  for (const id of owners) {
    await services.pool.query('DELETE FROM offers WHERE user_id=$1', [id]);
    await services.pool.query(
      'DELETE FROM document_versions WHERE user_id=$1',
      [id],
    );
    await services.pool.query('DELETE FROM interviews WHERE user_id=$1', [id]);
    await services.pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  await services.pool.end();
  await rm(root, { recursive: true, force: true });
});
it('requires live verified sessions and same-origin requests, rejects stale-account and ownership input', async () => {
  expect((await request()).status).toBe(401);
  const a = await user(),
    b = await user(false);
  expect((await request(b.cookie)).status).toBe(403);
  expect(
    (await request(a.cookie, undefined, { 'x-fats-account': b.id })).status,
  ).toBe(409);
  expect(
    (await request(a.cookie, undefined, { origin: 'https://evil.test' }))
      .status,
  ).toBe(403);
  const body = {
    applicationId: a.application.id,
    requestId: randomUUID(),
    baseVersion: 0,
    command: termCommand(),
  };
  expect((await request(a.cookie, { ...body, owner: b.id })).status).toBe(400);
  expect(
    (await request(a.cookie, body, { origin: 'https://evil.test' })).status,
  ).toBe(403);
  expect((await request(a.cookie, body)).status).toBe(200);
  await services.pool.query(
    'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
    [a.id],
  );
  expect((await request(a.cookie, body)).status).toBe(401);
});
it('creates minimal and complete terms, preserves exact money and original history through revisions and notes', async () => {
  const a = await user(),
    app = a.application.id;
  await a.offers.command(
    app,
    randomUUID(),
    0,
    termCommand({ ...terms, salaryAmount: '', frequency: '', deadlineOn: '' }),
  );
  await a.offers.command(
    app,
    randomUUID(),
    1,
    termCommand({
      ...terms,
      salaryAmount: '99999999999999.9999',
      benefits: 'Meal allowance',
      employmentType: 'Probationary',
      arrangement: 'hybrid',
      location: 'Makati',
      startOn: '2026-11-02',
      notes: 'Ask about hours',
    }),
  );
  await a.offers.command(app, randomUUID(), 2, {
    kind: 'negotiation',
    occurredOn: '2026-10-18',
    notes: 'Requested PHP 40000 monthly',
  });
  await a.offers.command(app, randomUUID(), 3, {
    ...termCommand({ ...terms, salaryAmount: '38000.00' }),
    occurredOn: '2026-10-20',
  });
  const saved = (await a.offers.list())[0];
  expect(saved.events.map((e) => e.terms?.salaryAmount)).toEqual([
    '',
    '99999999999999.9999',
    undefined,
    '38000',
  ]);
  expect(saved.events[1].terms).toMatchObject({
    benefits: 'Meal allowance',
    notes: 'Ask about hours',
    startOn: '2026-11-02',
  });
  const exported = await a.workspace.exportBackup();
  expect(JSON.parse(exported).version).toBe(2);
  expect(JSON.parse(exported).data.offers[0].events).toHaveLength(4);
  expect(
    (await a.workspace.previewRestore(exported)).portable?.identical.offers,
  ).toBe(1);
  await expect(a.workspace.deleteApplication(app)).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    services.pool.query('UPDATE offer_events SET notes=$2 WHERE user_id=$1', [
      a.id,
      'overwrite',
    ]),
  ).rejects.toThrow('immutable');
});
it('persists review and HR questions, records confirmed decisions and corrections without changing applications or interviews', async () => {
  const a = await user(),
    app = a.application.id;
  const interview = await a.workspace.createInterview({
    applicationId: app,
    title: 'Final',
    stage: 'Final',
    scheduledAt: '2026-10-18T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.test/meet',
    location: '',
    preparationNotes: '',
    reflections: '',
  });
  await a.offers.command(app, randomUUID(), 0, termCommand());
  const checklist = OFFER_CHECKLIST.map((_, i) =>
    i === 0 ? 'Reviewed' : i === 1 ? 'Need to clarify' : 'Not reviewed',
  );
  await a.offers.command(app, randomUUID(), 1, {
    kind: 'review',
    occurredOn: '2026-10-17',
    checklist,
    questions: 'What are the working hours?',
  });
  await expect(
    a.offers.command(app, randomUUID(), 2, {
      kind: 'decision',
      occurredOn: '2026-10-17',
      notes: '',
      decision: 'accepted',
      confirmed: false,
    }),
  ).rejects.toThrow('Confirm');
  await a.offers.command(app, randomUUID(), 2, {
    kind: 'decision',
    occurredOn: '2026-10-17',
    notes: 'Confirmed by email',
    decision: 'accepted',
    confirmed: true,
  });
  await expect(
    a.offers.command(app, randomUUID(), 3, termCommand()),
  ).rejects.toMatchObject({ status: 409 });
  for (const [index, decision] of [
    'reviewing',
    'declined',
    'withdrawn',
  ].entries())
    await a.offers.command(app, randomUUID(), 3 + index, {
      kind: 'decision',
      occurredOn: '2026-10-18',
      notes: 'Corrected record',
      decision,
      confirmed: true,
    });
  const saved = (await a.offers.list())[0];
  expect(saved).toMatchObject({
    state: 'withdrawn',
    checklist,
    questions: 'What are the working hours?',
  });
  expect(
    saved.events.filter((e) => e.kind === 'decision').map((e) => e.decision),
  ).toEqual(['accepted', 'reviewing', 'declined', 'withdrawn']);
  const workspace = await a.workspace.getWorkspace();
  expect(workspace.applications[0]).toEqual(a.application);
  expect(workspace.interviews[0]).toEqual(interview);
});
it('deduplicates retries, rejects changed request IDs and serializes concurrent edits with stale-version feedback', async () => {
  const a = await user(),
    app = a.application.id,
    id = randomUUID();
  await Promise.all([
    a.offers.command(app, id, 0, termCommand()),
    a.offers.command(app, id, 0, termCommand()),
  ]);
  expect((await a.offers.list())[0].events).toHaveLength(1);
  await expect(
    a.offers.command(app, id, 0, termCommand({ ...terms, salaryAmount: '2' })),
  ).rejects.toMatchObject({ status: 409 });
  const result = await Promise.allSettled([
    a.offers.command(app, randomUUID(), 1, {
      kind: 'negotiation',
      occurredOn: '2026-10-18',
      notes: 'First tab',
    }),
    a.offers.command(
      app,
      randomUUID(),
      1,
      termCommand({ ...terms, salaryAmount: '38000' }),
    ),
  ]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(result.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { status: 409 },
  });
  expect((await a.offers.list())[0].version).toBe(2);
  await expect(
    a.offers.command(app, randomUUID(), 0, termCommand()),
  ).rejects.toMatchObject({ status: 409 });
});
it('links exact owned versions without copying bytes, preserves archived historical links and prevents referenced deletion', async () => {
  const a = await user(),
    b = await user(),
    app = a.application.id;
  await expect(
    services.pool.query(
      "INSERT INTO offers(user_id,application_id,version,state,checklist) VALUES($1,$2,1,'reviewing',$3)",
      [b.id, app, JSON.stringify(OFFER_CHECKLIST.map(() => 'Not reviewed'))],
    ),
  ).rejects.toMatchObject({ code: '23503' });
  const first = await a.documents.upload(
    await pdfFixture('Offer 1'),
    'offer.pdf',
    {
      requestId: randomUUID(),
      name: 'Offer letter',
      category: 'Other application documents',
    },
  );
  await expect(
    b.offers.command(
      b.application.id,
      randomUUID(),
      0,
      termCommand({ ...terms, documentVersionId: first.versionId }),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    b.offers.command(app, randomUUID(), 0, termCommand()),
  ).rejects.toMatchObject({ status: 404 });
  await a.offers.command(
    app,
    randomUUID(),
    0,
    termCommand({ ...terms, documentVersionId: first.versionId }),
  );
  await a.documents.upload(await pdfFixture('Offer 2'), 'offer-v2.pdf', {
    requestId: randomUUID(),
    documentId: first.documentId,
  });
  expect((await a.offers.list())[0].events[0].terms?.documentVersionId).toBe(
    first.versionId,
  );
  expect(await b.offers.list()).toEqual([]);
  await expect(a.documents.delete(first.documentId)).rejects.toMatchObject({
    status: 409,
  });
  await a.documents.edit(first.documentId, {
    name: 'Archived letter',
    category: 'Other application documents',
    archived: true,
    isDefault: false,
  });
  expect(
    (await a.documents.download(first.versionId)).bytes.length,
  ).toBeGreaterThan(0);
  await a.offers.command(
    app,
    randomUUID(),
    1,
    termCommand({ ...terms, documentVersionId: '' }),
  );
  await expect(a.documents.delete(first.documentId)).rejects.toThrow(
    'offer history',
  );
  await expect(
    services.pool.query(
      "INSERT INTO offer_events(user_id,application_id,sequence,request_id,fingerprint,kind,occurred_on,notes,terms,version_id) VALUES($1,$2,3,$3,'x','terms','2026-10-16','',$4,$5)",
      [
        a.id,
        app,
        randomUUID(),
        JSON.stringify({ ...terms, documentVersionId: randomUUID() }),
        first.versionId,
      ],
    ),
  ).rejects.toMatchObject({ code: '23514' });
});
it('rejects invalid payloads and supports account cascade deletion with no orphan offers', async () => {
  const a = await user();
  for (const patch of [
    { receivedOn: '' },
    { salaryAmount: 35000 },
    { salaryAmount: '0.00001' },
    { deadlineOn: '2026-02-30' },
    { documentVersionId: randomUUID() },
  ]) {
    const response = await request(a.cookie, {
      applicationId: a.application.id,
      requestId: randomUUID(),
      baseVersion: 0,
      command: termCommand({ ...terms, ...patch } as OfferTerms),
    });
    expect([404, 422]).toContain(response.status);
  }
  expect(await a.offers.list()).toEqual([]);
  await a.offers.command(a.application.id, randomUUID(), 0, termCommand());
  await services.pool.query('DELETE FROM "user" WHERE id=$1', [a.id]);
  expect(await a.offers.list()).toEqual([]);
  expect(
    (
      await services.pool.query('SELECT 1 FROM offer_events WHERE user_id=$1', [
        a.id,
      ])
    ).rowCount,
  ).toBe(0);
});

it('rolls back a failed history append and permits the identical request to retry', async () => {
  const a = await user(),
    app = a.application.id,
    requestId = randomUUID();
  const trigger = 'offer_failure_' + randomUUID().replaceAll('-', '');
  const before = (
    await services.pool.query(
      'SELECT revision FROM workspaces WHERE user_id=$1',
      [a.id],
    )
  ).rows;
  await services.pool.query(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${a.id}'::uuid THEN RAISE EXCEPTION 'Synthetic history write failure'; END IF; RETURN NEW; END; $$`,
  );
  await services.pool.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  try {
    await expect(
      a.offers.command(app, requestId, 0, termCommand()),
    ).rejects.toMatchObject({ code: 'P0001' });
    expect(await a.offers.list()).toEqual([]);
    expect(
      (
        await services.pool.query(
          'SELECT revision FROM workspaces WHERE user_id=$1',
          [a.id],
        )
      ).rows,
    ).toEqual(before);
  } finally {
    await services.pool.query(`DROP TRIGGER ${trigger} ON offer_events`);
    await services.pool.query(`DROP FUNCTION ${trigger}()`);
  }
  await a.offers.command(app, requestId, 0, termCommand());
  expect((await a.offers.list())[0].version).toBe(1);
});

it('protects an offer created after restore preview, including the confirmation boundary', async () => {
  const a = await user(),
    backup = await a.workspace.exportBackup();
  const preview = await a.workspace.previewRestore(backup);
  await a.offers.command(a.application.id, randomUUID(), 0, termCommand());
  await expect(a.workspace.restoreBackup(preview.token)).rejects.toMatchObject({
    status: 409,
  });
  expect((await a.offers.list())[0].events).toHaveLength(1);
  expect((await a.workspace.getWorkspace()).applications).toHaveLength(1);
});

it('accepts validated multilingual optional fields within the bounded JSON request', async () => {
  const a = await user(),
    notes = '界'.repeat(5000);
  const response = await request(a.cookie, {
    applicationId: a.application.id,
    requestId: randomUUID(),
    baseVersion: 0,
    command: { ...termCommand({ ...terms, notes, benefits: notes }), notes },
  });
  expect(response.status).toBe(200);
  const saved = (await a.offers.list())[0];
  expect(saved.events[0].notes.length).toBe(5000);
  expect(saved.events[0].terms?.notes.length).toBe(5000);
});

async function offerHistory(
  owner: Awaited<ReturnType<typeof user>>,
  versionId = '',
) {
  for (const event of portableOfferFixture().data.offers[0].events) {
    const command = portableEventCommand(event);
    if (command.kind === 'terms' && event.documentReference)
      command.terms.documentVersionId = versionId;
    await owner.offers.command(
      owner.application.id,
      event.requestId,
      event.sequence - 1,
      command,
    );
  }
}
function workspaceRequest(
  cookie?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return handleWorkspace(
    new Request(origin + '/api/workspace', {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    services,
  );
}
it('exports and imports complete offer history additively, preserves file provenance without granting cross-user document access, and skips duplicates', async () => {
  const a = await user(),
    b = await user();
  const letter = await a.documents.upload(
    await pdfFixture('Portable offer letter'),
    'offer.pdf',
    {
      requestId: randomUUID(),
      name: 'Offer letter',
      category: 'Other application documents',
    },
  );
  await offerHistory(a, letter.versionId);
  const text = await a.workspace.exportBackup(),
    backup = parseBackup(text);
  expect(backup.version).toBe(2);
  if (backup.version !== 2) throw new Error('Expected version 2.');
  expect(text).not.toContain('storage_key');
  expect(text).not.toContain(a.id);
  expect(backup.data.offers[0].events[0]).toMatchObject({
    terms: { documentVersionId: '' },
    documentReference: letter.versionId,
  });
  const same = await a.workspace.previewRestore(text);
  expect(same.portable).toMatchObject({
    identical: { offers: 1 },
    unavailableDocuments: [],
    conflicts: [],
  });
  await a.workspace.restoreBackup(same.token);
  expect((await a.offers.list())[0].events[0].terms?.documentVersionId).toBe(
    letter.versionId,
  );
  const preview = await b.workspace.previewRestore(text);
  expect(preview.portable).toMatchObject({
    added: { applications: 1, offers: 1 },
    unavailableDocuments: [{ reference: letter.versionId }],
    conflicts: [],
  });
  expect(await b.offers.list()).toEqual([]);
  await b.workspace.restoreBackup(preview.token);
  expect((await b.workspace.getWorkspace()).applications).toHaveLength(2);
  const restored = (await b.offers.list())[0];
  expect(restored).toMatchObject({
    state: 'accepted',
    version: 5,
    questions: 'When does the day start?',
  });
  expect(restored.events[0]).toMatchObject({
    terms: { documentVersionId: '' },
    unavailableDocumentReference: letter.versionId,
  });
  await expect(b.documents.download(letter.versionId)).rejects.toMatchObject({
    status: 404,
  });
  const exported = parseBackup(await b.workspace.exportBackup());
  if (exported.version !== 2) throw new Error('Expected version 2.');
  expect(exported.data.offers).toEqual(backup.data.offers);
  const repeated = await b.workspace.previewRestore(text);
  expect(repeated.portable?.identical.offers).toBe(1);
  await b.workspace.restoreBackup(repeated.token);
  await b.workspace.restoreBackup(repeated.token);
  expect((await b.offers.list())[0].events).toHaveLength(5);
  await services.pool.query('DELETE FROM "user" WHERE id=$1', [b.id]);
  expect(await b.offers.list()).toEqual([]);
  expect(
    (
      await services.pool.query('SELECT 1 FROM offer_events WHERE user_id=$1', [
        b.id,
      ])
    ).rowCount,
  ).toBe(0);
});
it('blocks conflicting decisions and stale previews; an applied token never reapplies old history', async () => {
  const a = await user(),
    b = await user();
  await offerHistory(a);
  const text = await a.workspace.exportBackup(),
    preview = await b.workspace.previewRestore(text);
  await b.workspace.create({
    ...b.application,
    title: 'Keep this new application',
  });
  await expect(b.workspace.restoreBackup(preview.token)).rejects.toMatchObject({
    status: 409,
  });
  const fresh = await b.workspace.previewRestore(text);
  await b.workspace.restoreBackup(fresh.token);
  await b.offers.command(a.application.id, randomUUID(), 5, {
    kind: 'decision',
    occurredOn: '2026-10-22',
    notes: 'Corrected decision',
    decision: 'declined',
    confirmed: true,
  });
  await b.workspace.restoreBackup(fresh.token);
  expect((await b.offers.list())[0].state).toBe('declined');
  const conflict = await b.workspace.previewRestore(text);
  expect(conflict.portable?.conflicts).toHaveLength(1);
  await expect(b.workspace.restoreBackup(conflict.token)).rejects.toMatchObject(
    { status: 409 },
  );
  expect((await b.offers.list())[0].state).toBe('declined');
  const collision = parseBackup(text);
  if (collision.version !== 2) throw new Error('Expected version 2.');
  const collisionId = randomUUID();
  collision.data.applications[0].id = collisionId;
  collision.data.offers[0].applicationId = collisionId;
  const duplicateHistory = await b.workspace.previewRestore(
    serializeBackup(collision),
  );
  expect(duplicateHistory.portable?.conflicts[0]).toContain(
    'history identifier',
  );
  await expect(
    b.workspace.restoreBackup(duplicateHistory.token),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await b.workspace.getWorkspace()).applications.some(
      (app) => app.id === collisionId,
    ),
  ).toBe(false);
  const legacy = serializeBackup(
    createBackup({ applications: [], interviews: [] }, portableTimestamp),
  );
  await expect(b.workspace.previewRestore(legacy)).rejects.toThrow(
    'Offer Desk',
  );
});
it('enforces verified sessions, confirmation, owner-bound and expired restore tokens, and rejects unauthorized/malformed JSON records', async () => {
  const a = await user(),
    b = await user(),
    unverified = await user(false),
    text = serializeBackup(portableOfferFixture());
  const body = { action: 'preview-restore', text };
  expect((await workspaceRequest(undefined, body)).status).toBe(401);
  expect((await workspaceRequest(unverified.cookie, body)).status).toBe(403);
  expect(
    (await workspaceRequest(a.cookie, body, { origin: 'https://evil.test' }))
      .status,
  ).toBe(403);
  expect(
    (await workspaceRequest(a.cookie, body, { 'x-fats-account': b.id })).status,
  ).toBe(409);
  expect(
    (
      await workspaceRequest(a.cookie, {
        action: 'preview-restore',
        text: '{bad',
      })
    ).status,
  ).toBe(400);
  const forged = portableOfferFixture() as unknown as Record<string, unknown>;
  forged.owner = b.id;
  expect(
    (
      await workspaceRequest(a.cookie, {
        action: 'preview-restore',
        text: JSON.stringify(forged),
      })
    ).status,
  ).toBe(400);
  const response = await workspaceRequest(a.cookie, body);
  expect(response.status).toBe(200);
  const preview = await response.json();
  expect(
    (
      await workspaceRequest(a.cookie, {
        action: 'restore',
        token: preview.token,
        confirmed: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await workspaceRequest(b.cookie, {
        action: 'restore',
        token: preview.token,
        confirmed: true,
      })
    ).status,
  ).toBe(404);
  await services.pool.query(
    'UPDATE workspace_stages SET "expiresAt"=now()-interval \'1 second\' WHERE token=$1',
    [preview.token],
  );
  expect(
    (
      await workspaceRequest(a.cookie, {
        action: 'restore',
        token: preview.token,
        confirmed: true,
      })
    ).status,
  ).toBe(409);
  expect(await a.offers.list()).toEqual([]);
});
it('rolls back every portable collection on an append failure and permits the original preview to retry', async () => {
  const a = await user(),
    before = await a.workspace.getWorkspace(),
    preview = await a.workspace.previewRestore(
      serializeBackup(portableOfferFixture()),
    );
  const trigger = 'portable_failure_' + randomUUID().replaceAll('-', '');
  await services.pool.query(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${a.id}'::uuid THEN RAISE EXCEPTION 'Synthetic portable write failure'; END IF; RETURN NEW; END; $$`,
  );
  await services.pool.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  try {
    await expect(
      a.workspace.restoreBackup(preview.token),
    ).rejects.toMatchObject({ code: 'P0001' });
    expect(await a.workspace.getWorkspace()).toEqual(before);
    expect(await a.offers.list()).toEqual([]);
  } finally {
    await services.pool.query(`DROP TRIGGER ${trigger} ON offer_events`);
    await services.pool.query(`DROP FUNCTION ${trigger}()`);
  }
  await a.workspace.restoreBackup(preview.token);
  expect((await a.offers.list())[0].events).toHaveLength(5);
});
