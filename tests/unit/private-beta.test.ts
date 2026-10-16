import { afterEach, expect, it, vi } from 'vitest';
import { isMatchingEnabled } from '../../apps/web/src/server/matching-access';
import { handleMatching } from '../../apps/web/src/server/matching-handlers';
import type { Services } from '../../apps/web/src/server/services';

afterEach(() => vi.unstubAllEnvs());

it('requires the exact server opt-in even with a configured provider', () => {
  for (const value of [undefined, '', '0', 'false', 'true', ' 1', '1 ']) {
    expect(
      isMatchingEnabled({
        FATS_AI_MATCHING_ENABLED: value,
        FATS_AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'synthetic-unused-beta-test-key',
      }),
    ).toBe(false);
  }
  expect(isMatchingEnabled({ FATS_AI_MATCHING_ENABLED: '1' })).toBe(true);
});

it('denies reads and every write action before session, database, storage or provider access', async () => {
  vi.stubEnv('FATS_AI_MATCHING_ENABLED', '0');
  const touched = vi.fn(() => {
    throw Error('Disabled matching must not access dependencies.');
  });
  const services = Object.defineProperties(
    {},
    {
      auth: { get: touched },
      pool: { get: touched },
      origin: { get: touched },
    },
  ) as Services;
  const injected = Object.defineProperties(
    {},
    {
      storage: { get: touched },
      provider: { get: touched },
    },
  ) as NonNullable<Parameters<typeof handleMatching>[2]>;
  for (const action of [null, 'prepare', 'compare', 'delete']) {
    const response = await handleMatching(
      new Request(
        'http://127.0.0.1:3000/api/matching?applicationId=synthetic',
        {
          method: action ? 'POST' : 'GET',
          ...(action
            ? { body: JSON.stringify({ action, confirmed: true }) }
            : {}),
        },
      ),
      services,
      injected,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ code: 'MATCHING_DISABLED' });
  }
  expect(touched).not.toHaveBeenCalled();
});
