import type { Metadata } from 'next';
import { ApplicationList } from '@/components/application-list';

export const metadata: Metadata = { title: 'Applications' };
export default function ApplicationsPage() {
  return <ApplicationList />;
}
