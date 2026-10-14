import type { Metadata } from 'next';
import { InterviewDetail } from '@/components/interview-detail';
export const metadata: Metadata = { title: 'Interview details' };
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InterviewDetail id={id} />;
}
