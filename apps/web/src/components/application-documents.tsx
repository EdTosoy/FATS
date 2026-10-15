'use client';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { DocumentVersion } from '@fats/domain';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { useDocuments } from './document-provider';
import { VersionActions, PdfPreview, fileSize } from './document-library';
import { ActionLink, Button, Card, TextLink } from './ui';
import { formatDate } from './application-table';
export function ApplicationDocuments({
  applicationId,
}: {
  applicationId: string;
}) {
  const account = useAccount();
  const { library, loading, error, command } = useDocuments();
  const [editing, setEditing] = useState(false),
    [documentId, setDocumentId] = useState(''),
    [versionId, setVersionId] = useState(''),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState<DocumentVersion | null>(null);
  if (!account.user) return null;
  const link = library?.associations.find(
    (a) => a.applicationId === applicationId,
  );
  const document = library?.documents.find((d) => d.id === link?.documentId);
  const version = document?.versions.find((v) => v.id === link?.versionId);
  const resumes =
    library?.documents.filter((d) => d.category === 'Resumes' && !d.archived) ??
    [];
  const chosen = resumes.find((d) => d.id === documentId);
  async function save(id: string | null) {
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await command({
        action: 'associate',
        applicationId,
        versionId: id,
        confirmed: true,
      });
      setEditing(false);
      setNotice(
        id
          ? 'Submitted resume version recorded.'
          : 'Submitted resume link removed.',
      );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'The version could not be recorded. Keep your selection and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="application-documents">
      <div className="section-heading">
        <h2>
          <FileText size={18} aria-hidden="true" />
          Submitted resume
        </h2>
        <TextLink href="/resumes">Library</TextLink>
      </div>
      {loading ? (
        <p role="status">Loading submitted resume…</p>
      ) : error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : (
        <>
          {version && document ? (
            <>
              <h3>
                {document.name}
                {document.archived ? ' · Archived' : ''}
              </h3>
              <p>
                Version {version.number} · {version.originalFilename}
              </p>
              <p className="field-hint">
                {formatDate(version.createdAt)} · {fileSize(version.size)}
              </p>
              <VersionActions version={version} onPreview={setPreview} />
            </>
          ) : (
            <p className="muted">No submitted resume recorded yet.</p>
          )}
          <p className="field-hint">
            Record the copy you sent yourself. Updating your library never
            changes this selection or sends a file to the company.
          </p>
          {!editing ? (
            <Button
              variant="secondary"
              disabled={account.expired}
              onClick={() => {
                setEditing(true);
                setDocumentId(document?.archived ? '' : (document?.id ?? ''));
                setVersionId(document?.archived ? '' : (version?.id ?? ''));
                setFailure('');
              }}
            >
              {link ? 'Change submitted resume' : 'Select submitted resume'}
            </Button>
          ) : (
            <form
              className="document-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save(versionId);
              }}
            >
              <label>
                Resume
                <select
                  aria-label="Resume"
                  value={documentId}
                  disabled={busy}
                  required
                  onChange={(event) => {
                    setDocumentId(event.target.value);
                    setVersionId('');
                  }}
                >
                  <option value="">Choose a resume</option>
                  {resumes.map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                      {d.isDefault ? ' · Default' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Resume version
                <select
                  aria-label="Resume version"
                  value={versionId}
                  disabled={!chosen || busy}
                  required
                  onChange={(event) => setVersionId(event.target.value)}
                >
                  <option value="">Choose the exact version submitted</option>
                  {chosen?.versions.map((v) => (
                    <option
                      key={v.id}
                      value={v.id}
                      disabled={v.health !== 'available'}
                    >
                      Version {v.number} · {v.originalFilename} ·{' '}
                      {formatDate(v.createdAt)}
                      {v.health !== 'available' ? ` · ${v.health}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {!resumes.length && (
                <ActionLink href="/resumes" variant="secondary">
                  Add a resume to your library
                </ActionLink>
              )}
              <div className="document-actions">
                <Button type="submit" disabled={busy || !versionId}>
                  {busy ? 'Saving…' : 'Record submitted version'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setFailure('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              {link && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void save(null)}
                >
                  Confirm removal of submitted link
                </Button>
              )}
            </form>
          )}
        </>
      )}
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      <p role="status">{notice}</p>
      <PdfPreview version={preview} close={() => setPreview(null)} />
    </Card>
  );
}
export function DocumentNextStep() {
  const account = useAccount();
  const { library, error } = useDocuments();
  const { applications } = useApplications();
  if (!account.user || !library || error) return null;
  const resumes = library.documents.filter(
    (d) => d.category === 'Resumes' && !d.archived,
  );
  const unlinked = applications.find(
    (a) =>
      a.status !== 'Saved' &&
      !library.associations.some((link) => link.applicationId === a.id),
  );
  return (
    <div className="document-next-step">
      <FileText size={20} aria-hidden="true" />
      <div>
        <strong>
          {!resumes.length
            ? 'Keep your first resume close.'
            : unlinked
              ? 'Remember the resume you submitted.'
              : 'Your documents, ready when you are.'}
        </strong>
        <p>
          {!resumes.length
            ? 'Add a private copy to your library.'
            : unlinked
              ? `${unlinked.company} has no submitted resume version recorded.`
              : `${library.documents.length} document${library.documents.length === 1 ? '' : 's'} in your private library.`}
        </p>
      </div>
      <ActionLink
        href={
          !resumes.length
            ? '/resumes'
            : unlinked
              ? `/applications/${encodeURIComponent(unlinked.id)}`
              : '/resumes'
        }
        variant="secondary"
      >
        {!resumes.length
          ? 'Add your first resume'
          : unlinked
            ? 'Record a version'
            : 'Review documents'}
      </ActionLink>
    </div>
  );
}
