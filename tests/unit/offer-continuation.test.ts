import { expect, it } from 'vitest';
import {
  offerContinuationId,
  offerContinuationPath,
} from '../../apps/web/src/lib/offer-continuation';
import { accountReturnPath } from '../../apps/web/src/lib/account-navigation';
it('retains only a canonical, bounded application continuation through authentication', () => {
  for (const id of [
    'synthetic-id',
    'legacy id',
    'a?next=https://example.test',
  ]) {
    const path = offerContinuationPath(id);
    expect(offerContinuationId(path)).toBe(id);
    expect(accountReturnPath(path)).toBe(path);
  }
  for (const path of [
    '/continue-offer/',
    '/continue-offer/..',
    '/continue-offer/%ZZ',
    '/continue-offer/%00',
    '/continue-offer/a?next=//example.test',
    '/continue-offer/a#b',
    '/continue-offer/a/b',
    '/continue-offer/' + 'a'.repeat(257),
    '//example.test/continue-offer/a',
  ]) {
    expect(offerContinuationId(path)).toBeNull();
    expect(accountReturnPath(path)).toBe('/settings');
  }
});
