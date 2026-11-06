import { expect, it } from 'vitest';
import {
  parseBackup,
  createBackup,
  serializeBackup,
  type PreparationInput,
} from '@fats/domain';
import {
  LocalApplicationRepository,
  APPLICATION_STORAGE_KEY,
} from '../../apps/web/src/lib/local-application-repository';
const input: PreparationInput = {
  kind: 'cover-letter',
  title: 'Letter',
  text: 'My letter',
  url: '',
  state: 'ready',
};
function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw Error('Synthetic quota');
      values.set(key, value);
    },
  };
  return {
    values,
    storage,
    repository: new LocalApplicationRepository(storage),
    set fail(value: boolean) {
      fail = value;
    },
  };
}
const app = {
  title: 'Engineer',
  company: 'Example',
  sourceUrl: 'https://example.test/job',
  location: 'Cebu',
  description: '',
};
it('persists guest preparations, submitted copies and shared Notes through reload, export and restore', async () => {
  const f = fixture();
  const saved = await f.repository.create(app);
  const prepared = await f.repository.changePreparation(saved.id, {
    action: 'save',
    id: 'letter',
    input,
    expected: null,
  });
  const submitted = await f.repository.changePreparation(saved.id, {
    action: 'submit',
    id: 'letter',
    expected: prepared.preparations![0],
  });
  await f.repository.changePreparation(saved.id, {
    action: 'notes',
    text: 'General preparation',
    expected: '',
  });
  const loaded = (await new LocalApplicationRepository(f.storage).list())[0];
  expect(loaded.preparations).toEqual(submitted.preparations);
  expect(loaded.notes).toBe('General preparation');
  const backup = await f.repository.exportBackup();
  expect(parseBackup(backup).data.applications[0]).toEqual(loaded);
  const target = fixture();
  const preview = await target.repository.previewRestore(backup);
  expect(preview.incoming.preparations).toBe(1);
  await target.repository.restoreBackup(preview.token);
  expect((await target.repository.list())[0]).toEqual(loaded);
  const oldPreview = await f.repository.previewRestore(
    serializeBackup(
      createBackup(
        { applications: [saved], interviews: [] },
        new Date().toISOString(),
      ),
    ),
  );
  expect(oldPreview.current?.preparations).toBe(1);
  expect(oldPreview.incoming.preparations ?? 0).toBe(0);
});
it('preserves drafts and previous storage after failed writes, allowing retry and rejecting stale revisions', async () => {
  const f = fixture();
  const saved = await f.repository.create(app);
  const raw = f.values.get(APPLICATION_STORAGE_KEY);
  f.fail = true;
  const change = {
    action: 'save' as const,
    id: 'letter',
    input,
    expected: null,
  };
  await expect(
    f.repository.changePreparation(saved.id, change),
  ).rejects.toThrow('could not be saved');
  expect(f.values.get(APPLICATION_STORAGE_KEY)).toBe(raw);
  f.fail = false;
  const prepared = await f.repository.changePreparation(saved.id, change);
  await expect(
    f.repository.changePreparation(saved.id, change),
  ).rejects.toThrow('changed');
  await f.repository.update(saved.id, { ...saved, status: 'Applied' });
  expect((await f.repository.list())[0].preparations).toEqual(
    prepared.preparations,
  );
  await expect(
    f.repository.changePreparation('missing', change),
  ).rejects.toThrow('could not be found');
});
it('serializes simultaneous guest saves without dropping unrelated material entries', async () => {
  const f = fixture(),
    saved = await f.repository.create(app);
  await Promise.all(
    ['one', 'two'].map((id) =>
      f.repository.changePreparation(saved.id, {
        action: 'save',
        id,
        input,
        expected: null,
      }),
    ),
  );
  expect((await f.repository.list())[0].preparations).toHaveLength(2);
});
