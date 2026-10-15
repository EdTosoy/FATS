import type { Metadata } from 'next';
import { SidekickIntake } from '@/components/sidekick-intake';
export const metadata: Metadata = {
  title: 'Review Sidekick capture',
  referrer: 'no-referrer',
};
export default function SidekickPage() {
  return <SidekickIntake />;
}
