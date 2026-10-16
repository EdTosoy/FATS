'use client';
import { useState } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';
import { useAccount } from './account-provider';
import { ActionLink, Button, Card, TextLink } from './ui';
import { LocalDataMigration } from './local-data-migration';
export function AccountSettings() {
  const account = useAccount();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await account.signOut();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="settings-grid">
        <Card className="content-card">
          <span className="icon-tile blue">
            <UserRound size={23} aria-hidden="true" />
          </span>
          <h2>{account.user ? 'Your account' : 'Meet your demo profile'}</h2>
          {account.user ? (
            <>
              <p>{account.user.name}</p>
              <p>{account.user.email}</p>
              <p>
                {account.user.emailVerified
                  ? 'Email verified'
                  : 'Email verification needed'}
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void logout()}
              >
                {busy ? 'Signing out…' : 'Sign out'}
              </Button>
              <p className="field-hint">
                Signing out revokes this session. Your account records stay
                saved and are cleared from this view.
              </p>
            </>
          ) : (
            <>
              <p>
                The greeting uses Maria Santos as a sample profile. Your
                application list starts empty and contains only the jobs you
                save.
              </p>
              <ActionLink href="/sign-in">Sign in to an account</ActionLink>
              <p className="field-hint">
                Create an account on the sign-in screen. Local records are
                copied only after your confirmation.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </Card>
        <Card className="content-card">
          <span className="icon-tile mint">
            <LockKeyhole size={23} aria-hidden="true" />
          </span>
          <h2>
            {account.user ? 'Saved to your account' : 'Saved in this browser'}
          </h2>
          <p>
            {account.user
              ? 'Applications, interviews, offers, and notes are saved to your account. Export JSON backups to keep an independent copy. Document files need a complete operator backup.'
              : 'Your jobs, interviews, and notes stay on this device, in this browser, for this site address. They aren’t synced to an account or another device.'}
          </p>
          <p className="muted">
            {account.user
              ? 'Sessions last up to seven days and renew while in use. The local FATS server must be running to reach your account. Keep independent backups of important records.'
              : 'Clearing site data will remove your applications, interviews, and notes. Private browsing may clear them when you close the window.'}
          </p>
          <TextLink href="/help">Read about storage and recovery</TextLink>
        </Card>
      </div>
      <LocalDataMigration />
    </>
  );
}
