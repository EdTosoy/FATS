import {
  PreparationError,
  TaskError,
  CsvImportError,
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
export type AuthFailureStage =
  | 'auth-initialization'
  | 'auth-connect'
  | 'auth-guard'
  | 'auth-library'
  | 'auth-session';

export function reportAuthFailure(stage: AuthFailureStage, error?: unknown) {
  const candidate =
    error instanceof Error && 'code' in error ? error.code : undefined;
  const code = typeof candidate === 'string' ? candidate : '';
  // Never log the error object, message, SQL, request, recipient or arbitrary
  // driver code. Only these fixed categories may leave the server boundary.
  const category =
    code === '42P01' || code === '42703'
      ? 'database-schema'
      : code === '42501'
        ? 'database-permission'
        : code === '28P01' || code === '28000'
          ? 'database-authentication'
          : [
                'ECONNREFUSED',
                'ECONNRESET',
                'ETIMEDOUT',
                'ENOTFOUND',
                'EAI_AGAIN',
                '08006',
                '53300',
                '57P03',
              ].includes(code)
            ? 'database-connection'
            : [
                  'ERR_TLS_CERT_ALTNAME_INVALID',
                  'CERT_HAS_EXPIRED',
                  'DEPTH_ZERO_SELF_SIGNED_CERT',
                  'SELF_SIGNED_CERT_IN_CHAIN',
                  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
                  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
                ].includes(code)
              ? 'database-tls'
              : 'unexpected';
  console.error('FATS authentication unavailable.', { stage, category });
}

export function errorResponse(
  error: unknown,
  authStage?: AuthFailureStage,
): Response {
  if (error instanceof WorkspaceError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: privateHeaders },
    );
  if (
    error instanceof TaskError ||
    error instanceof PreparationError ||
    error instanceof CsvImportError ||
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
  if (authStage) reportAuthFailure(authStage, error);
  return Response.json(
    {
      error:
        'Account storage is temporarily unavailable. Keep your inputs and retry. Your browser records have not been changed.',
    },
    { status: 503, headers: privateHeaders },
  );
}
