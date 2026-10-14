import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
  type KeyValueStorage,
} from '../../apps/web/src/lib/local-application-repository';

const input = {
  title: 'Graduate Analyst',
  company: 'Example Corp',
  sourceUrl: 'https://example.com/job',
  location: 'Quezon City',
  description: '',
};

function fixture() {
  const values = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  let id = 0;
  return {
    storage,
    values,
    repository: new LocalApplicationRepository(
      storage,
      () => `job-${++id}`,
      () => '2026-10-15T00:00:00.000Z',
    ),
  };
}

describe('local application repository', () => {
  it('starts empty, persists a creation, and can read it through a fresh adapter', async () => {
    const { storage, repository } = fixture();
    expect(await repository.list()).toEqual([]);
    const created = await repository.create(input);
    expect(created.status).toBe('Saved');
    expect(await new LocalApplicationRepository(storage).list()).toEqual([
      created,
    ]);
  });

  it('persists status and details updates without losing other applications', async () => {
    const { storage, repository } = fixture();
    const first = await repository.create(input);
    const second = await repository.create({
      ...input,
      company: 'Another Company',
    });
    const updated = await repository.update(first.id, {
      ...input,
      location: 'Remote',
      status: 'Interview',
    });
    expect(await new LocalApplicationRepository(storage).list()).toEqual([
      updated,
      second,
    ]);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.location).toBe('Remote');
  });

  it('reads the latest storage before writing, preserving jobs saved by another adapter', async () => {
    const { storage, repository } = fixture();
    const other = new LocalApplicationRepository(storage, () => 'other-job');
    await repository.list();
    await other.create(input);
    await repository.create(input);
    expect(await repository.list()).toHaveLength(2);
  });

  it('does not overwrite malformed data', async () => {
    const { values, repository } = fixture();
    values.set(APPLICATION_STORAGE_KEY, '{unreadable');
    await expect(repository.list()).rejects.toThrow('left untouched');
    await expect(repository.create(input)).rejects.toThrow('left untouched');
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe('{unreadable');
  });

  it('rejects unknown storage versions and unsafe stored URLs', async () => {
    const { values, repository } = fixture();
    values.set(
      APPLICATION_STORAGE_KEY,
      JSON.stringify({ version: 2, applications: [] }),
    );
    await expect(repository.list()).rejects.toThrow('left untouched');
    values.delete(APPLICATION_STORAGE_KEY);
    const application = await repository.create(input);
    values.set(
      APPLICATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        applications: [{ ...application, sourceUrl: 'javascript:alert(1)' }],
      }),
    );
    await expect(repository.list()).rejects.toThrow('left untouched');
  });

  it('rejects duplicate IDs in stored data', async () => {
    const { values, repository } = fixture();
    const application = await repository.create(input);
    values.set(
      APPLICATION_STORAGE_KEY,
      JSON.stringify({ version: 1, applications: [application, application] }),
    );
    await expect(repository.list()).rejects.toThrow('left untouched');
  });

  it('reports failed writes and preserves the previous persisted state', async () => {
    const { storage, repository } = fixture();
    const application = await repository.create(input);
    const failing = new LocalApplicationRepository({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    });
    await expect(
      failing.update(application.id, { ...input, status: 'Applied' }),
    ).rejects.toThrow('could not be saved');
    expect(await repository.list()).toEqual([application]);
  });

  it('reports blocked reads without treating them as an empty workspace', async () => {
    const repository = new LocalApplicationRepository({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    });
    await expect(repository.list()).rejects.toThrow(
      'cannot access browser storage',
    );
  });

  it('rejects an update for a missing job without modifying data', async () => {
    const { values, repository } = fixture();
    await expect(
      repository.update('missing', { ...input, status: 'Applied' }),
    ).rejects.toThrow('could not be found');
    expect(values.size).toBe(0);
  });
});
