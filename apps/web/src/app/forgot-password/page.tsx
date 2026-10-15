import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/account-recovery';
export const metadata: Metadata = {
  title: 'Forgot password',
  referrer: 'no-referrer',
};
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
