import type { Metadata } from 'next';
import { AccountProvider } from '@/components/account-provider';
import { WorkspaceRoot } from '@/components/workspace-root';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FATS · Your job-search companion', template: '%s · FATS' },
  description:
    'A friendly space to organize your job applications and take your next step with confidence.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AccountProvider>
          <WorkspaceRoot>{children}</WorkspaceRoot>
        </AccountProvider>
      </body>
    </html>
  );
}
