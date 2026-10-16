import type { Services } from './services';
import { beginAccountErasure, receiptHash } from './account-lifecycle';
import { recoverAccountErasure } from './account-erasure';
import type { DocumentStorage } from './document-storage';
import { errorResponse, privateHeaders, readJson, requireOrigin } from './http';
import { WorkspaceError } from './workspace-repository';
export async function handleAccountErasure(
  request: Request,
  services: Services,
  storage?: DocumentStorage,
) {
  try {
    requireOrigin(request, services.origin);
    if (request.method !== 'POST')
      throw new WorkspaceError('Method not allowed.', 405);
    const body = await readJson(request, 2048);
    if (
      Object.keys(body).some(
        (k) => !['receipt', 'confirmation', 'confirmed'].includes(k),
      ) ||
      typeof body.receipt !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.receipt)
    )
      throw new WorkspaceError('Use a valid private deletion receipt.');
    // A receipt can only resume/check the already-authorized deletion it names.
    // It cannot start deletion or authorize access to any account records.
    const prior = (
      await services.pool.query(
        'SELECT 1 FROM account_erasures WHERE receipt_hash=$1',
        [receiptHash(body.receipt)],
      )
    ).rowCount;
    if (!prior) {
      const session = await services.auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      if (!session || !session.user.emailVerified)
        throw new WorkspaceError(
          'Sign in to your verified account before deleting it.',
          401,
        );
      const expected = request.headers.get('x-fats-account');
      if (!expected || expected !== session.user.id)
        throw new WorkspaceError(
          'Your signed-in account changed. Reopen Settings.',
          409,
        );
      if (body.confirmed !== true || body.confirmation !== 'DELETE MY ACCOUNT')
        throw new WorkspaceError(
          'Confirm the consequences and type DELETE MY ACCOUNT first.',
        );
      await beginAccountErasure(services.pool, session.user.id, body.receipt);
    }
    const status = await recoverAccountErasure(
      services.pool,
      body.receipt,
      storage,
    );
    return Response.json(
      { status },
      { status: status === 'complete' ? 200 : 202, headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
