import { expect, it } from 'vitest';
import {
  createBackup,
  parseBackup,
  serializeBackup,
  planPortableRestore,
} from '@fats/domain';
import {
  portableOfferFixture,
  portableTimestamp,
} from '../helpers/portable-offer-fixture';
import { LocalApplicationRepository } from '../../apps/web/src/lib/local-application-repository';
it('roundtrips complete immutable history, exact money, review snapshots, decisions, and unlinked letter provenance', () => {
  const backup = portableOfferFixture();
  expect(parseBackup(serializeBackup(backup))).toEqual(backup);
  expect(backup.data.offers[0].events.map((event) => event.sequence)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(backup.data.offers[0].events[0].terms?.salaryAmount).toBe(
    '35000.0001',
  );
  expect(
    parseBackup(
      serializeBackup(
        createBackup({ applications: [], interviews: [] }, portableTimestamp),
      ),
    ).version,
  ).toBe(1);
});
it('adds missing records, skips identical offers, and exposes changed decisions as conflicts', () => {
  const { data } = portableOfferFixture();
  const empty = { applications: [], interviews: [], offers: [] };
  expect(planPortableRestore(data, empty).summary).toMatchObject({
    added: { offers: 1, applications: 1 },
    unavailableDocuments: [{ sequence: 1 }],
  });
  expect(planPortableRestore(data, data).summary).toMatchObject({
    added: { offers: 0 },
    identical: { offers: 1 },
    conflicts: [],
    unavailableDocuments: [],
  });
  const changed = structuredClone(data);
  changed.offers[0].state = 'declined';
  expect(planPortableRestore(data, changed).summary).toMatchObject({
    identical: { offers: 0 },
    conflicts: [expect.any(String)],
  });
});
it('rejects duplicate offers, duplicate request IDs, missing parents, invalid sequences, live links and inconsistent decisions/reviews', () => {
  const changes: ((backup: ReturnType<typeof portableOfferFixture>) => void)[] =
    [
      (backup) => backup.data.offers.push(backup.data.offers[0]),
      (backup) => {
        backup.data.offers[0].applicationId = 'missing';
      },
      (backup) => {
        backup.data.offers[0].events.reverse();
      },
      (backup) => {
        backup.data.offers[0].events[1].requestId =
          backup.data.offers[0].events[0].requestId;
      },
      (backup) => {
        backup.data.offers[0].events[0].terms!.documentVersionId =
          '20000000-0000-4000-8000-000000000001';
      },
      (backup) => {
        backup.data.offers[0].state = 'declined';
      },
      (backup) => {
        backup.data.offers[0].questions = 'Silent overwrite';
      },
      (backup) => {
        backup.data.offers[0].events[3].review!.questions =
          '  When does the day start?  ';
      },
      (backup) => {
        backup.data.offers[0].events[0].recordedAt = 'yesterday';
      },
      (backup) => {
        backup.data.offers[0].events[0].terms!.salaryAmount = '0.00001';
      },
    ];
  for (const change of changes) {
    const backup = portableOfferFixture();
    change(backup);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  }
});
it('rejects embedded ownership and guest imports rather than dropping offer history', async () => {
  const backup = portableOfferFixture();
  expect(() =>
    parseBackup(JSON.stringify({ ...backup, user_id: 'untrusted' })),
  ).toThrow();
  expect(() =>
    parseBackup(
      JSON.stringify({
        ...backup,
        data: {
          ...backup.data,
          applications: [
            { ...backup.data.applications[0], userId: 'untrusted' },
          ],
        },
      }),
    ),
  ).toThrow();
  const writes: string[] = [];
  const local = new LocalApplicationRepository({
    getItem: () => null,
    setItem: (_, value) => writes.push(value),
  });
  await expect(local.previewRestore(serializeBackup(backup))).rejects.toThrow(
    'verified account',
  );
  expect(writes).toEqual([]);
});
