import {
  isApplicationStatus,
  normalizeApplicationInput,
  type JobApplication,
} from './application';
import {
  INTERVIEW_STATUSES,
  isIsoInstant,
  normalizeInterviewInput,
  type Interview,
} from './interview';

export const BACKUP_FORMAT = 'fats-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export interface WorkspaceData {
  applications: JobApplication[];
  interviews: Interview[];
}
export interface WorkspaceBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: WorkspaceData;
}
export interface WorkspaceCounts {
  applications: number;
  interviews: number;
}
export interface RestorePreview {
  token: string;
  exportedAt: string;
  incoming: WorkspaceCounts;
  current: WorkspaceCounts | null;
}
export interface BackupRepository {
  exportBackup(): Promise<string>;
  previewRestore(text: string): Promise<RestorePreview>;
  restoreBackup(token: string): Promise<WorkspaceData>;
  cancelRestore(token: string): void;
}
export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BackupValidationError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function stringField(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== 'string')
    throw new BackupValidationError(`The ${key} field must be text.`);
  return row[key];
}
function identity(row: Record<string, unknown>) {
  const id = stringField(row, 'id');
  const createdAt = stringField(row, 'createdAt');
  const updatedAt = stringField(row, 'updatedAt');
  if (!id.trim() || !isIsoInstant(createdAt) || !isIsoInstant(updatedAt))
    throw new BackupValidationError(
      'Record identifiers or timestamps are invalid.',
    );
  return { id, createdAt, updatedAt };
}
function application(value: unknown): JobApplication {
  const row = record(value);
  const input = {
    title: stringField(row, 'title'),
    company: stringField(row, 'company'),
    sourceUrl: stringField(row, 'sourceUrl'),
    location: stringField(row, 'location'),
    description: stringField(row, 'description'),
  };
  normalizeApplicationInput(input);
  if (!isApplicationStatus(row.status))
    throw new BackupValidationError('Application status is invalid.');
  // Validate using creation rules, but preserve original text and timestamps.
  return { ...input, ...identity(row), status: row.status };
}
function interview(value: unknown): Interview {
  const row = record(value);
  const input = {
    applicationId: stringField(row, 'applicationId'),
    title: stringField(row, 'title'),
    stage: row.stage as Interview['stage'],
    scheduledAt: stringField(row, 'scheduledAt'),
    timeZone: stringField(row, 'timeZone'),
    meetingUrl: stringField(row, 'meetingUrl'),
    location: stringField(row, 'location'),
    preparationNotes: stringField(row, 'preparationNotes'),
    reflections: stringField(row, 'reflections'),
  };
  normalizeInterviewInput(input);
  if (!INTERVIEW_STATUSES.includes(row.status as Interview['status']))
    throw new BackupValidationError('Interview status is invalid.');
  return {
    ...input,
    ...identity(row),
    status: row.status as Interview['status'],
  };
}
export function validateWorkspaceData(value: unknown): WorkspaceData {
  const data = record(value);
  if (!Array.isArray(data.applications) || !Array.isArray(data.interviews))
    throw new BackupValidationError(
      'Applications and interviews must be arrays.',
    );
  const applications = data.applications.map(application);
  const interviews = data.interviews.map(interview);
  const ids = new Set(applications.map((row) => row.id));
  if (
    ids.size !== applications.length ||
    new Set(interviews.map((row) => row.id)).size !== interviews.length
  )
    throw new BackupValidationError(
      'Duplicate record identifiers are not allowed.',
    );
  if (interviews.some((row) => !ids.has(row.applicationId)))
    throw new BackupValidationError(
      'An interview refers to a missing parent application.',
    );
  return { applications, interviews };
}
export function workspaceCounts(data: WorkspaceData): WorkspaceCounts {
  return {
    applications: data.applications.length,
    interviews: data.interviews.length,
  };
}
export function createBackup(
  data: unknown,
  exportedAt: string,
): WorkspaceBackup {
  if (!isIsoInstant(exportedAt))
    throw new BackupValidationError('Backup timestamp is invalid.');
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: validateWorkspaceData(data),
  };
}
export function serializeBackup(backup: WorkspaceBackup): string {
  const text = JSON.stringify(
    createBackup(backup.data, backup.exportedAt),
    null,
    2,
  );
  checkSize(text);
  return text;
}
function checkSize(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new BackupValidationError('Choose a backup of 10 MiB or less.');
}
export function parseBackup(text: string): WorkspaceBackup {
  checkSize(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupValidationError(
      'This file is not valid JSON. Choose a FATS backup.',
    );
  }
  const row = record(value);
  if (row.format !== BACKUP_FORMAT)
    throw new BackupValidationError('This is not a FATS backup file.');
  // Future migrations belong at this version boundary, before domain validation.
  if (row.version !== BACKUP_VERSION)
    throw new BackupValidationError(
      'This backup version is not supported. Use a version 1 FATS backup.',
    );
  return createBackup(row.data, stringField(row, 'exportedAt'));
}
