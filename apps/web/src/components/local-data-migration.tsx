'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { LocalMigrationPreview, WorkspaceCounts } from '@fats/domain';
import { HttpWorkspaceRepository } from '@/lib/http-workspace-repository';
import { LocalDataTransfer } from '@/lib/local-data-transfer';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { ActionLink, Button, Card, TextLink } from './ui';
export function LocalDataMigration({
  continuationApplicationId,
}: {
  continuationApplicationId?: string;
}) {
  const { user, expired } = useAccount();
  const { refreshWorkspace, error: workspaceError } = useApplications();
  const account = useMemo(
    () => (user ? new HttpWorkspaceRepository(user.id) : null),
    [user],
  );
  const source = useMemo(
    () =>
      new LocalDataTransfer({
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      }),
    [],
  );
  const [counts, setCounts] = useState<WorkspaceCounts | null>(null),
    [preview, setPreview] = useState<LocalMigrationPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (continuationApplicationId && message) heading.current?.focus();
  }, [continuationApplicationId, message]);
  useEffect(() => {
    void source
      .inspect()
      .then(setCounts, (error: unknown) =>
        setError(
          error instanceof Error
            ? error.message
            : 'Browser records could not be read.',
        ),
      );
  }, [source]);
  async function inspect() {
    if (!account) return;
    setBusy(true);
    setError('');
    setMessage('');
    setCopied(false);
    setAttempted(false);
    setReady(false);
    setConfirmed(false);
    try {
      if (preview) source.cancel(account);
      setPreview(null);
      setPreview(await source.preview(account));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Preview failed. Browser records are unchanged.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || !preview || !confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      setAttempted(true);
      const result = await source.confirm(account, preview.token);
      setCopied(true);
      try {
        await refreshWorkspace();
      } catch {
        setError(
          'Records were copied, but your account view could not refresh. Reload and preview again; retrying will not add duplicates.',
        );
        return;
      }
      setReady(
        !!continuationApplicationId &&
          result.applications.some(
            (application) => application.id === continuationApplicationId,
          ),
      );
      setMessage(
        'Browser records copied to your account. Original local records were kept. Repeating this transfer will not add duplicates.',
      );
      setPreview(null);
      setConfirmed(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Transfer failed. Keep your original records and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!user) return null;
  return (
    <Card
      className="content-card local-migration"
      aria-labelledby="local-migration-title"
    >
      <h2 id="local-migration-title" ref={heading} tabIndex={-1}>
        Bring your browser records with you
      </h2>
      <p>
        {continuationApplicationId
          ? 'Copy to '
          : 'Your account and browser workspace are separate. Preview a copy into '}
        <strong>{user.email}</strong>.{' '}
        {continuationApplicationId
          ? 'Existing account records and browser originals are kept.'
          : 'Existing account records are kept; original browser records are never removed.'}
      </p>
      {counts && (
        <p>
          Found {counts.applications} browser applications and{' '}
          {counts.interviews} browser interviews at this site address.
        </p>
      )}
      {continuationApplicationId && counts && counts.applications === 0 && (
        <p>
          No browser applications were found at this site address. Nothing will
          be copied. Open your account applications, or sign out in Settings to
          check your browser workspace.
        </p>
      )}
      <p className="field-hint">
        Identical records are skipped. Conflicts stop the whole copy.
        {!continuationApplicationId &&
          ' Keep a local JSON backup; unreadable records must be recovered before copying.'}
      </p>
      {ready && !workspaceError ? (
        <ActionLink
          href={`/applications/${encodeURIComponent(continuationApplicationId!)}#offer-desk`}
        >
          Continue to Offer Desk
        </ActionLink>
      ) : !preview ? (
        <Button
          disabled={
            busy ||
            expired ||
            !counts ||
            counts.applications + counts.interviews === 0
          }
          onClick={() => void inspect()}
        >
          {busy ? 'Preparing…' : 'Preview browser transfer'}
        </Button>
      ) : (
        <>
          <p>
            {continuationApplicationId
              ? 'Review the counts, then confirm the copy to continue to Offer Desk.'
              : 'Review this copy before continuing. The complete transfer succeeds together or leaves account records unchanged.'}
          </p>
          <dl className="backup-counts">
            <div>
              <dt>Applications to add</dt>
              <dd>{preview.added.applications}</dd>
            </div>
            <div>
              <dt>Interviews to add</dt>
              <dd>{preview.added.interviews}</dd>
            </div>
            <div>
              <dt>Identical applications skipped</dt>
              <dd>{preview.identical.applications}</dd>
            </div>
            <div>
              <dt>Identical interviews skipped</dt>
              <dd>{preview.identical.interviews}</dd>
            </div>
          </dl>
          {preview.alreadyImported && (
            <p role="status">
              This browser snapshot was already transferred. It will not be
              copied again.
            </p>
          )}
          <form onSubmit={copy} className="restore-form">
            <label className="restore-confirmation">
              <input
                type="checkbox"
                required
                checked={confirmed}
                disabled={busy || expired}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I confirm copying these browser records into this account,
                keeping the originals.
              </span>
            </label>
            <div className="form-footer">
              <Button
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (account) source.cancel(account);
                  setPreview(null);
                  setConfirmed(false);
                  setMessage(
                    attempted
                      ? 'Transfer preview closed. Browser originals are kept. If copying was interrupted, preview again to check what reached your account.'
                      : 'Transfer cancelled. No records changed.',
                  );
                }}
              >
                Cancel transfer
              </Button>
              <Button disabled={busy || expired || !confirmed}>
                {busy ? 'Copying…' : 'Copy to account'}
              </Button>
            </div>
          </form>
        </>
      )}
      {continuationApplicationId && (!ready || workspaceError) && (
        <p>
          <TextLink href="/applications">
            Open account applications without copying
          </TextLink>
        </p>
      )}
      {copied && workspaceError && (
        <p role="alert" className="error-message">
          Records were copied, but your account view could not refresh. Reload
          and preview again; retrying will not add duplicates.
        </p>
      )}
      {copied && continuationApplicationId && !ready && !workspaceError && (
        <p>
          This copy does not contain the requested application. Open your
          account applications to choose where to continue.
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <p role="status" className="save-feedback">
        {message}
      </p>
    </Card>
  );
}
