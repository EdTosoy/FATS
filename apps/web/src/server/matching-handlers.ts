import { MatchingValidationError } from '@fats/domain';
import type { Services } from './services';
import {
  requireOrigin,
  readJson,
  privateHeaders,
  errorResponse,
  textField,
} from './http';
import { WorkspaceError } from './workspace-repository';
import {
  getDocumentStorage,
  isStorageKey,
  type DocumentStorage,
} from './document-storage';
import {
  configuredMatchingProvider,
  matchingLimits,
  type MatchingProvider,
} from './matching-provider';
import { MatchingRepository } from './matching-repository';
import { isMatchingEnabled, matchingDisabledResponse } from './matching-access';
export async function handleMatching(
  request: Request,
  services: Services,
  injected?: {
    storage: DocumentStorage;
    provider: MatchingProvider | null;
    limits?: ReturnType<typeof matchingLimits>;
  },
) {
  if (!isMatchingEnabled()) return matchingDisabledResponse();
  try {
    requireOrigin(request, services.origin);
    const session = await services.auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session)
      throw new WorkspaceError(
        'Your session ended. Sign in again to compare your resume.',
        401,
      );
    if (!session.user.emailVerified)
      return Response.json(
        {
          error: 'Verify your email before comparing.',
          code: 'EMAIL_UNVERIFIED',
        },
        { status: 403, headers: privateHeaders },
      );
    const expected = request.headers.get('x-fats-account');
    if (expected && expected !== session.user.id)
      return Response.json(
        {
          error:
            'Your signed-in account changed. Reopen the application before comparing.',
          code: 'ACCOUNT_CHANGED',
        },
        { status: 409, headers: privateHeaders },
      );
    const provider = injected
      ? injected.provider
      : configuredMatchingProvider();
    const url = new URL(request.url),
      applicationId = url.searchParams.get('applicationId');
    if (!applicationId || applicationId.length > 256)
      throw new WorkspaceError('Choose a saved application.');
    // Validate the parent even when the provider or byte store is unavailable.
    if (
      !(
        await services.pool.query(
          'SELECT 1 FROM applications WHERE user_id=$1 AND id=$2',
          [session.user.id, applicationId],
        )
      ).rowCount
    )
      throw new WorkspaceError('Application not found.', 404);
    const storage = injected?.storage ?? {
      put: async () => {
        throw Error();
      },
      read: async (key: string, size: number) =>
        getDocumentStorage().read(key, size),
      remove: async () => {
        throw Error();
      },
    };
    const repository = new MatchingRepository(
      services.pool,
      session.user.id,
      storage,
      provider,
      injected?.limits,
    );
    if (request.method === 'GET')
      return Response.json(
        {
          provider: provider
            ? {
                label: provider.label,
                external: provider.external,
                configuration: provider.configuration,
              }
            : null,
          reports: await repository.list(applicationId),
        },
        { headers: privateHeaders },
      );
    if (request.method !== 'POST')
      throw new WorkspaceError('Method not allowed.', 405);
    const body = await readJson(request, 4096);
    if (
      'userId' in body ||
      'owner' in body ||
      'user_id' in body ||
      'sources' in body
    )
      throw new WorkspaceError(
        'Ownership and source text come from your saved account records.',
      );
    const uuid = (field: string) => {
      const value = textField(body, field);
      if (!isStorageKey(value))
        throw new WorkspaceError('Use a valid comparison request.');
      return value;
    };
    let result: unknown;
    switch (body.action) {
      case 'prepare':
        result = await repository.prepare(
          applicationId,
          uuid('versionId'),
          session.user.name,
        );
        break;
      case 'compare':
        if (body.confirmed !== true)
          throw new WorkspaceError(
            'Review the extracted text and explicitly confirm sharing before comparing.',
          );
        // A preview cannot be used through a different application's endpoint.
        if (
          !(
            await services.pool.query(
              'SELECT 1 FROM matching_previews WHERE user_id=$1 AND id=$2 AND application_id=$3 UNION ALL SELECT 1 FROM matching_reports WHERE user_id=$1 AND preview_id=$2 AND application_id=$3',
              [session.user.id, uuid('previewId'), applicationId],
            )
          ).rowCount
        )
          throw new WorkspaceError('Text preview not found.', 404);
        result = await repository.compare(uuid('previewId'), uuid('requestId'));
        break;
      case 'delete':
        if (body.confirmed !== true)
          throw new WorkspaceError('Confirm report deletion first.');
        if (
          !(
            await services.pool.query(
              'SELECT 1 FROM matching_reports WHERE user_id=$1 AND id=$2 AND application_id=$3',
              [session.user.id, uuid('id'), applicationId],
            )
          ).rowCount
        )
          throw new WorkspaceError('Report not found.', 404);
        await repository.remove(uuid('id'));
        result = { success: true };
        break;
      default:
        throw new WorkspaceError('Unknown comparison action.');
    }
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof MatchingValidationError)
      return Response.json(
        { error: error.message },
        { status: 422, headers: privateHeaders },
      );
    return errorResponse(error);
  }
}
