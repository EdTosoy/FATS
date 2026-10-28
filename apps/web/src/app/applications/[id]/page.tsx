import {
  applicationFilterQuery,
  readApplicationFilters,
} from '@/lib/application-list-url';
import type { Metadata } from 'next';
import { ApplicationDetail } from '@/components/application-detail';
import { isMatchingEnabled } from '@/server/matching-access';

export const metadata: Metadata = { title: 'Application details' };
export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const paramsForList = new URLSearchParams();
  for (const key of ['q', 'status']) {
    const value = raw[key];
    if (Array.isArray(value))
      value.forEach((entry) => paramsForList.append(key, entry));
    else if (value !== undefined) paramsForList.set(key, value);
  }
  const { query, status } = readApplicationFilters(paramsForList);
  return (
    <ApplicationDetail
      id={id}
      matchingEnabled={isMatchingEnabled()}
      listQuery={applicationFilterQuery(query, status)}
    />
  );
}
