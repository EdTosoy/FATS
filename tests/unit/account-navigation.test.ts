import { describe, it, expect } from 'vitest';
import { accountReturnPath } from '../../apps/web/src/lib/account-navigation';
describe('account return destinations', () => {
  it('keeps a Sidekick handoff and normal workspace routes', () => {
    expect(
      accountReturnPath('/sidekick#01234567-1111-4111-8111-0123456789ab'),
    ).toBe('/sidekick#01234567-1111-4111-8111-0123456789ab');
    expect(accountReturnPath('/applications/legacy-id')).toBe(
      '/applications/legacy-id',
    );
  });
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/api/auth/reset-password',
    '/sign-in?next=/sign-in',
    '/%2f%2fevil.test',
    null,
    [],
  ])('rejects external, looping, and non-workspace destinations', (value) => {
    expect(accountReturnPath(value)).toBe('/settings');
  });
});
