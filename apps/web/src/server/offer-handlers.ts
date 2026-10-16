import { OfferValidationError } from '@fats/domain';
import type { Services } from './services';
import {
  requireOrigin,
  readJson,
  textField,
  privateHeaders,
  errorResponse,
} from './http';
import { WorkspaceError } from './workspace-repository';
import { PostgresOfferRepository } from './offer-repository';
export async function handleOffers(request: Request, services: Services) {
  try {
    requireOrigin(request, services.origin);
    const session = await services.auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session)
      throw new WorkspaceError(
        'Your session ended. Sign in again to save your offer.',
        401,
      );
    if (!session.user.emailVerified)
      return Response.json(
        {
          error: 'Verify your email before opening offers.',
          code: 'EMAIL_UNVERIFIED',
        },
        { status: 403, headers: privateHeaders },
      );
    const expected = request.headers.get('x-fats-account');
    if (expected && expected !== session.user.id)
      return Response.json(
        {
          error: 'Your signed-in account changed. Reopen the application.',
          code: 'ACCOUNT_CHANGED',
        },
        { status: 409, headers: privateHeaders },
      );
    const repository = new PostgresOfferRepository(
      services.pool,
      session.user.id,
    );
    if (request.method === 'GET')
      return Response.json(await repository.list(), {
        headers: privateHeaders,
      });
    if (request.method !== 'POST')
      throw new WorkspaceError('Method not allowed.', 405);
    const body = await readJson(request, 65536);
    if (
      Object.keys(body).some(
        (key) =>
          !['applicationId', 'requestId', 'baseVersion', 'command'].includes(
            key,
          ),
      )
    )
      throw new WorkspaceError(
        'Send only offer details. Ownership comes from your session.',
      );
    await repository.command(
      textField(body, 'applicationId'),
      textField(body, 'requestId'),
      body.baseVersion as number,
      body.command,
    );
    return Response.json({ success: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof OfferValidationError)
      return Response.json(
        { error: error.message },
        { status: 422, headers: privateHeaders },
      );
    return errorResponse(error);
  }
}
