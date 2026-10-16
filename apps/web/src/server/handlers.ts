import type { PoolClient } from 'pg';
import { assertActiveAccount } from './account-lifecycle';
import {
  isCaptureId,
  validateJobCapture,
  normalizeApplicationInput,
  normalizeInterviewInput,
  type ApplicationStatus,
  type InterviewStatus,
  type InterviewStage,
} from '@fats/domain';
import type { Services } from './services';
import {
  PostgresWorkspaceRepository,
  WorkspaceError,
} from './workspace-repository';
import {
  errorResponse,
  privateHeaders,
  readJson,
  requireOrigin,
  textField,
  objectField,
} from './http';

function publicUser(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  return {
    id: user.id as string,
    name: user.name as string,
    email: user.email as string,
    emailVerified: user.emailVerified === true,
  };
}
export async function handleAuth(
  request: Request,
  services: Services,
): Promise<Response> {
  const started = Date.now();
  let authGuard: PoolClient | undefined;
  const path = new URL(request.url).pathname.replace('/api/auth', '');
  const genericRequest = [
    '/sign-up/email',
    '/send-verification-email',
    '/request-password-reset',
  ].includes(path);
  try {
    requireOrigin(request, services.origin);
    const allowed =
      request.method === 'GET'
        ? path === '/get-session'
        : request.method === 'POST' &&
          [
            '/sign-up/email',
            '/sign-in/email',
            '/sign-out',
            '/send-verification-email',
            '/verify-email',
            '/request-password-reset',
            '/reset-password',
          ].includes(path);
    if (!allowed)
      throw new WorkspaceError('Authentication endpoint not found.', 404);
    let libraryPath = path;
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    let input: Record<string, unknown> = {};
    if (request.method === 'POST') {
      const data = await readJson(request, 16384);
      switch (path) {
        case '/sign-up/email':
        case '/sign-in/email':
          input = {
            email: textField(data, 'email').trim(),
            password: textField(data, 'password'),
          };
          if (path === '/sign-up/email') {
            const name = textField(data, 'name').trim();
            if (!name || name.length > 80)
              throw new WorkspaceError('Enter a name of 1–80 characters.');
            input.name = name;
          }
          break;
        case '/send-verification-email':
          libraryPath = '/email-otp/send-verification-otp';
          input = {
            email: textField(data, 'email').trim(),
            type: 'email-verification',
          };
          break;
        case '/verify-email':
          libraryPath = '/email-otp/verify-email';
          input = {
            email: textField(data, 'email').trim(),
            otp: textField(data, 'code'),
          };
          break;
        case '/request-password-reset':
          input = {
            email: textField(data, 'email').trim(),
            redirectTo: services.origin + '/reset-password',
          };
          break;
        case '/reset-password':
          input = {
            token: textField(data, 'token'),
            newPassword: textField(data, 'newPassword'),
          };
          break;
      }
    }
    authGuard = await services.pool.connect();
    await authGuard.query('SELECT pg_advisory_lock_shared(16432,8)');
    if (
      typeof input.email === 'string' &&
      (
        await authGuard.query(
          'SELECT 1 FROM "user" u JOIN account_erasures e ON e.user_id=u.id WHERE lower(u.email)=lower($1)',
          [input.email],
        )
      ).rowCount
    ) {
      if (genericRequest)
        return Response.json({ success: true }, { headers: privateHeaders });
      throw new WorkspaceError(
        path === '/sign-in/email'
          ? 'Unable to sign in. Check your email and password, or verify your email.'
          : 'This code is invalid, expired, or already used. Request a new code and try again.',
        path === '/sign-in/email' ? 401 : 400,
      );
    }
    // Never forward arbitrary callback URLs, account fields, OTP types or queries.
    const forwarded = new Request(
      new URL('/api/auth' + libraryPath, services.origin),
      {
        method: request.method,
        headers,
        ...(request.method === 'POST' ? { body: JSON.stringify(input) } : {}),
      },
    );
    const response = await services.auth.handler(forwarded);
    const outgoing = new Headers(response.headers);
    outgoing.delete('content-length');
    if (response.status === 429 && outgoing.has('x-retry-after'))
      outgoing.set('retry-after', outgoing.get('x-retry-after')!);
    for (const [key, value] of Object.entries(privateHeaders))
      outgoing.set(key, value);
    if (!response.ok) {
      const error =
        response.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : path === '/sign-in/email'
            ? 'Unable to sign in. Check your email and password, or verify your email.'
            : path === '/verify-email'
              ? 'This code is invalid, expired, or already used. Request a new code and try again.'
              : path === '/reset-password'
                ? 'This reset link is invalid, expired, or already used. Request a new link. Use a password of 12–128 characters.'
                : 'Unable to complete this request. Check your details and try again.';
      const status =
        path === '/verify-email' && [400, 401, 403].includes(response.status)
          ? 400
          : path === '/sign-in/email' && [401, 403].includes(response.status)
            ? 401
            : response.status;
      return Response.json({ error }, { status, headers: outgoing });
    }
    if (path === '/get-session' || path === '/sign-in/email') {
      const result = await response.json();
      if (result?.user) {
        try {
          await assertActiveAccount(services.pool, result.user.id);
        } catch (error) {
          if (error instanceof WorkspaceError && error.status === 401)
            return Response.json({ user: null }, { headers: privateHeaders });
          throw error;
        }
      }
      return Response.json(
        { user: publicUser(result?.user) },
        { headers: outgoing },
      );
    }
    // New/existing registrations and email requests have identical output.
    return Response.json({ success: true }, { headers: outgoing });
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (authGuard) {
      let failed = false;
      try {
        await authGuard.query('SELECT pg_advisory_unlock_shared(16432,8)');
      } catch {
        failed = true;
      }
      authGuard.release(failed);
    }
    if (genericRequest)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 500 - (Date.now() - started))),
      );
  }
}
function applicationInput(value: Record<string, unknown>) {
  return normalizeApplicationInput({
    title: textField(value, 'title'),
    company: textField(value, 'company'),
    sourceUrl: textField(value, 'sourceUrl'),
    location: textField(value, 'location'),
    description: textField(value, 'description'),
  });
}
function interviewInput(value: Record<string, unknown>) {
  return normalizeInterviewInput({
    applicationId: textField(value, 'applicationId'),
    title: textField(value, 'title'),
    stage: value.stage as InterviewStage,
    scheduledAt: textField(value, 'scheduledAt'),
    timeZone: textField(value, 'timeZone'),
    meetingUrl: textField(value, 'meetingUrl'),
    location: textField(value, 'location'),
    preparationNotes: textField(value, 'preparationNotes'),
    reflections: textField(value, 'reflections'),
  });
}
function identity(row: Record<string, unknown>) {
  const id = textField(row, 'id');
  if (!id || id.length > 256)
    throw new WorkspaceError('Choose a valid record ID.');
  return id;
}
function token(row: Record<string, unknown>) {
  const value = textField(row, 'token');
  if (!isCaptureId(value))
    throw new WorkspaceError('Preview the data again before continuing.');
  return value;
}
export async function handleWorkspace(
  request: Request,
  services: Services,
): Promise<Response> {
  try {
    requireOrigin(request, services.origin);
    const session = await services.auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session)
      throw new WorkspaceError(
        'Your session ended. Sign in again to use your account workspace.',
        401,
      );
    if (!session.user.emailVerified)
      return Response.json(
        {
          error: 'Verify your email before opening your account records.',
          code: 'EMAIL_UNVERIFIED',
        },
        { status: 403, headers: privateHeaders },
      );
    await assertActiveAccount(services.pool, session.user.id);
    const expected = request.headers.get('x-fats-account');
    if (expected && expected !== session.user.id)
      return Response.json(
        {
          error:
            'Your signed-in account changed. Reopen this workspace before saving.',
          code: 'ACCOUNT_CHANGED',
        },
        { status: 409, headers: privateHeaders },
      );
    const repository = new PostgresWorkspaceRepository(
      services.pool,
      session.user.id,
    );
    if (request.method === 'GET')
      return Response.json(await repository.getWorkspace(), {
        headers: privateHeaders,
      });
    if (request.method !== 'POST')
      throw new WorkspaceError('Method not allowed.', 405);
    const row = await readJson(request);
    if ('userId' in row || 'owner' in row || 'user_id' in row)
      throw new WorkspaceError(
        'Ownership is determined by your signed-in account.',
      );
    let result: unknown;
    switch (row.action) {
      case 'create': {
        const id = identity(row);
        if (!isCaptureId(id))
          throw new WorkspaceError('Use a valid creation request ID.');
        result = await repository.create(
          applicationInput(objectField(row, 'input')),
          id,
        );
        break;
      }
      case 'update': {
        const input = objectField(row, 'input');
        result = await repository.update(identity(row), {
          ...applicationInput(input),
          status: input.status as ApplicationStatus,
        });
        break;
      }
      case 'delete-application':
        await repository.deleteApplication(identity(row));
        result = null;
        break;
      case 'create-interview': {
        const id = identity(row);
        if (!isCaptureId(id))
          throw new WorkspaceError('Use a valid creation request ID.');
        result = await repository.createInterview(
          interviewInput(objectField(row, 'input')),
          id,
        );
        break;
      }
      case 'update-interview': {
        const input = objectField(row, 'input');
        result = await repository.updateInterview(identity(row), {
          ...interviewInput(input),
          status: input.status as InterviewStatus,
        });
        break;
      }
      case 'delete-interview':
        await repository.deleteInterview(identity(row));
        result = null;
        break;
      case 'capture':
        result = await repository.createCapturedApplication(
          validateJobCapture(
            row.capture,
            new Date().toISOString(),
            services.origin,
          ),
          applicationInput(objectField(row, 'input')),
        );
        break;
      case 'export':
        result = await repository.exportBackup();
        break;
      case 'preview-restore':
        result = await repository.previewRestore(textField(row, 'text'));
        break;
      case 'preview-migration':
        result = await repository.previewMigration(textField(row, 'text'));
        break;
      case 'restore':
      case 'migrate': {
        if (row.confirmed !== true)
          throw new WorkspaceError(
            'Confirm the preview before transferring data.',
          );
        result =
          row.action === 'restore'
            ? await repository.restoreBackup(token(row))
            : await repository.migrateLocal(token(row));
        break;
      }
      case 'cancel':
        await repository.cancelStage(token(row));
        result = null;
        break;
      default:
        throw new WorkspaceError('Unknown workspace action.');
    }
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
