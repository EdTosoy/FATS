import { it, expect } from 'vitest';
import {
  applicationFilterQuery,
  readApplicationFilters,
} from '../../apps/web/src/lib/application-list-url';
it('validates filters and encodes only deliberate search and status values', () => {
  expect(
    readApplicationFilters(new URLSearchParams('q=graduate&status=Applied')),
  ).toEqual({ query: 'graduate', status: 'Applied' });
  for (const raw of [
    'q=a&q=b&status=invalid',
    'q=%00&status=Saved&status=Applied',
    'q=' + 'a'.repeat(501),
  ])
    expect(readApplicationFilters(new URLSearchParams(raw))).toEqual({
      query: '',
      status: 'All',
    });
  expect(applicationFilterQuery('', 'All')).toBe('');
  expect(applicationFilterQuery('a & b', 'Saved')).toBe(
    'q=a+%26+b&status=Saved',
  );
});
