import { APPLICATION_STATUSES, type ApplicationStatus } from '@fats/domain';

export function readApplicationFilters(
  params: Pick<URLSearchParams, 'get' | 'getAll'>,
) {
  const rawQuery = params.getAll('q');
  const rawStatus = params.getAll('status');
  const query =
    rawQuery.length === 1 &&
    rawQuery[0].length <= 500 &&
    !/[\u0000-\u001f\u007f]/.test(rawQuery[0])
      ? rawQuery[0]
      : '';
  const status: ApplicationStatus | 'All' =
    rawStatus.length === 1 &&
    APPLICATION_STATUSES.includes(rawStatus[0] as ApplicationStatus)
      ? (rawStatus[0] as ApplicationStatus)
      : 'All';
  return { query, status };
}

export function applicationFilterQuery(
  query: string,
  status: ApplicationStatus | 'All',
) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (status !== 'All') params.set('status', status);
  return params.toString();
}

export function applicationListHref(query: string) {
  return `/applications${query ? `?${query}` : ''}`;
}
