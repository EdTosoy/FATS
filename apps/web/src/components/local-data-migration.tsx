'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { LocalMigrationPreview, WorkspaceCounts } from '@fats/domain';
import { HttpWorkspaceRepository } from '@/lib/http-workspace-repository';
import { LocalDataTransfer } from '@/lib/local-data-transfer';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { Button, Card } from './ui';
export function LocalDataMigration() {
  const { user, expired } = useAccount();
  const { refreshWorkspace } = useApplications();
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
      await source.confirm(account, preview.token);
      await refreshWorkspace();
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
      <h2 id="local-migration-title">Bring your browser records with you</h2>
      <p>
        Your account and browser workspace are separate. Preview a copy into{' '}
        <strong>{user.email}</strong>. Existing account records are kept;
        original browser records are never removed.
      </p>
      {counts && (
        <p>
          Found {counts.applications} browser applications and{' '}
          {counts.interviews} browser interviews at this site address.
        </p>
      )}
      <p className="field-hint">
        Identical records are skipped. Conflicting IDs stop the complete
        transfer. Keep a local JSON backup; unreadable records must be recovered
        before copying.
      </p>
      {!preview ? (
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
                  setMessage('Transfer cancelled. No records changed.');
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
