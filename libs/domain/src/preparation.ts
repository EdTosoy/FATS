import type { JobApplication } from './application';
import { isIsoInstant } from './interview';

export const PREPARATION_KINDS = {
  'cover-letter': 'Cover letter',
  'screening-answer': 'Screening question and answer',
  introduction: 'Introduction / video script',
  portfolio: 'Portfolio project',
  'resume-notes': 'Resume reference notes',
} as const;
export type PreparationKind = keyof typeof PREPARATION_KINDS;
export interface PreparationContent {
  kind: PreparationKind;
  title: string;
  text: string;
  url: string;
}
export interface PreparationInput extends PreparationContent {
  state: 'draft' | 'ready';
}
export interface Preparation extends PreparationContent {
  id: string;
  state: 'draft' | 'ready' | 'submitted';
  createdAt: string;
  updatedAt: string;
  submitted?: PreparationContent & { submittedAt: string };
}
export type PreparationChange =
  | {
      action: 'save';
      id: string;
      input: PreparationInput;
      expected: Preparation | null;
    }
  | { action: 'submit' | 'delete'; id: string; expected: Preparation }
  | { action: 'notes'; text: string; expected: string };
export interface PreparationRepository {
  changePreparation(
    applicationId: string,
    change: PreparationChange,
  ): Promise<JobApplication>;
}
export class PreparationError extends Error {}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PreparationError('Preparation data must be an object.');
  return value as Record<string, unknown>;
}
function text(
  row: Record<string, unknown>,
  field: string,
  max: number,
): string {
  if (typeof row[field] !== 'string' || row[field].length > max)
    throw new PreparationError(
      `${field} must be text of ${max.toLocaleString('en-US')} characters or fewer.`,
    );
  return row[field] as string;
}
function content(value: unknown): PreparationContent {
  const row = record(value);
  if (
    typeof row.kind !== 'string' ||
    !Object.hasOwn(PREPARATION_KINDS, row.kind)
  )
    throw new PreparationError('Choose a valid preparation type.');
  const title = text(row, 'title', 300).trim(),
    body = text(row, 'text', 20000),
    url = text(row, 'url', 2048).trim();
  if (!title)
    throw new PreparationError(
      'Give this material a title or screening question.',
    );
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new PreparationError(
        'Use a complete http:// or https:// portfolio URL.',
      );
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new PreparationError(
        'Use an http:// or https:// portfolio URL without embedded credentials.',
      );
    if (row.kind !== 'portfolio')
      throw new PreparationError(
        'Only portfolio entries have a project URL. Put other reference information in the text.',
      );
  }
  return { kind: row.kind as PreparationKind, title, text: body, url };
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new PreparationError('Choose a valid preparation identifier.');
  return value;
}
function meaningful(value: PreparationContent) {
  return !!(value.text.trim() || value.url);
}
export function validatePreparations(value: unknown): Preparation[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new PreparationError(
      'Keep at most 100 preparation materials per application.',
    );
  const entries = value.map((item) => {
    const row = record(item),
      body = content(row);
    if (
      !['draft', 'ready', 'submitted'].includes(row.state as string) ||
      !isIsoInstant(row.createdAt) ||
      !isIsoInstant(row.updatedAt) ||
      (row.createdAt as string) > (row.updatedAt as string)
    )
      throw new PreparationError(
        'Preparation state or timestamps are invalid.',
      );
    let submitted: Preparation['submitted'];
    if (row.submitted !== undefined) {
      const saved = record(row.submitted),
        savedContent = content(saved);
      if (
        !isIsoInstant(saved.submittedAt) ||
        !meaningful(savedContent) ||
        (saved.submittedAt as string) < (row.createdAt as string) ||
        (saved.submittedAt as string) > (row.updatedAt as string)
      )
        throw new PreparationError(
          'The submitted copy or its timestamp is invalid.',
        );
      submitted = { ...savedContent, submittedAt: saved.submittedAt as string };
    }
    if (
      (row.state === 'ready' || row.state === 'submitted') &&
      !meaningful(body)
    )
      throw new PreparationError(
        'Add text or a project URL before marking this material ready or submitted.',
      );
    if (
      row.state === 'submitted' &&
      (!submitted ||
        JSON.stringify(content(submitted)) !== JSON.stringify(body))
    )
      throw new PreparationError(
        'Submitted materials must match their recorded submitted copy. Save revisions as a draft or ready material.',
      );
    return {
      ...body,
      id: id(row.id),
      state: row.state as Preparation['state'],
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
      ...(submitted ? { submitted } : {}),
    };
  });
  if (new Set(entries.map((row) => row.id)).size !== entries.length)
    throw new PreparationError(
      'Preparation identifiers must be unique within the application.',
    );
  return entries;
}
export function changeApplicationPreparation(
  application: JobApplication,
  value: PreparationChange,
  now: string,
): JobApplication {
  const change = record(value);
  if (!isIsoInstant(now))
    throw new PreparationError('Preparation save time is invalid.');
  if (change.action === 'notes') {
    const next = text(change, 'text', 20000);
    if (
      typeof change.expected !== 'string' ||
      change.expected !== (application.notes ?? '')
    )
      throw new PreparationError(
        'These notes changed in another tab. Keep your text, reopen the saved notes, and review before saving again.',
      );
    return { ...application, notes: next, updatedAt: now };
  }
  if (!['save', 'submit', 'delete'].includes(change.action as string))
    throw new PreparationError('Choose a valid preparation action.');
  const entryId = id(change.id),
    entries = application.preparations ?? [],
    current = entries.find((row) => row.id === entryId);
  const expected =
    change.expected === null
      ? null
      : validatePreparations([change.expected])[0];
  if (JSON.stringify(expected) !== JSON.stringify(current ?? null))
    throw new PreparationError(
      'This material changed in another tab. Keep your draft, reopen the saved material, and review before saving again.',
    );
  let next: Preparation[];
  if (change.action === 'delete') {
    if (!current) throw new PreparationError('This material no longer exists.');
    next = entries.filter((row) => row.id !== entryId);
  } else if (change.action === 'submit') {
    if (!current)
      throw new PreparationError(
        'Save this material before recording a submitted copy.',
      );
    if (!meaningful(current))
      throw new PreparationError(
        'Add text or a project URL before recording a submitted copy.',
      );
    const submitted: Preparation = {
      ...current,
      state: 'submitted',
      updatedAt: now,
      submitted: { ...content(current), submittedAt: now },
    };
    next = entries.map((row) => (row.id === entryId ? submitted : row));
  } else {
    const input = record(change.input);
    if (!['draft', 'ready'].includes(input.state as string))
      throw new PreparationError(
        'Save edits as Draft or Ready. Record submission separately after sending the material yourself.',
      );
    const updated: Preparation = {
      ...content(input),
      id: entryId,
      state: input.state as 'draft' | 'ready',
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...(current?.submitted ? { submitted: current.submitted } : {}),
    };
    next = current
      ? entries.map((row) => (row.id === entryId ? updated : row))
      : [...entries, updated];
  }
  return {
    ...application,
    preparations: validatePreparations(next),
    updatedAt: now,
  };
}
