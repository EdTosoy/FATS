import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ApplicationList } from '@/components/application-list';

export const metadata: Metadata = { title: 'Applications' };
export default function ApplicationsPage() {
  return (
    <Suspense fallback={<p role="status">Loading your applications…</p>}>
      <ApplicationList />
    </Suspense>
  );
}
