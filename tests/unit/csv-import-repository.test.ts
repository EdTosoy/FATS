import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  suggestCsvMapping,
  parseBackup,
  type CsvSource,
} from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
} from '../../apps/web/src/lib/local-application-repository';
const text =
  'Company,Title,Location,URL,Status,Technologies,Notes\nAcme,Engineer,Cebu,https://example.test/a,Applied,TypeScript,Imported note\nOther,Analyst,Manila,https://example.test/b,Saved,SQL,Other note';
const source: CsvSource = {
  text,
  mapping: suggestCsvMapping(parseCsv(text).headers),
  dateOrder: 'iso',
};
const app = {
  title: 'Existing',
  company: 'Original',
  location: 'Cebu',
  sourceUrl: 'https://example.test/original',
  description: '',
};
function fixture() {
  const values = new Map<string, string>();
  let writes = 0,
    fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('Synthetic quota');
      writes++;
      values.set(key, value);
    },
  };
  const repository = new LocalApplicationRepository(storage);
  return {
    repository,
    storage,
    values,
    get writes() {
      return writes;
    },
    set fail(value: boolean) {
      fail = value;
    },
  };
}
describe('atomic guest CSV import', () => {
  it('previews without writes, preserves existing records, imports once and exports R1 fields', async () => {
    const f = fixture();
    const existing = await f.repository.create(app);
    const raw = f.values.get(APPLICATION_STORAGE_KEY);
    const preview = await f.repository.previewCsv(source);
    expect(f.values.get(APPLICATION_STORAGE_KEY)).toBe(raw);
    expect(f.writes).toBe(1);
    const result = await f.repository.importCsv({
      ...source,
      token: preview.token,
      selected: [2, 3],
      confirmed: true,
    });
    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(f.writes).toBe(2);
    const all = await new LocalApplicationRepository(f.storage).list();
    expect(all).toContainEqual(existing);
    expect(all.find((row) => row.company === 'Acme')).toMatchObject({
      status: 'Applied',
      technologies: 'TypeScript',
      notes: 'Imported note',
    });
    expect(
      all.find((row) => row.company === 'Acme')?.activities,
    ).toBeUndefined();
    expect(
      parseBackup(await f.repository.exportBackup()).data.applications,
    ).toHaveLength(3);
    const again = await f.repository.previewCsv(source);
    expect(again.rows.every((row) => row.duplicate)).toBe(true);
    await expect(
      f.repository.importCsv({
        ...source,
        token: again.token,
        selected: [2],
        confirmed: true,
      }),
    ).rejects.toThrow('cannot be imported');
    expect(await f.repository.list()).toHaveLength(3);
  });
  it('requires confirmation and rejects stale previews and changed CSV/mapping without writes', async () => {
    const f = fixture();
    const preview = await f.repository.previewCsv(source);
    await expect(
      f.repository.importCsv({
        ...source,
        token: preview.token,
        selected: [2],
        confirmed: false,
      }),
    ).rejects.toThrow('Confirm');
    await expect(
      f.repository.importCsv({
        ...source,
        text: source.text + '\n',
        token: preview.token,
        selected: [2],
        confirmed: true,
      }),
    ).rejects.toThrow('changed');
    await f.repository.create(app);
    const raw = f.values.get(APPLICATION_STORAGE_KEY);
    await expect(
      f.repository.importCsv({
        ...source,
        token: preview.token,
        selected: [2],
        confirmed: true,
      }),
    ).rejects.toThrow('changed');
    expect(f.values.get(APPLICATION_STORAGE_KEY)).toBe(raw);
  });
  it('keeps saved data and the reviewed request available after write failure, with a single atomic retry', async () => {
    const f = fixture();
    await f.repository.create(app);
    const raw = f.values.get(APPLICATION_STORAGE_KEY);
    const preview = await f.repository.previewCsv(source);
    const request = {
      ...source,
      token: preview.token,
      selected: [2, 3],
      confirmed: true,
    };
    f.fail = true;
    await expect(f.repository.importCsv(request)).rejects.toThrow(
      'could not be saved',
    );
    expect(f.values.get(APPLICATION_STORAGE_KEY)).toBe(raw);
    f.fail = false;
    await expect(f.repository.importCsv(request)).resolves.toEqual({
      imported: 2,
      skipped: 0,
    });
    expect(f.writes).toBe(2);
  });
  it('rejects all selected rows atomically if any row is invalid, preserving corrupt storage', async () => {
    const f = fixture();
    const invalid = {
      ...source,
      text: source.text.replace(
        'https://example.test/b',
        'javascript:alert(1)',
      ),
    };
    const preview = await f.repository.previewCsv(invalid);
    await expect(
      f.repository.importCsv({
        ...invalid,
        token: preview.token,
        selected: [2, 3],
        confirmed: true,
      }),
    ).rejects.toThrow('cannot');
    expect(f.writes).toBe(0);
    f.values.set(APPLICATION_STORAGE_KEY, 'broken');
    await expect(f.repository.previewCsv(source)).rejects.toThrow(
      'left untouched',
    );
    expect(f.values.get(APPLICATION_STORAGE_KEY)).toBe('broken');
  });
});
