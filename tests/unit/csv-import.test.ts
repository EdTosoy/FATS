import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  suggestCsvMapping,
  previewCsvRows,
  selectCsvApplications,
  createApplication,
  createBackup,
  createPortableBackup,
  createCareerBackup,
  parseBackup,
  serializeBackup,
  MAX_CSV_BYTES,
  type CsvSource,
} from '@fats/domain';
const header =
  'Company,Job Title,Location,Job URL,Status,Salary,Currency,Date Applied,Notes';
const source = (rows: string, extra: Partial<CsvSource> = {}): CsvSource => {
  const text = `${header}\r\n${rows}`;
  return {
    text,
    mapping: suggestCsvMapping(parseCsv(text).headers),
    dateOrder: 'iso',
    ...extra,
  };
};
const line =
  'Acme,Engineer,Cebu,https://example.test/job,Submitted,"25,000–35,000",PHP,2026-11-06,"First line, with comma\nSecond line"';
const now = '2026-11-06T00:00:00.000Z';
describe('bounded CSV parser and mapping', () => {
  it('handles BOM, CRLF, quoted commas/newlines, escaped quotes, blank lines and empty/trailing cells', () => {
    expect(
      parseCsv(
        '\uFEFFCompany,Notes,Other\r\n\r\nAcme,"hello,\r\n""friend""",\r\n',
      ),
    ).toEqual({
      headers: ['Company', 'Notes', 'Other'],
      rows: [['Acme', 'hello,\r\n"friend"', '']],
      rowNumbers: [3],
    });
  });
  it.each([
    'A,B\na,"unfinished',
    'A,B\na,b"c',
    'A,B\na,"b"bad',
    'A,B\n',
    'A,B\na,\0',
    'A\n' + 'x'.repeat(20001),
    Array.from({ length: 65 }, () => 'a').join(',') + '\na',
    'A\n' + Array.from({ length: 1001 }, () => 'a').join('\n'),
    'A\n' + 'x'.repeat(MAX_CSV_BYTES),
  ])('rejects malformed/oversized CSV', (text) =>
    expect(() => parseCsv(text)).toThrow(),
  );
  it('suggests Google Sheets aliases, disambiguates repeated headers and permits skipping', () => {
    const mapping = suggestCsvMapping([
      'Employer',
      'Position',
      'Job Link',
      'Work Setup',
      'Date Applied',
      'Tech Stack',
      'Contact Email',
      'Remarks',
      'Company',
    ]);
    expect(mapping).toMatchObject({
      company: 0,
      title: 1,
      sourceUrl: 2,
      workArrangement: 3,
      applicationDate: 4,
      technologies: 5,
      recruiterEmail: 6,
      notes: 7,
    });
  });
  it('maps R1 details and preserves real status without fabricating history', async () => {
    const rows = await previewCsvRows(source(line), []);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].input).toMatchObject({
      company: 'Acme',
      title: 'Engineer',
      status: 'Applied',
      salaryMin: 25000,
      salaryMax: 35000,
      currency: 'PHP',
      applicationDate: '2026-11-06',
      notes: 'First line, with comma\nSecond line',
    });
    const [app] = selectCsvApplications(rows, [2], now);
    expect(app.activities).toBeUndefined();
    for (const backup of [
      createBackup({ applications: [app], interviews: [] }, now),
      createPortableBackup(
        { applications: [app], interviews: [], offers: [] },
        now,
      ),
      createCareerBackup(
        { applications: [app], interviews: [], offers: [], employments: [] },
        now,
      ),
    ])
      expect(parseBackup(serializeBackup(backup)).data.applications).toEqual([
        app,
      ]);
  });
  it('rejects missing required fields and unsupported values without inventing data', async () => {
    const rows = await previewCsvRows(
      source('Acme,,Cebu,https://example.test/job,Hired,25k,PHP,02/03/2026,'),
      [],
    );
    expect(rows[0].errors.join(' ')).toMatch(/missing/);
    expect(rows[0].errors.join(' ')).toMatch(/Unsupported status/);
    expect(rows[0].errors.join(' ')).toMatch(/salary/);
    expect(rows[0].errors.join(' ')).toMatch(/date/);
  });
  it.each(['constructor', 'toString', '__proto__'])(
    'rejects unsupported prototype-like status %s',
    async (status) => {
      const [row] = await previewCsvRows(
        source(`Acme,Engineer,Cebu,https://example.test/job,${status},,,,`),
        [],
      );
      expect(row.errors.join(' ')).toContain('Unsupported status');
    },
  );
  it('prefers separate salary bounds when both range and bounds have headers', () => {
    const mapping = suggestCsvMapping([
      'Company',
      'Salary',
      'Minimum salary',
      'Maximum salary',
    ]);
    expect(mapping).toMatchObject({ company: 0, salaryMin: 2, salaryMax: 3 });
    expect(mapping.salaryRange).toBeUndefined();
  });
  it('requires an explicit numeric date order and validates real calendar dates', async () => {
    const valid = source(
      'Acme,Engineer,Cebu,https://example.test/job,Applied,,,03/04/2026,',
    );
    expect((await previewCsvRows(valid, []))[0].errors.length).toBeGreaterThan(
      0,
    );
    expect(
      (await previewCsvRows({ ...valid, dateOrder: 'dmy' }, []))[0].input
        ?.applicationDate,
    ).toBe('2026-04-03');
    expect(
      (await previewCsvRows({ ...valid, dateOrder: 'mdy' }, []))[0].input
        ?.applicationDate,
    ).toBe('2026-03-04');
    expect(
      (
        await previewCsvRows(
          source(
            'Acme,Engineer,Cebu,https://example.test/job,Applied,,,2026-02-30,',
          ),
          [],
        )
      )[0].errors.length,
    ).toBeGreaterThan(0);
  });
  it('defaults only blank status to Saved, retains blanks, and maps text dates', async () => {
    const [row] = await previewCsvRows(
      source('Acme,Engineer,Cebu,https://example.test/job,,,,6 Nov 2026,'),
      [],
    );
    expect(row.input?.status).toBe('Saved');
    expect(row.warnings.length).toBe(1);
    expect(row.input?.applicationDate).toBe('2026-11-06');
    const [blank] = await previewCsvRows(
      source('Acme,Engineer,Cebu,https://example.test/job,Interview,,,,'),
      [],
    );
    expect(blank.input?.applicationDate).toBeUndefined();
  });
  it('rejects unknown, repeated or out-of-bounds mappings and conflicting salary mappings', async () => {
    for (const mapping of [
      { title: 99 },
      { title: 0, company: 0 },
      { salaryRange: 5, salaryMin: 6 },
      { unknown: 0 },
    ])
      await expect(
        previewCsvRows(source(line, { mapping }), []),
      ).rejects.toThrow();
  });
});
describe('CSV duplicate review', () => {
  it('detects exact rows, posting URL fragments, and company/title matches', async () => {
    const rows = await previewCsvRows(
      source(
        [
          line,
          line,
          line.replace('/job,', '/job#details,'),
          line.replace('/job,', '/other,'),
        ].join('\n'),
      ),
      [],
    );
    expect(rows[1].duplicate).toBeTruthy();
    expect(rows[2].duplicate).toMatch(/URL/);
    expect(rows[3].possibleDuplicate).toBeTruthy();
    expect(selectCsvApplications(rows, [2, 5], now)).toHaveLength(2);
    expect(() => selectCsvApplications(rows, [3], now)).toThrow();
  });
  it('prevents reimport even after the imported record has been edited', async () => {
    const rows = await previewCsvRows(source(line), []);
    const [app] = selectCsvApplications(rows, [2], now);
    const edited = {
      ...app,
      title: 'Changed',
      sourceUrl: 'https://example.test/changed',
    };
    expect((await previewCsvRows(source(line), [edited]))[0].duplicate).toMatch(
      /already imported/,
    );
  });
  it('flags existing records, validates selections, and never overwrites them', async () => {
    const existing = createApplication(
      {
        title: 'Engineer',
        company: 'Acme',
        location: 'Cebu',
        sourceUrl: 'https://example.test/other',
        description: '',
      },
      'old',
      now,
    );
    const rows = await previewCsvRows(source(line), [existing]);
    expect(rows[0].possibleDuplicate).toBeTruthy();
    for (const selected of [[2, 2], [999], [2.1]])
      expect(() => selectCsvApplications(rows, selected, now)).toThrow();
    expect(existing.status).toBe('Saved');
  });
});
