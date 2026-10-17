import type { Metadata } from 'next';
import { AccountProvider } from '@/components/account-provider';
import { WorkspaceRoot } from '@/components/workspace-root';
import { ThemeProvider } from '@/components/theme-provider';
import { THEME_BOOTSTRAP } from '@/lib/theme';
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="fats-theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AccountProvider>
            <WorkspaceRoot>{children}</WorkspaceRoot>
          </AccountProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
