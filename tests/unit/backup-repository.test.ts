import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup } from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
  type KeyValueStorage,
} from '../../apps/web/src/lib/local-application-repository';

const now = '2026-10-15T00:00:00.000Z';
const job = {
  title: 'Graduate Developer',
  company: 'Example',
  sourceUrl: 'https://example.com/job',
  location: 'Remote',
  description: '',
};
const empty = serializeBackup(
  createBackup({ applications: [], interviews: [] }, now),
);
function fixture() {
  const values = new Map<string, string>();
  const calls: string[] = [];
  let fail = false;
  let sequence = 0;
  const storage: KeyValueStorage = {
    getItem: (key) => {
      calls.push(`get:${key}`);
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      calls.push(`set:${key}`);
      if (fail) throw new Error('QuotaExceeded');
      values.set(key, value);
    },
  };
  const repository = new LocalApplicationRepository(
    storage,
    () => `id-${++sequence}`,
    () => now,
  );
  return {
    repository,
    values,
    calls,
    storage,
    failWrites: (value: boolean) => {
      fail = value;
    },
  };
}
async function populate(repository: LocalApplicationRepository) {
  const application = await repository.create(job);
  const interview = await repository.createInterview({
    applicationId: application.id,
    title: 'Conversation',
    stage: 'HR',
    scheduledAt: '2030-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.com/meeting',
    location: '',
    preparationNotes: 'Prepare',
    reflections: 'Reflect',
  });
  await repository.updateInterview(interview.id, {
    ...interview,
    status: 'completed',
  });
  const second = await repository.createInterview({
    ...interview,
    title: 'Another conversation',
  });
  await repository.updateInterview(second.id, {
    ...second,
    status: 'cancelled',
  });
}

describe('atomic local backup recovery', () => {
  it('exports one FATS-only snapshot and restores a full roundtrip using one write', async () => {
    const { repository, values, calls, storage } = fixture();
    await populate(repository);
    values.set('unrelated-browser-key', 'private unrelated data');
    calls.length = 0;
    const text = await repository.exportBackup();
    expect(calls).toEqual([`get:${APPLICATION_STORAGE_KEY}`]);
    expect(text).not.toContain('private unrelated data');
    const original = JSON.parse(text).data;
    const emptyPreview = await repository.previewRestore(empty);
    await repository.restoreBackup(emptyPreview.token);
    const preview = await repository.previewRestore(text);
    expect(preview.current).toEqual({ applications: 0, interviews: 0 });
    expect(preview.incoming).toEqual({ applications: 1, interviews: 2 });
    calls.length = 0;
    expect(await repository.restoreBackup(preview.token)).toEqual(original);
    expect(calls).toEqual([
      `get:${APPLICATION_STORAGE_KEY}`,
      `set:${APPLICATION_STORAGE_KEY}`,
    ]);
    const fresh = new LocalApplicationRepository(storage);
    expect(await fresh.list()).toEqual(original.applications);
    expect(await fresh.listInterviews()).toEqual(original.interviews);
    expect(values.get('unrelated-browser-key')).toBe('private unrelated data');
  });
  it('cancellation and invalid backups never write', async () => {
    const { repository, values, calls } = fixture();
    await populate(repository);
    const before = values.get(APPLICATION_STORAGE_KEY);
    calls.length = 0;
    await expect(repository.previewRestore('{bad')).rejects.toThrow('JSON');
    const preview = await repository.previewRestore(empty);
    repository.cancelRestore(preview.token);
    await expect(repository.restoreBackup(preview.token)).rejects.toThrow(
      'Preview',
    );
    expect(calls.filter((c) => c.startsWith('set:'))).toEqual([]);
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(before);
  });
  it('preserves saved data on failed writes and allows retry of the same validated preview', async () => {
    const { repository, values, failWrites } = fixture();
    await populate(repository);
    const before = values.get(APPLICATION_STORAGE_KEY);
    const preview = await repository.previewRestore(empty);
    failWrites(true);
    await expect(repository.restoreBackup(preview.token)).rejects.toThrow(
      'could not be saved',
    );
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(before);
    failWrites(false);
    await repository.restoreBackup(preview.token);
    expect(await repository.list()).toEqual([]);
  });
  it('rejects changes after preview, including changes from another adapter', async () => {
    const { repository, values, storage } = fixture();
    await populate(repository);
    const preview = await repository.previewRestore(empty);
    const other = new LocalApplicationRepository(
      storage,
      () => 'other',
      () => now,
    );
    await other.create(job);
    const latest = values.get(APPLICATION_STORAGE_KEY);
    await expect(repository.restoreBackup(preview.token)).rejects.toThrow(
      'changed since',
    );
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(latest);
  });
  it('leaves corrupt storage untouched until a valid backup is previewed and explicitly restored', async () => {
    const { repository, values, failWrites } = fixture();
    values.set(APPLICATION_STORAGE_KEY, '{unreadable');
    await expect(repository.exportBackup()).rejects.toThrow('left untouched');
    await expect(repository.previewRestore('{bad')).rejects.toThrow('JSON');
    const preview = await repository.previewRestore(empty);
    expect(preview.current).toBeNull();
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe('{unreadable');
    failWrites(true);
    await expect(repository.restoreBackup(preview.token)).rejects.toThrow(
      'could not be saved',
    );
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe('{unreadable');
    failWrites(false);
    await repository.restoreBackup(preview.token);
    expect(await repository.list()).toEqual([]);
  });
  it('reads legacy storage without migration and never requires interviews in Phase 1 storage', async () => {
    const { repository, values } = fixture();
    const application = await repository.create(job);
    const legacy = JSON.stringify({ version: 1, applications: [application] });
    values.set(APPLICATION_STORAGE_KEY, legacy);
    const backup = JSON.parse(await repository.exportBackup());
    expect(backup.data).toEqual({
      applications: [application],
      interviews: [],
    });
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(legacy);
  });
  it('requires a live staged preview and reports blocked reads without writing', async () => {
    const { repository, storage } = fixture();
    const preview = await repository.previewRestore(empty);
    await expect(repository.restoreBackup('wrong-token')).rejects.toThrow(
      'Preview',
    );
    const fresh = new LocalApplicationRepository(storage);
    await expect(fresh.restoreBackup(preview.token)).rejects.toThrow('Preview');
    const blocked = new LocalApplicationRepository({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('Must not write');
      },
    });
    await expect(blocked.exportBackup()).rejects.toThrow('cannot access');
    await expect(blocked.previewRestore(empty)).rejects.toThrow(
      'cannot access',
    );
  });
});
