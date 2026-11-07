import {
  APPLICATION_STATUSES,
  normalizeApplicationInput,
  type ApplicationInput,
  type ApplicationStatus,
  type JobApplication,
} from './application';
import { canonicalPostingUrl } from './capture';

export const MAX_CSV_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 1000;
export const CSV_FIELDS = {
  company: 'Company',
  title: 'Role / title',
  location: 'Location',
  sourceUrl: 'Job URL',
  salaryRange: 'Salary range',
  salaryMin: 'Minimum salary',
  salaryMax: 'Maximum salary',
  currency: 'Currency',
  paymentPeriod: 'Pay period',
  workArrangement: 'Work arrangement',
  seniority: 'Seniority',
  technologies: 'Technologies',
  qualifications: 'Required qualifications',
  postingDate: 'Posted date',
  lastCheckedDate: 'Last checked date',
  applicationDate: 'Applied date',
  applicationChannel: 'Application channel',
  status: 'Status',
  recruiterName: 'Contact name',
  recruiterEmail: 'Contact email',
  recruiterPhone: 'Contact phone',
  fitNotes: 'Personal-fit notes',
  description: 'Description',
  notes: 'Notes',
} as const;
export type CsvField = keyof typeof CSV_FIELDS;
export type CsvMapping = Partial<Record<CsvField, number>>;
export type CsvDateOrder = 'iso' | 'mdy' | 'dmy';
export interface CsvSource {
  text: string;
  mapping: CsvMapping;
  dateOrder: CsvDateOrder;
}
export interface CsvImportRow {
  row: number;
  values: Partial<Record<CsvField, string>>;
  input?: ApplicationInput & { status: ApplicationStatus };
  id?: string;
  errors: string[];
  warnings: string[];
  duplicate?: string;
  possibleDuplicate?: string;
}
export interface CsvPreview {
  token: string;
  rows: CsvImportRow[];
}
export interface CsvImportRequest extends CsvSource {
  token: string;
  selected: number[];
  confirmed: boolean;
}
export interface CsvImportSummary {
  imported: number;
  skipped: number;
}
export interface CsvImportRepository {
  previewCsv(source: CsvSource): Promise<CsvPreview>;
  importCsv(request: CsvImportRequest): Promise<CsvImportSummary>;
}
export class CsvImportError extends Error {}

export function parseCsv(text: string): {
  headers: string[];
  rows: string[][];
  rowNumbers: number[];
} {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES
  )
    throw new CsvImportError('Choose a UTF-8 CSV file of 1 MiB or less.');
  text = text.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/.test(text))
    throw new CsvImportError(
      'The file contains unsupported text. Export a UTF-8 CSV from your spreadsheet.',
    );
  const records: string[][] = [];
  const rowNumbers: number[] = [];
  let recordNumber = 0;
  let row: string[] = [],
    cell = '',
    state: 'plain' | 'quoted' | 'closed' = 'plain';
  function field() {
    if (cell.length > 20000)
      throw new CsvImportError('CSV cells must be 20,000 characters or fewer.');
    row.push(cell);
    cell = '';
    state = 'plain';
    if (row.length > 64)
      throw new CsvImportError('Use a CSV with at most 64 columns.');
  }
  function record() {
    field();
    recordNumber++;
    if (row.some((value) => value.trim())) {
      records.push(row);
      rowNumbers.push(recordNumber);
    }
    row = [];
    if (records.length > MAX_CSV_ROWS + 1)
      throw new CsvImportError('Use at most 1,000 data rows per CSV file.');
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = 'closed';
      } else cell += char;
    } else if (char === ',') field();
    else if (char === '\n' || char === '\r') {
      record();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (state === 'closed') {
      if (char !== ' ' && char !== '\t')
        throw new CsvImportError(
          'Unexpected text after a quoted CSV field. Export the sheet as CSV again.',
        );
    } else if (char === '"') {
      if (cell)
        throw new CsvImportError(
          'Quotes must surround the complete CSV field.',
        );
      state = 'quoted';
    } else cell += char;
  }
  if (state === 'quoted')
    throw new CsvImportError(
      'A quoted CSV field is not closed. Export the sheet as CSV again.',
    );
  if (cell || row.length || state === 'closed') record();
  if (records.length < 2)
    throw new CsvImportError('Include a header row and at least one data row.');
  const [headers, ...rows] = records;
  return {
    headers: headers.map((value) => value.trim()),
    rows,
    rowNumbers: rowNumbers.slice(1),
  };
}
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Partial<Record<CsvField, string[]>> = {
  company: ['employer', 'company name', 'organization'],
  title: ['role', 'job title', 'position', 'position title'],
  sourceUrl: [
    'url',
    'link',
    'job link',
    'posting url',
    'job posting url',
    'source url',
  ],
  location: ['city', 'job location'],
  salaryRange: ['salary', 'compensation', 'salary range'],
  salaryMin: ['min salary', 'salary from', 'salary min'],
  salaryMax: ['max salary', 'salary to', 'salary max'],
  paymentPeriod: ['salary period', 'payment period', 'frequency'],
  workArrangement: ['work setup', 'work mode', 'remote hybrid onsite'],
  technologies: ['tech stack', 'skills', 'technology'],
  qualifications: ['requirements', 'required qualifications'],
  postingDate: ['date posted', 'job posting date', 'posted'],
  lastCheckedDate: ['date checked', 'checked date', 'last checked'],
  applicationDate: ['date applied', 'applied', 'application date'],
  applicationChannel: ['channel', 'applied via', 'application source'],
  recruiterName: ['recruiter', 'contact', 'contacts', 'recruiter name'],
  recruiterEmail: ['email', 'recruiter email'],
  recruiterPhone: ['phone', 'recruiter phone'],
  fitNotes: ['fit', 'fit notes', 'personal fit assessment notes'],
  description: ['job description', 'jd'],
  notes: ['remarks', 'comments'],
  status: ['application status', 'stage'],
  seniority: ['level', 'experience level'],
};
export function suggestCsvMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {},
    used = new Set<number>();
  for (const field of Object.keys(CSV_FIELDS) as CsvField[]) {
    const names = [field, CSV_FIELDS[field], ...(aliases[field] ?? [])].map(
      key,
    );
    const index = headers.findIndex(
      (header, i) => !used.has(i) && names.includes(key(header)),
    );
    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  }
  if (
    mapping.salaryRange !== undefined &&
    (mapping.salaryMin !== undefined || mapping.salaryMax !== undefined)
  )
    delete mapping.salaryRange;
  return mapping;
}
function csvDate(value: string, order: CsvDateOrder): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (parts && order !== 'iso')
    return `${parts[3]}-${(order === 'mdy' ? parts[1] : parts[2]).padStart(2, '0')}-${(order === 'mdy' ? parts[2] : parts[1]).padStart(2, '0')}`;
  const words =
    value.match(/^(\d{1,2})[ -]([a-z]+)[ ,\-]+(\d{4})$/i) ??
    value
      .match(/^([a-z]+)[ ](\d{1,2}),?[ ](\d{4})$/i)
      ?.map((v, i, a) => (i === 1 ? a[2] : i === 2 ? a[1] : v));
  if (words) {
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const month =
      months.findIndex(
        (month) =>
          words[2].toLowerCase() === month ||
          words[2].toLowerCase() === month.slice(0, 3),
      ) + 1;
    if (month)
      return `${words[3]}-${String(month).padStart(2, '0')}-${words[1].padStart(2, '0')}`;
  }
  throw new CsvImportError(
    'Use YYYY-MM-DD or choose the matching month/day order for numeric dates.',
  );
}
function salary(value: string): number {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value))
    throw new CsvImportError(
      'Use a non-negative salary number, for example 25000 or 25,000.00; map currency separately.',
    );
  return Number(value.replaceAll(',', ''));
}
function csvStatus(value: string): ApplicationStatus {
  const normal = key(value);
  const extra: Record<string, ApplicationStatus> = {
    bookmarked: 'Saved',
    wishlist: 'Saved',
    toapply: 'Saved',
    notapplied: 'Saved',
    submitted: 'Applied',
    applicationsent: 'Applied',
    interviewing: 'Interview',
    interviewscheduled: 'Interview',
    test: 'Assessment',
    exam: 'Assessment',
    offered: 'Offer',
    offerreceived: 'Offer',
    unsuccessful: 'Rejected',
    notselected: 'Rejected',
    withdrawal: 'Withdrawn',
  };
  const status =
    APPLICATION_STATUSES.find((status) => key(status) === normal) ??
    (Object.hasOwn(extra, normal) ? extra[normal] : undefined);
  if (!status)
    throw new CsvImportError(
      'Unsupported status. Use Saved, Applied, Assessment, Interview, Offer, Rejected, or Withdrawn.',
    );
  return status;
}
export async function csvDigest(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function previewCsvRows(
  source: CsvSource,
  existing: JobApplication[],
): Promise<CsvImportRow[]> {
  if (!source || !['iso', 'mdy', 'dmy'].includes(source.dateOrder))
    throw new CsvImportError('Choose a valid date format.');
  const { headers, rows, rowNumbers } = parseCsv(source.text);
  if (
    !source.mapping ||
    typeof source.mapping !== 'object' ||
    Array.isArray(source.mapping)
  )
    throw new CsvImportError('Map the CSV columns before previewing.');
  const entries = Object.entries(source.mapping);
  if (
    entries.some(
      ([field, index]) =>
        !Object.hasOwn(CSV_FIELDS, field) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= headers.length,
    ) ||
    new Set(entries.map(([, index]) => index)).size !== entries.length
  )
    throw new CsvImportError(
      'Map each CSV column to at most one field using the available columns.',
    );
  if (
    source.mapping.salaryRange !== undefined &&
    (source.mapping.salaryMin !== undefined ||
      source.mapping.salaryMax !== undefined)
  )
    throw new CsvImportError(
      'Map either a salary range or separate minimum/maximum columns.',
    );
  const urls = new Map(
    existing.map((row) => [
      canonicalPostingUrl(row.sourceUrl),
      `existing application: ${row.title} at ${row.company}`,
    ]),
  );
  const pairs = new Map(
    existing.map((row) => [
      JSON.stringify([
        row.company.trim().toLowerCase(),
        row.title.trim().toLowerCase(),
      ]),
      `existing application: ${row.title} at ${row.company}`,
    ]),
  );
  const identities = new Set(existing.map((row) => row.id));
  const rawRows = new Map<string, number>();
  const result: CsvImportRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const values: CsvImportRow['values'] = {};
    for (const [field, column] of entries)
      values[field as CsvField] = (rows[index][column] ?? '').trim();
    const item: CsvImportRow = {
      row: rowNumbers[index],
      values,
      errors: [],
      warnings: [],
    };
    result.push(item);
    if (rows[index].length > headers.length)
      item.errors.push(
        'This row has more cells than the header. Check CSV quoting.',
      );
    const rawKey = JSON.stringify(rows[index]);
    if (rawRows.has(rawKey))
      item.duplicate = `Identical CSV row ${rawRows.get(rawKey)}.`;
    else rawRows.set(rawKey, item.row);
    const input: Record<string, string | number> = {
      title: values.title ?? '',
      company: values.company ?? '',
      location: values.location ?? '',
      sourceUrl: values.sourceUrl ?? '',
      description: values.description ?? '',
    };
    for (const [field, value] of Object.entries(values)) {
      if (
        !value ||
        ['salaryRange', 'salaryMin', 'salaryMax', 'status'].includes(field)
      )
        continue;
      try {
        if (field.endsWith('Date'))
          input[field] = csvDate(value, source.dateOrder);
        else if (field === 'workArrangement') {
          const arrangements: Record<string, string> = {
            remote: 'remote',
            wfh: 'remote',
            workfromhome: 'remote',
            hybrid: 'hybrid',
            onsite: 'onsite',
            office: 'onsite',
            inoffice: 'onsite',
          };
          if (!arrangements[key(value)])
            throw new CsvImportError('Use remote, hybrid, or onsite.');
          input[field] = arrangements[key(value)];
        } else if (field === 'paymentPeriod') {
          const periods: Record<string, string> = {
            hour: 'hour',
            hourly: 'hour',
            day: 'day',
            daily: 'day',
            week: 'week',
            weekly: 'week',
            month: 'month',
            monthly: 'month',
            year: 'year',
            yearly: 'year',
            annual: 'year',
            annually: 'year',
          };
          if (!periods[key(value)])
            throw new CsvImportError('Use hour, day, week, month, or year.');
          input[field] = periods[key(value)];
        } else input[field] = value;
      } catch (error) {
        item.errors.push(
          `${CSV_FIELDS[field as CsvField]}: ${(error as Error).message}`,
        );
      }
    }
    for (const field of ['salaryMin', 'salaryMax', 'salaryRange'] as const)
      if (values[field]) {
        try {
          if (field === 'salaryRange') {
            const parts = values[field]!.split(/\s*(?:–|—|\bto\b|-)\s*/i);
            if (parts.length > 2)
              throw new CsvImportError(
                'Use a single salary number or a minimum–maximum range.',
              );
            input.salaryMin = salary(parts[0]);
            if (parts.length === 2) input.salaryMax = salary(parts[1]);
          } else input[field] = salary(values[field]!);
        } catch (error) {
          item.errors.push(`${CSV_FIELDS[field]}: ${(error as Error).message}`);
        }
      }
    for (const field of ['company', 'title', 'location', 'sourceUrl'] as const)
      if (!input[field])
        item.errors.push(
          `${CSV_FIELDS[field]} is missing. Update the sheet or mapping.`,
        );
    if (!values.status)
      item.warnings.push(
        'No status supplied: imports as Saved. No applied date is inferred.',
      );
    if (
      (input.salaryMin !== undefined || input.salaryMax !== undefined) &&
      !input.currency
    )
      item.warnings.push('Salary currency is unspecified.');
    try {
      const status = values.status ? csvStatus(values.status) : 'Saved';
      const normalized = normalizeApplicationInput(
        input as unknown as ApplicationInput,
      );
      item.input = { ...normalized, status };
      item.id = `csv-${await csvDigest(item.input)}`;
      const url = canonicalPostingUrl(normalized.sourceUrl);
      const pair = JSON.stringify([
        normalized.company.toLowerCase(),
        normalized.title.toLowerCase(),
      ]);
      if (identities.has(item.id))
        item.duplicate = 'This record was already imported.';
      else if (urls.has(url))
        item.duplicate = `Posting URL matches ${urls.get(url)}.`;
      else if (pairs.has(pair))
        item.possibleDuplicate = `Company and title match ${pairs.get(pair)}. Review before including.`;
      if (!item.errors.length && !item.duplicate) {
        identities.add(item.id);
        urls.set(url, `CSV row ${item.row}`);
        pairs.set(pair, `CSV row ${item.row}`);
      }
    } catch (error) {
      item.errors.push((error as Error).message);
    }
  }
  return result;
}
export function selectCsvApplications(
  rows: CsvImportRow[],
  selected: number[],
  now: string,
): JobApplication[] {
  if (
    !Array.isArray(selected) ||
    selected.length > MAX_CSV_ROWS ||
    new Set(selected).size !== selected.length ||
    selected.some(
      (row) => !Number.isInteger(row) || !rows.some((item) => item.row === row),
    )
  )
    throw new CsvImportError('Choose valid, unique CSV rows from the preview.');
  return selected.map((number) => {
    const row = rows.find((row) => row.row === number)!;
    if (!row.input || !row.id || row.errors.length || row.duplicate)
      throw new CsvImportError(
        `CSV row ${number} cannot be imported. Review duplicates and errors.`,
      );
    return { ...row.input, id: row.id, createdAt: now, updatedAt: now };
  });
}
