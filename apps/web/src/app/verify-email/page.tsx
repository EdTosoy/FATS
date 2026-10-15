import type { Metadata } from 'next';
import { VerificationForm } from '@/components/account-recovery';
import { accountReturnPath } from '@/lib/account-navigation';
export const metadata: Metadata = {
  title: 'Verify your email',
  referrer: 'no-referrer',
};
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <VerificationForm returnTo={accountReturnPath((await searchParams).next)} />
  );
}
