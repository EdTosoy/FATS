import type { Metadata } from 'next';
import { CareerVaultView } from '@/components/career-vault';
export const metadata: Metadata = { title: 'Career Vault' };
export default function CareerVaultPage() {
  return <CareerVaultView />;
}
