import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { accountReturnPath } from '@/lib/account-navigation';
export const metadata: Metadata = { title: 'Sign in', referrer: 'no-referrer' };
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <AuthForm returnTo={accountReturnPath((await searchParams).next)} />;
}
