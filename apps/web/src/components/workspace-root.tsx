'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount } from './account-provider';
import { ApplicationProvider } from './application-provider';
import { HttpWorkspaceRepository } from '@/lib/http-workspace-repository';
import { ActionLink, Button, Card } from './ui';
import Link from 'next/link';
import { Brand } from './brand';
import { AppShell } from './app-shell';
function VerificationGate() {
  const account = useAccount();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <main className="account-gate">
      <Card className="content-card">
        <h1>One more step for your account.</h1>
        <p>
          Verify {account.user?.email} to open your saved records. Your
          applications, interviews, and browser records are safe.
        </p>
        <ActionLink
          href={
            '/verify-email?next=' +
            encodeURIComponent(location.pathname + location.hash)
          }
        >
          Verify your email
        </ActionLink>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await account.signOut();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Please retry signing out.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Signing out…' : 'Sign out and use the browser workspace'}
        </Button>
        {error && <p role="alert">{error}</p>}
      </Card>
    </main>
  );
}
export function WorkspaceRoot({ children }: { children: ReactNode }) {
  const account = useAccount();
  const pathname = usePathname();
  const id = account.user?.id;
  const repository = useMemo(
    () => (id ? new HttpWorkspaceRepository(id) : undefined),
    [id],
  );
  if (account.loading)
    return (
      <p className="loading-state" role="status">
        Getting your workspace ready…
      </p>
    );
  if (
    [
      '/sign-in',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
    ].includes(pathname)
  )
    return (
      <div className="auth-layout">
        <header>
          <Link href="/" aria-label="FATS dashboard">
            <Brand />
          </Link>
          <Link className="text-link" href="/">
            Back to your workspace
          </Link>
        </header>
        <main>{children}</main>
      </div>
    );
  if (account.user && !account.expired && !account.user.emailVerified)
    return <VerificationGate />;
  if (!account.user && account.mode === 'account')
    return (
      <main className="account-gate">
        <Card className="content-card">
          <h1>Let’s reconnect your account.</h1>
          <p role="alert">
            {account.error ||
              'Your session ended. Sign in again to open your saved account records.'}
          </p>
          <p>Your browser records are separate and have not been changed.</p>
          <ActionLink
            href={`/sign-in?next=${encodeURIComponent(location.pathname + location.hash)}`}
          >
            Sign in again
          </ActionLink>
          <Button variant="secondary" onClick={account.useLocal}>
            Use the local workspace instead
          </Button>
        </Card>
      </main>
    );
  return (
    <ApplicationProvider
      key={account.user?.id ?? 'local'}
      repository={repository}
    >
      <AppShell>{children}</AppShell>
    </ApplicationProvider>
  );
}
