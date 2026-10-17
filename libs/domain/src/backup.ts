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
import {
  validatePortableOffers,
  type PortableWorkspaceData,
  type PortableRestoreSummary,
} from './offer-backup';
import {
  validatePortableEmployments,
  type CareerWorkspaceData,
} from './career-backup';

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
export interface PortableWorkspaceBackup {
  format: typeof BACKUP_FORMAT;
  version: 2;
  exportedAt: string;
  data: PortableWorkspaceData;
}
export interface CareerWorkspaceBackup {
  format: typeof BACKUP_FORMAT;
  version: 3;
  exportedAt: string;
  data: CareerWorkspaceData;
}
export type AnyWorkspaceBackup =
  WorkspaceBackup | PortableWorkspaceBackup | CareerWorkspaceBackup;
export interface WorkspaceCounts {
  applications: number;
  interviews: number;
}
export interface RestorePreview {
  token: string;
  exportedAt: string;
  incoming: WorkspaceCounts;
  current: WorkspaceCounts | null;
  portable?: PortableRestoreSummary;
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
export function createPortableBackup(
  data: unknown,
  exportedAt: string,
): PortableWorkspaceBackup {
  const workspace = createBackup(data, exportedAt);
  const raw = record(data);
  if (
    Object.keys(raw).some(
      (key) => !['applications', 'interviews', 'offers'].includes(key),
    )
  )
    throw new BackupValidationError('Unsupported version 2 backup fields.');
  for (const row of [
    ...(raw.applications as unknown[]),
    ...(raw.interviews as unknown[]),
  ]) {
    if (
      Object.keys(record(row)).some((key) =>
        ['userId', 'user_id', 'owner', 'ownerId'].includes(key),
      )
    )
      throw new BackupValidationError(
        'Backup ownership must come from your signed-in account.',
      );
  }
  try {
    return {
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt,
      data: {
        ...workspace.data,
        offers: validatePortableOffers(
          raw.offers,
          new Set(workspace.data.applications.map((row) => row.id)),
        ),
      },
    };
  } catch (error) {
    throw new BackupValidationError(
      error instanceof Error ? error.message : 'Invalid offer history.',
    );
  }
}
export function serializeBackup(backup: AnyWorkspaceBackup): string {
  const text = JSON.stringify(
    backup.version === 3
      ? createCareerBackup(backup.data, backup.exportedAt)
      : backup.version === 2
        ? createPortableBackup(backup.data, backup.exportedAt)
        : createBackup(backup.data, backup.exportedAt),
    null,
    2,
  );
  checkSize(text);
  return text;
}
export function createCareerBackup(
  data: unknown,
  exportedAt: string,
): CareerWorkspaceBackup {
  const raw = record(data);
  if (
    Object.keys(raw).some(
      (key) =>
        !['applications', 'interviews', 'offers', 'employments'].includes(key),
    )
  )
    throw new BackupValidationError(
      'Unsupported version 3 backup fields or ownership information.',
    );
  const base = createPortableBackup(
    {
      applications: raw.applications,
      interviews: raw.interviews,
      offers: raw.offers,
    },
    exportedAt,
  );
  try {
    return {
      ...base,
      version: 3,
      data: {
        ...base.data,
        employments: validatePortableEmployments(raw.employments, base.data),
      },
    };
  } catch (error) {
    throw new BackupValidationError(
      error instanceof Error ? error.message : 'Invalid Career Vault history.',
    );
  }
}
function checkSize(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new BackupValidationError('Choose a backup of 10 MiB or less.');
}
export function parseBackup(text: string): AnyWorkspaceBackup {
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
  if (
    (row.version === 2 || row.version === 3) &&
    Object.keys(row).some(
      (key) => !['format', 'version', 'exportedAt', 'data'].includes(key),
    )
  )
    throw new BackupValidationError(
      'Unsupported version 2 backup fields or ownership information.',
    );
  // Future migrations belong at this version boundary, before domain validation.
  if (row.version !== BACKUP_VERSION && row.version !== 2 && row.version !== 3)
    throw new BackupValidationError(
      'This backup version is not supported. Use a version 1, 2 or 3 FATS backup.',
    );
  return row.version === 3
    ? createCareerBackup(row.data, stringField(row, 'exportedAt'))
    : row.version === 2
      ? createPortableBackup(row.data, stringField(row, 'exportedAt'))
      : createBackup(row.data, stringField(row, 'exportedAt'));
}
