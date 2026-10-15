import {
  MAX_BACKUP_BYTES,
  ApplicationValidationError,
  InterviewValidationError,
  BackupValidationError,
  LocalMigrationError,
  CaptureValidationError,
} from '@fats/domain';
import { WorkspaceError } from './workspace-repository';

export const privateHeaders = {
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
export function requireOrigin(
  request: Request,
  origin: string,
  write = request.method !== 'GET',
) {
  // NextURL normalizes loopback IPs to localhost. Validate the actual Host
  // against configuration, alongside the browser Origin, rather than trusting
  // that normalized URL or any forwarded-host header.
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (
    host !== new URL(origin).host ||
    (request.headers.has('origin') &&
      request.headers.get('origin') !== origin) ||
    (write && request.headers.get('origin') !== origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new WorkspaceError(
      'This request must come from your FATS workspace.',
      403,
    );
  if (
    write &&
    request.headers.get('content-type')?.split(';')[0].trim() !==
      'application/json'
  )
    throw new WorkspaceError('Send a JSON request.', 415);
}
export async function readJson(
  request: Request,
  limit = MAX_BACKUP_BYTES * 2 + 65536,
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new WorkspaceError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkspaceError('A JSON request is required.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '',
    size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new WorkspaceError('This request is too large.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError('This request contains invalid JSON.');
  } finally {
    reader.releaseLock();
  }
}
export function textField(row: Record<string, unknown>, field: string): string {
  if (typeof row[field] !== 'string')
    throw new WorkspaceError(`The ${field} field must be text.`);
  return row[field];
}
export function objectField(
  row: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = row[field];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkspaceError(`The ${field} field must be an object.`);
  return value as Record<string, unknown>;
}
export function errorResponse(error: unknown): Response {
  if (error instanceof WorkspaceError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: privateHeaders },
    );
  if (
    error instanceof ApplicationValidationError ||
    error instanceof InterviewValidationError ||
    error instanceof BackupValidationError ||
    error instanceof LocalMigrationError ||
    error instanceof CaptureValidationError
  )
    return Response.json(
      { error: error.message },
      { status: 400, headers: privateHeaders },
    );
  return Response.json(
    {
      error:
        'Account storage is temporarily unavailable. Keep your inputs and retry. Your browser records have not been changed.',
    },
    { status: 503, headers: privateHeaders },
  );
}
