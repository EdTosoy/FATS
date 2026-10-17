import { it, expect } from 'vitest';
import {
  emptyEmployment,
  emptyEmploymentDocument,
  EMPLOYMENT_DOCUMENT_CATEGORIES,
  EMPLOYMENT_DOCUMENT_STATES,
  normalizeEmployment,
  normalizeEmploymentDocument,
  employmentDocuments,
  createBackup,
  createCareerBackup,
  parseBackup,
  serializeBackup,
  planCareerRestore,
  portableEmployments,
  type CareerWorkspaceBackup,
} from '@fats/domain';
import { careerFixture } from '../helpers/career-fixture';
import {
  portableOfferFixture,
  portableTimestamp,
} from '../helpers/portable-offer-fixture';
import { LocalApplicationRepository } from '../../apps/web/src/lib/local-application-repository';
const job = () => ({
  ...emptyEmployment(),
  employer: 'Synthetic Employer',
  title: 'Trainee',
});
it('keeps planned employment distinct and validates current/previous dates and optional facts', () => {
  expect(normalizeEmployment(job()).status).toBe('Not started');
  expect(() => normalizeEmployment({ ...job(), status: 'Current' })).toThrow(
    'start date',
  );
  expect(
    normalizeEmployment({
      ...job(),
      status: 'Current',
      startOn: '2025-03-01',
      notes: ' Notes ',
    }),
  ).toMatchObject({ notes: 'Notes', endOn: '' });
  expect(
    normalizeEmployment({
      ...job(),
      status: 'Previous',
      startOn: '2025-03-01',
      endOn: '2025-09-01',
    }).status,
  ).toBe('Previous');
  for (const change of [
    { employer: '' },
    { title: '' },
    { employmentType: 'Payroll' },
    { status: 'Started' },
    { status: 'Previous', startOn: '2025-09-01', endOn: '2025-03-01' },
    { startOn: '2025-02-30' },
    { endOn: '2025-09-01' },
    { fromAcceptedOffer: true },
    { owner: 'synthetic' },
    { notes: 'x'.repeat(2001) },
  ])
    expect(() => normalizeEmployment({ ...job(), ...change })).toThrow();
});
it('supports all register categories/states without a file and rejects invalid tax years, links and ownership', () => {
  for (const category of EMPLOYMENT_DOCUMENT_CATEGORIES)
    for (const status of EMPLOYMENT_DOCUMENT_STATES)
      expect(
        normalizeEmploymentDocument({
          ...emptyEmploymentDocument(),
          category,
          status,
        }).documentVersionId,
      ).toBe('');
  expect(
    normalizeEmploymentDocument({
      ...emptyEmploymentDocument(),
      category: 'BIR Form 2316',
      taxYear: '2025',
    }).taxYear,
  ).toBe('2025');
  for (const change of [
    { taxYear: '2025' },
    { category: 'BIR Form 2316', taxYear: '25' },
    { issuedOn: '2025-02-30' },
    { documentVersionId: 'not-a-version' },
    { userId: 'other' },
    { status: 'Scanned' },
    { storage_key: 'private' },
  ])
    expect(() =>
      normalizeEmploymentDocument({ ...emptyEmploymentDocument(), ...change }),
    ).toThrow();
});
it('derives the latest register status while retaining every prior snapshot and unlinked provenance', () => {
  const record = careerFixture().data.employments[0],
    documents = employmentDocuments(record);
  expect(documents).toHaveLength(1);
  expect(documents[0].details.status).toBe('Received');
  expect(documents[0].history).toHaveLength(2);
  expect(documents[0].details.documentVersionId).toBe('');
  expect(documents[0].documentReference).toBeTruthy();
});
it('round trips version 3 without changing legacy version 1/2 formats', () => {
  const backup = careerFixture();
  expect(parseBackup(serializeBackup(backup))).toEqual(backup);
  expect(parseBackup(serializeBackup(portableOfferFixture())).version).toBe(2);
  expect(
    parseBackup(
      serializeBackup(
        createBackup({ applications: [], interviews: [] }, portableTimestamp),
      ),
    ).version,
  ).toBe(1);
  expect(serializeBackup(backup)).not.toMatch(
    /user_id|storage_key|scan_engine|password/,
  );
});
it('never turns exported file IDs into live document links', () => {
  const record = structuredClone(careerFixture().data.employments[0]);
  const event = record.events[2];
  if (event.kind !== 'document') throw Error();
  event.details.documentVersionId = event.documentReference!;
  event.documentReference = null;
  const portable = portableEmployments([record]);
  expect(portable[0].events[2]).toMatchObject({
    details: { documentVersionId: '' },
    documentReference: expect.any(String),
  });
  expect(record.events[2]).toMatchObject({
    details: { documentVersionId: expect.any(String) },
    documentReference: null,
  });
});
it('rejects corrupted history, forged active file links, missing parents and embedded ownership', () => {
  const changes: ((backup: CareerWorkspaceBackup) => void)[] = [
    (backup) => Object.assign(backup, { user_id: 'other' }),
    (backup) => Object.assign(backup.data.employments[0], { owner: 'other' }),
    (backup) => {
      backup.data.employments[0].events[1].sequence = 99;
    },
    (backup) => {
      backup.data.employments[0].version = 2;
    },
    (backup) => {
      backup.data.employments[0].createdAt = 'invalid';
    },
    (backup) => {
      backup.data.employments[0].details.title = 'Changed without history';
    },
    (backup) => {
      backup.data.employments[0].events[2].requestId =
        backup.data.employments[0].events[1].requestId;
    },
    (backup) => {
      const event = backup.data.employments[0].events[2];
      if (event.kind === 'document')
        event.details.documentVersionId = event.documentReference!;
    },
    (backup) => {
      backup.data.applications = [];
    },
    (backup) => {
      backup.data.offers = [];
    },
    (backup) => {
      backup.data.employments[0].events[1].documentReference = 'invalid';
    },
  ];
  for (const change of changes) {
    const backup = careerFixture();
    change(backup);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  }
});
it('previews additions, skips identical careers and blocks conflicting history without merging', () => {
  const incoming = careerFixture().data,
    empty = { applications: [], interviews: [], offers: [], employments: [] };
  expect(planCareerRestore(incoming, empty).summary.career).toMatchObject({
    added: 1,
    documents: 1,
    unavailableDocuments: 1,
  });
  expect(planCareerRestore(incoming, incoming).summary).toMatchObject({
    conflicts: [],
    career: { added: 0, identical: 1 },
  });
  const current = structuredClone(incoming);
  const event = current.employments[0].events[2];
  if (event.kind === 'document') event.details.notes = 'A different saved copy';
  expect(planCareerRestore(incoming, current).summary.conflicts).toHaveLength(
    1,
  );
  const renamed = structuredClone(incoming);
  renamed.employments[0].id = '30000000-0000-4000-8000-000000000002';
  expect(
    planCareerRestore(renamed, incoming).summary.conflicts.length,
  ).toBeGreaterThan(0);
});
it('bounds counts and refuses duplicate jobs or document IDs spanning employers', () => {
  const backup = careerFixture(),
    record = backup.data.employments[0];
  expect(() =>
    createCareerBackup(
      { ...backup.data, employments: Array(51).fill(record) },
      portableTimestamp,
    ),
  ).toThrow('50');
  const many = structuredClone(backup);
  many.data.employments[0].events = Array(101).fill(record.events[0]);
  many.data.employments[0].version = 101;
  expect(() => parseBackup(JSON.stringify(many))).toThrow('100');
  const duplicate = structuredClone(record);
  duplicate.id = '30000000-0000-4000-8000-000000000002';
  expect(() =>
    createCareerBackup(
      { ...backup.data, employments: [record, duplicate] },
      portableTimestamp,
    ),
  ).toThrow();
});
it('rejects version 3 guest import without writing or silently dropping employment records', async () => {
  const writes: string[] = [];
  const local = new LocalApplicationRepository({
    getItem: () => null,
    setItem: (_, value) => writes.push(value),
  });
  await expect(
    local.previewRestore(serializeBackup(careerFixture())),
  ).rejects.toThrow('verified account');
  expect(writes).toEqual([]);
});
