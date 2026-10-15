import {
  normalizeApplicationInput,
  type ApplicationInput,
} from './application';
import { isIsoInstant } from './interview';

export class CaptureValidationError extends Error {}

export const FATS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;
export type FatsOrigin = (typeof FATS_ORIGINS)[number];
export const CAPTURE_TTL_MS = 15 * 60 * 1000;
export const CAPTURE_REQUEST = 'fats-sidekick/request';
export const CAPTURE_RESPONSE = 'fats-sidekick/response';
export interface CapturedJob extends ApplicationInput {
  workArrangement: string;
}
export interface JobCapture {
  format: 'fats-sidekick';
  version: 1;
  id: string;
  createdAt: string;
  expiresAt: string;
  origin: FatsOrigin;
  job: CapturedJob;
}
export function isCaptureId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function isFatsOrigin(value: unknown): value is FatsOrigin {
  return FATS_ORIGINS.some((origin) => origin === value);
}
export function isFatsCapturePage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      isFatsOrigin(url.origin) &&
      url.pathname === '/sidekick' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function normalizeCapturedJob(value: unknown): CapturedJob {
  if (!value || typeof value !== 'object')
    throw new CaptureValidationError('Job details are missing.');
  const row = value as Record<string, unknown>;
  for (const field of [
    'title',
    'company',
    'sourceUrl',
    'location',
    'description',
    'workArrangement',
  ])
    if (typeof row[field] !== 'string')
      throw new CaptureValidationError('Job fields must be plain text.');
  const job: CapturedJob = {
    title: (row.title as string).trim(),
    company: (row.company as string).trim(),
    sourceUrl: (row.sourceUrl as string).trim(),
    location: (row.location as string).trim(),
    description: (row.description as string).trim(),
    workArrangement: (row.workArrangement as string).trim(),
  };
  if (job.workArrangement.length > 80)
    throw new CaptureValidationError(
      'Work arrangement must be 80 characters or fewer.',
    );
  applicationFromCapture(job);
  return job;
}
export function applicationFromCapture(job: CapturedJob): ApplicationInput {
  const location =
    job.workArrangement &&
    !job.location.toLowerCase().includes(job.workArrangement.toLowerCase())
      ? [job.location, job.workArrangement].filter(Boolean).join(' · ')
      : job.location;
  return normalizeApplicationInput({
    title: job.title,
    company: job.company,
    sourceUrl: job.sourceUrl,
    location,
    description: job.description,
  });
}
export function validateJobCapture(
  value: unknown,
  now: string,
  origin?: string,
): JobCapture {
  if (!value || typeof value !== 'object')
    throw new CaptureValidationError(
      'This capture is unavailable. Capture the job again.',
    );
  const row = value as Record<string, unknown>;
  if (
    row.format !== 'fats-sidekick' ||
    row.version !== 1 ||
    !isCaptureId(row.id) ||
    !isFatsOrigin(row.origin) ||
    (origin !== undefined && row.origin !== origin) ||
    !isIsoInstant(row.createdAt) ||
    !isIsoInstant(row.expiresAt)
  )
    throw new CaptureValidationError(
      'This capture is invalid or belongs to another FATS workspace.',
    );
  const created = Date.parse(row.createdAt),
    expiry = Date.parse(row.expiresAt),
    current = Date.parse(now);
  if (
    !Number.isFinite(current) ||
    expiry <= current ||
    created > current + 30000 ||
    expiry <= created ||
    expiry - created > CAPTURE_TTL_MS
  )
    throw new CaptureValidationError(
      'This capture has expired. Return to Sidekick and open FATS again.',
    );
  return {
    format: 'fats-sidekick',
    version: 1,
    id: row.id,
    origin: row.origin,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    job: normalizeCapturedJob(row.job),
  };
}
export function canonicalPostingUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.href;
}
