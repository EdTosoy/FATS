import type { Metadata } from 'next';
import { ApplicationDetail } from '@/components/application-detail';

export const metadata: Metadata = { title: 'Application details' };
export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationDetail id={id} />;
}
