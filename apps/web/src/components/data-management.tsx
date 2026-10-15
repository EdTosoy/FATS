'use client';

import { useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import { MAX_BACKUP_BYTES, type RestorePreview } from '@fats/domain';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { Button, Card } from './ui';

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The backup could not be processed. Try again.';
}

export function DataManagement() {
  const account = useAccount();
  const {
    exportBackup,
    previewRestore,
    restoreBackup,
    cancelRestore,
    loading,
    error: storageError,
  } = useApplications();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const exportButton = useRef<HTMLButtonElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);

  async function download() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const text = await exportBackup();
      const url = URL.createObjectURL(
        new Blob([text], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `fats-backup-${new Date().toISOString().replaceAll(':', '-')}.json`;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        exportButton.current?.focus({ preventScroll: true });
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(
        'Backup download requested. Check your downloads and keep the file somewhere safe.',
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function inspectFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const file = fileInput.current?.files?.[0];
      if (!file) throw new Error('Choose a FATS JSON backup first.');
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error('Choose a backup of 10 MiB or less.');
      const result = await previewRestore(await file.text());
      setConfirmed(false);
      setPreview(result);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (preview) cancelRestore(preview.token);
    setPreview(null);
    setConfirmed(false);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
    setMessage('Import cancelled. Your saved data is unchanged.');
  }

  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      await restoreBackup(preview.token);
      setMessage(
        `Restore completed. ${preview.incoming.applications} ${preview.incoming.applications === 1 ? 'application' : 'applications'} and ${preview.incoming.interviews} ${preview.incoming.interviews === 1 ? 'interview' : 'interviews'} are saved ${account.user ? 'in your account' : 'in this browser'}.`,
      );
      setPreview(null);
      setConfirmed(false);
      if (fileInput.current) fileInput.current.value = '';
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        className="content-card data-management"
        aria-labelledby="data-management-title"
      >
        <span className="icon-tile mint">
          <ShieldCheck size={23} aria-hidden="true" />
        </span>
        <h2 id="data-management-title">Data management</h2>
        <p>
          Keep a backup of your applications, interviews, preparation notes, and
          reflections.{' '}
          {account.user
            ? 'These tools export and replace your account records; local browser records stay separate.'
            : 'Clearing browser data or losing this device can remove your workspace.'}{' '}
          Backups do not include resume documents or other files.
        </p>
        <p className="backup-warning">
          Backups contain private, unencrypted information. Anyone with the file
          can read it. Store and share it carefully.{' '}
          {account.user
            ? 'Account export and restore transfer records between this browser and your FATS server. Downloads remain unencrypted.'
            : 'Export and import happen entirely on this device.'}
        </p>
        <div className="backup-tools">
          <section aria-labelledby="export-title">
            <h3 id="export-title">Export backup</h3>
            <p>
              Download your complete saved workspace as JSON. Export before
              replacing data you want to keep.
            </p>
            <Button
              ref={exportButton}
              variant="secondary"
              disabled={busy || loading || !!storageError}
              onClick={() => void download()}
            >
              <Download size={16} aria-hidden="true" />
              Export backup
            </Button>
            {storageError && (
              <p className="field-hint">
                Export is unavailable until saved data can be read. You can
                still preview a valid backup to recover it.
              </p>
            )}
          </section>
          <section aria-labelledby="import-title">
            <h3 id="import-title">Import backup</h3>
            <p>
              Preview a FATS backup, then confirm a full replacement. Records
              are not merged.
            </p>
            <form onSubmit={inspectFile} className="backup-file-form">
              <label htmlFor="backup-file">Choose JSON backup</label>
              <input
                id="backup-file"
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                required
                disabled={busy || loading}
                aria-describedby="backup-file-hint"
                onChange={() => {
                  setError('');
                  setMessage('');
                }}
              />
              <p id="backup-file-hint" className="field-hint">
                Version 1 FATS backup · maximum 10 MiB. Selecting a file does
                not change your data.
              </p>
              <Button
                ref={previewButton}
                type="submit"
                disabled={busy || loading}
              >
                <Upload size={16} aria-hidden="true" />
                Preview backup
              </Button>
            </form>
          </section>
        </div>
        <p className="save-feedback" role="status">
          {busy && !preview ? 'Preparing backup…' : message}
        </p>
        {error && !preview && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </Card>
      {preview && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open && !busy) cancel();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="dialog-content"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                previewButton.current?.focus();
              }}
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
              onPointerDownOutside={(event) => event.preventDefault()}
            >
              <Dialog.Title className="dialog-title">
                Replace this workspace?
              </Dialog.Title>
              <Dialog.Description className="muted">
                Review the backup before importing. This replaces all current
                applications, interviews, and notes with the backup contents.
                Nothing is merged.
              </Dialog.Description>
              <dl className="backup-counts">
                <div>
                  <dt>Backup applications</dt>
                  <dd>{preview.incoming.applications}</dd>
                </div>
                <div>
                  <dt>Backup interviews</dt>
                  <dd>{preview.incoming.interviews}</dd>
                </div>
                <div>
                  <dt>Current applications to replace</dt>
                  <dd>{preview.current?.applications ?? 'Unreadable'}</dd>
                </div>
                <div>
                  <dt>Current interviews to replace</dt>
                  <dd>{preview.current?.interviews ?? 'Unreadable'}</dd>
                </div>
              </dl>
              <p className="muted">
                Backup created{' '}
                {new Date(preview.exportedAt).toLocaleString('en-PH')}.
                Identifiers, timestamps, statuses, notes, and interview links
                will be preserved.
              </p>
              {!preview.current && (
                <p className="backup-warning">
                  Current saved data cannot be read. Restoring will replace it.
                  Back up the original site storage privately through browser
                  developer tools before continuing; see Help for guidance.
                </p>
              )}
              {preview.incoming.applications === 0 && (
                <p className="backup-warning">
                  This backup is empty. Restoring it removes all current
                  applications and interviews.
                </p>
              )}
              <form onSubmit={restore} className="restore-form">
                <label className="restore-confirmation">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    required
                    disabled={busy}
                  />
                  <span>
                    I understand this replaces all current applications,
                    interviews, and notes.
                  </span>
                </label>
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <div className="form-footer">
                  <span className="field-hint">
                    Keep your backup file after restoring.
                  </span>
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={cancel}
                    >
                      Cancel import
                    </Button>
                    <Button type="submit" disabled={busy || !confirmed}>
                      {busy ? 'Restoring…' : 'Replace workspace'}
                    </Button>
                  </div>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
