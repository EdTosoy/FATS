'use client';

import { useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import { MAX_BACKUP_BYTES, type RestorePreview } from '@fats/domain';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { Button, Card } from './ui';
import { useOffers } from './offer-provider';

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The backup could not be processed. Try again.';
}

export function DataManagement() {
  const account = useAccount();
  const { refresh: refreshOffers } = useOffers();
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
      if (account.user) await refreshOffers().catch(() => {});
      setMessage(
        preview.portable
          ? `Import completed. Added ${preview.portable.added.applications} applications, ${preview.portable.added.interviews} interviews, and ${preview.portable.added.offers} offers.${preview.portable.career ? ` Added ${preview.portable.career.added} employment records with their document-register history.` : ''} Existing records were kept. Files were not restored from JSON.`
          : `Restore completed. ${preview.incoming.applications} ${preview.incoming.applications === 1 ? 'application' : 'applications'} and ${preview.incoming.interviews} ${preview.incoming.interviews === 1 ? 'interview' : 'interviews'} are saved ${account.user ? 'in your account' : 'in this browser'}.`,
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
          Keep a backup of your saved job search
          {account.user
            ? ', including offers and Career Vault history'
            : ''}.{' '}
          {account.user
            ? 'Version 2 and 3 imports add missing records and keep existing records. Version 3 includes Career Vault metadata and document-register history. Legacy version 1 restores replace applications and interviews when history protections permit. Browser records stay separate.'
            : 'Clearing browser data or losing this device can remove your workspace.'}{' '}
          Backups exclude library document metadata, files, submitted resume
          links, comparison reports, and reviewed text. Offer letters are
          historical references only in JSON; file bytes and live links require
          the complete local operator archive.
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
              Download your saved applications, interviews
              {account.user
                ? ', offers, and Career Vault metadata with its history'
                : ''}{' '}
              as JSON. Export before replacing data you want to keep.
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
              Preview a FATS backup, then confirm its import. Versions 2 and 3
              add missing records and block conflicts; version 1 requires full
              replacement.
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
                Version 1, 2 or 3 FATS backup · maximum 10 MiB. Versions 2 and 3
                require a verified account. Selecting a file does not change
                your data.
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
                {preview.portable
                  ? 'Import this backup?'
                  : 'Replace this workspace?'}
              </Dialog.Title>
              <Dialog.Description className="muted">
                {preview.portable
                  ? 'Add missing applications, interviews, offer history and any Career Vault records included. Identical records are skipped. Conflicts block the whole import; existing records and decisions are never overwritten.'
                  : 'Review the backup before importing. This replaces all current applications, interviews, and notes with the backup contents. Nothing is merged.'}
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
                  <dt>
                    {preview.portable
                      ? 'Current applications to keep'
                      : 'Current applications to replace'}
                  </dt>
                  <dd>{preview.current?.applications ?? 'Unreadable'}</dd>
                </div>
                <div>
                  <dt>
                    {preview.portable
                      ? 'Current interviews to keep'
                      : 'Current interviews to replace'}
                  </dt>
                  <dd>{preview.current?.interviews ?? 'Unreadable'}</dd>
                </div>
              </dl>
              {preview.portable && (
                <div className="portable-preview">
                  {preview.portable.career && (
                    <section aria-label="Career Vault import preview">
                      <h3>Career Vault</h3>
                      <p>
                        {preview.portable.career.total} employment records in
                        this backup · {preview.portable.career.added} to add ·{' '}
                        {preview.portable.career.identical} identical records to
                        skip.
                      </p>
                      <p>
                        {preview.portable.career.documents} document entries
                        with their complete tracking history.{' '}
                        {preview.portable.career.unavailableDocuments}{' '}
                        historical file references will remain unlinked; JSON
                        does not restore file bytes or grant download access.
                      </p>
                    </section>
                  )}
                  <h3>Offer history</h3>
                  <p>
                    {preview.portable.offers.length} offers in this backup ·{' '}
                    {preview.portable.added.offers} to add ·{' '}
                    {preview.portable.identical.offers} identical offers to skip
                  </p>
                  <p>
                    Add {preview.portable.added.applications} applications and{' '}
                    {preview.portable.added.interviews} interviews. Skip{' '}
                    {preview.portable.identical.applications} identical
                    applications and {preview.portable.identical.interviews}{' '}
                    identical interviews.
                  </p>
                  <ul>
                    {preview.portable.offers.map((offer) => (
                      <li key={offer.applicationId}>
                        <strong>{offer.application}</strong> · {offer.revisions}{' '}
                        terms revisions · {offer.state}
                      </li>
                    ))}
                  </ul>
                  {!!preview.portable.conflicts.length && (
                    <div className="error-message" role="alert">
                      <h3>Resolve conflicts before importing</h3>
                      <p>
                        Nothing will be imported while these saved records
                        differ. Export both copies before resolving differences.
                      </p>
                      <ul>
                        {preview.portable.conflicts.map((conflict) => (
                          <li key={conflict}>{conflict}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <h3>Offer letters are not in JSON</h3>
                  <p>
                    {preview.portable.unavailableDocuments.length} document
                    references will be retained without file links. JSON cannot
                    recover PDF/DOCX files or verify access to an old version.
                    Existing links on skipped offers stay as they are.
                  </p>
                  {!!preview.portable.unavailableDocuments.length && (
                    <ul>
                      {preview.portable.unavailableDocuments.map((item) => (
                        <li key={`${item.application}-${item.sequence}`}>
                          {item.application} · history entry {item.sequence}:
                          letter unavailable from this backup
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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
              {preview.incoming.applications === 0 && !preview.portable && (
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
                    {preview.portable
                      ? `I understand this adds supported records, keeps existing decisions${preview.portable.career ? ' and Career Vault history' : ''}, and does not restore offer-letter or employment files or live links.`
                      : 'I understand this replaces all current applications, interviews, and notes.'}
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
                    <Button
                      type="submit"
                      disabled={
                        busy ||
                        !confirmed ||
                        Boolean(preview.portable?.conflicts.length)
                      }
                    >
                      {busy
                        ? 'Restoring…'
                        : preview.portable
                          ? 'Import supported records'
                          : 'Replace workspace'}
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
