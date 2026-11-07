import { afterEach, expect, it, vi } from 'vitest';
import { errorResponse } from '../../apps/web/src/server/http';
import { WorkspaceError } from '../../apps/web/src/server/workspace-error';

afterEach(() => vi.restoreAllMocks());

it('records only fixed auth stages and categories while preserving the private 503 response', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const [code, category] of [
    ['42P01', 'database-schema'],
    ['42703', 'database-schema'],
    ['42501', 'database-permission'],
    ['28P01', 'database-authentication'],
    ['ECONNREFUSED', 'database-connection'],
    ['ETIMEDOUT', 'database-connection'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'database-tls'],
    ['private-code-with-credentials', 'unexpected'],
  ]) {
    const error = Object.assign(new Error('private diagnostic and token'), {
      code,
      detail: 'private database detail',
      query: 'private SQL and parameters',
    });
    const response = errorResponse(error, 'auth-connect');
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(await response.json()).toEqual({
      error:
        'Account storage is temporarily unavailable. Keep your inputs and retry. Your browser records have not been changed.',
    });
    expect(log).toHaveBeenLastCalledWith('FATS authentication unavailable.', {
      stage: 'auth-connect',
      category,
    });
  }
  expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  const opaque = {
    toString: () => {
      throw new Error('Must not inspect.');
    },
  };
  errorResponse(
    Object.assign(new Error('Private.'), { code: opaque }),
    'auth-library',
  );
  expect(log).toHaveBeenLastCalledWith('FATS authentication unavailable.', {
    stage: 'auth-library',
    category: 'unexpected',
  });
});

it('keeps expected validation/origin failures and unrelated handlers out of auth diagnostics', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(
    errorResponse(new WorkspaceError('Same-origin only.', 403), 'auth-guard')
      .status,
  ).toBe(403);
  expect(errorResponse(new Error('Unrelated request.')).status).toBe(503);
  expect(log).not.toHaveBeenCalled();
});
