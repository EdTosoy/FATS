import { CareerValidationError } from '@fats/domain';
import type { Services } from './services';
import { assertActiveAccount } from './account-lifecycle';
import {
  requireOrigin,
  privateHeaders,
  readJson,
  textField,
  errorResponse,
} from './http';
import { WorkspaceError } from './workspace-error';
import { PostgresCareerRepository } from './career-repository';
export async function handleCareer(request: Request, services: Services) {
  try {
    requireOrigin(request, services.origin);
    const session = await services.auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session)
      throw new WorkspaceError(
        'Your session ended. Sign in again to open Career Vault.',
        401,
      );
    if (!session.user.emailVerified)
      return Response.json(
        {
          error: 'Verify your email before opening Career Vault.',
          code: 'EMAIL_UNVERIFIED',
        },
        { status: 403, headers: privateHeaders },
      );
    await assertActiveAccount(services.pool, session.user.id);
    const expected = request.headers.get('x-fats-account');
    if (expected && expected !== session.user.id)
      return Response.json(
        {
          error: 'Your signed-in account changed. Reopen Career Vault.',
          code: 'ACCOUNT_CHANGED',
        },
        { status: 409, headers: privateHeaders },
      );
    const repository = new PostgresCareerRepository(
      services.pool,
      session.user.id,
    );
    if (request.method === 'GET')
      return Response.json(await repository.list(), {
        headers: privateHeaders,
      });
    if (request.method !== 'POST')
      throw new WorkspaceError('Method not allowed.', 405);
    const body = await readJson(request, 32768);
    if (
      Object.keys(body).some(
        (key) =>
          !['employmentId', 'requestId', 'baseVersion', 'change'].includes(key),
      )
    )
      throw new WorkspaceError(
        'Send only Career Vault details. Ownership comes from your session.',
      );
    await repository.command(
      textField(body, 'employmentId'),
      textField(body, 'requestId'),
      body.baseVersion as number,
      body.change,
    );
    return Response.json({ success: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof CareerValidationError)
      return Response.json(
        { error: error.message },
        { status: 422, headers: privateHeaders },
      );
    return errorResponse(error);
  }
}
