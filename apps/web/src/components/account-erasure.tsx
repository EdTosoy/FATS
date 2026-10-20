'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Button, Card } from './ui';
import { useAccount } from './account-provider';
export function AccountErasure() {
  const account = useAccount();
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState(''),
    [error, setError] = useState('');
  async function erase() {
    const token =
      receipt ||
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
    setReceipt(token);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(account.user ? { 'X-Fats-Account': account.user.id } : {}),
        },
        body: JSON.stringify({ receipt: token, confirmed, confirmation }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            'Deletion could not be confirmed. Keep this page open and retry.',
        );
      const status = result.status === 'complete' ? 'complete' : 'pending';
      account.recordErasure(token, status);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Deletion could not be confirmed. Keep this page open and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!account.user && !receipt) return null;
  return (
    <Card className="content-card">
      <h2>Delete your account</h2>
      <p>
        Permanently remove your account, saved jobs, interviews and notes,
        offers and history, Career Vault employment and document-register
        history, document versions and files, and any past comparison reports.
      </p>
      <p>
        All sessions end when deletion starts. File cleanup may need a retry.
        Earlier operator backups, local email, downloaded exports, browser
        records and Sidekick drafts need separate cleanup. Ask the operator
        about retention.
      </p>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Dialog.Trigger asChild>
          <Button variant="secondary">Delete account…</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content job-form"
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <Dialog.Title className="dialog-title">
              Permanently delete your account?
            </Dialog.Title>
            <Dialog.Description>
              This cannot be undone. Save any independent copies you need before
              continuing. Deletion does not erase earlier operator backups or
              copies on your devices.
            </Dialog.Description>
            <>
              <label className="field-label" htmlFor="erase-confirmation">
                Type DELETE MY ACCOUNT
              </label>
              <input
                id="erase-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
              />
              <label className="offer-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy}
                />{' '}
                I understand my account records and private files will be
                permanently removed.
              </label>
            </>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            {receipt && (
              <p className="field-hint">
                Private deletion receipt (keep it if cleanup is pending):{' '}
                <code style={{ overflowWrap: 'anywhere' }}>{receipt}</code>
              </p>
            )}
            <div className="form-footer">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={busy}>
                  Close
                </Button>
              </Dialog.Close>
              <Button
                disabled={
                  busy || !confirmed || confirmation !== 'DELETE MY ACCOUNT'
                }
                onClick={() => void erase()}
              >
                {busy ? 'Deleting…' : 'Permanently delete account'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Card>
  );
}

export function AccountErasureResult() {
  const account = useAccount(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const progress = account.erasure;
  if (!progress) return null;
  async function retry() {
    if (!progress?.receipt) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt: progress.receipt }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            'Cleanup could not be confirmed. Keep your receipt and retry.',
        );
      account.recordErasure(
        progress.receipt,
        result.status === 'complete' ? 'complete' : 'pending',
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Cleanup could not be confirmed. Keep your receipt and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-gate">
      <Card className="content-card">
        <h1>Account deletion</h1>
        <p role="status">
          {progress.status === 'complete'
            ? 'Your account and its live private files have been deleted.'
            : 'This account is blocked and its sessions have ended. File cleanup may still be pending. Retry here with your receipt, or ask the local operator to run data cleanup.'}
        </p>
        <p>
          Earlier backups, email, downloads, browser records and Sidekick drafts
          need separate cleanup. Your former account workspace has been cleared
          from this view.
        </p>
        {progress.receipt && (
          <p>
            Private deletion receipt (keep it if cleanup is pending):{' '}
            <code style={{ overflowWrap: 'anywhere' }}>{progress.receipt}</code>
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {progress.status === 'pending' && progress.receipt && (
          <Button disabled={busy} onClick={() => void retry()}>
            {busy ? 'Retrying…' : 'Retry cleanup'}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            account.useLocal();
            router.replace('/sign-in');
          }}
        >
          Return to sign in
        </Button>
      </Card>
    </main>
  );
}
