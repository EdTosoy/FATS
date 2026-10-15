'use client';
import { useState, useRef, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  FileText,
  Plus,
  Search,
  ShieldCheck,
  X,
  Download,
  Archive,
  Star,
} from 'lucide-react';
import {
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_BYTES,
  MAX_ACCOUNT_DOCUMENT_BYTES,
  type Document,
  type DocumentVersion,
  type DocumentCategory,
} from '@fats/domain';
import { useAccount } from './account-provider';
import { useDocuments, documentUrl } from './document-provider';
import { ActionLink, Button, Card, EmptyState, PageHeading } from './ui';
import { PdfCanvas } from './pdf-canvas';
import { formatDate } from './application-table';
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The document could not be saved. Keep your inputs and retry.';
export function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;
}
export function VersionActions({
  version,
  onPreview,
}: {
  version: DocumentVersion;
  onPreview: (v: DocumentVersion) => void;
}) {
  return version.health === 'available' ? (
    <div className="document-actions">
      {version.format === 'pdf' && (
        <Button variant="secondary" onClick={() => onPreview(version)}>
          Preview PDF
        </Button>
      )}
      <a className="button button-secondary" href={documentUrl(version.id)}>
        <Download size={15} aria-hidden="true" />
        Download
        <span className="sr-only">
          {' '}
          {version.originalFilename} version {version.number}
        </span>
      </a>
    </div>
  ) : (
    <p className="error-message">
      File {version.health}. Metadata and submitted links are safe. Ask the
      local operator to recover the matching file from a complete backup.
    </p>
  );
}
export function PdfPreview({
  version,
  close,
}: {
  version: DocumentVersion | null;
  close: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={Boolean(version)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content document-preview"
          onOpenAutoFocus={() => {
            opener.current = window.document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <div className="dialog-heading">
            <Dialog.Title className="dialog-title">PDF preview</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close preview">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {version?.originalFilename} · Version {version?.number}. Preview
            shows page images. Download the original for selectable text or
            details the preview cannot render.
          </Dialog.Description>
          {version && (
            <>
              <PdfCanvas key={version.id} versionId={version.id} />
              <a
                className="button button-secondary"
                href={documentUrl(version.id)}
              >
                Download PDF
              </a>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function UploadForm({
  document,
  onSaved,
}: {
  document?: Document;
  onSaved: () => void;
}) {
  const { upload } = useDocuments();
  const [name, setName] = useState(''),
    [category, setCategory] = useState<DocumentCategory>('Resumes'),
    [file, setFile] = useState<File | null>(null),
    [requestId, setRequestId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a PDF or DOCX first.');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES || !file.size) {
      setError('Choose a nonempty file of 10 MiB or less.');
      return;
    }
    setBusy(true);
    try {
      await upload(file, {
        name,
        category,
        requestId,
        ...(document ? { documentId: document.id } : {}),
      });
      onSaved();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="document-form" onSubmit={(event) => void submit(event)}>
      {!document && (
        <>
          <label>
            Document name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={160}
              disabled={busy}
              placeholder="e.g. Software Developer Resume"
            />
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as DocumentCategory)
              }
              disabled={busy}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        {document ? 'New version file' : 'Document file'}
        <input
          type="file"
          accept=".pdf,.docx"
          disabled={busy}
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            setFile(chosen);
            setRequestId(crypto.randomUUID());
            if (chosen && !name)
              setName(chosen.name.replace(/\.(pdf|docx)$/i, ''));
          }}
          required
        />
      </label>
      <p className="field-hint">
        PDF or DOCX · up to 10 MiB. Encrypted PDFs, macros, and embedded files
        are unsupported. Earlier versions stay unchanged.
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy} type="submit">
        {busy
          ? 'Uploading…'
          : document
            ? 'Upload new version'
            : 'Upload document'}
      </Button>
    </form>
  );
}
function DocumentEditor({
  document,
  onDeleted,
  onPreview,
}: {
  document: Document;
  onDeleted: () => void;
  onPreview: (v: DocumentVersion) => void;
}) {
  const { command, library } = useDocuments();
  const [name, setName] = useState(document.name),
    [category, setCategory] = useState(document.category),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [adding, setAdding] = useState(false),
    [confirming, setConfirming] = useState(false);
  const references =
    library?.associations.filter((a) => a.documentId === document.id).length ??
    0;
  async function run(body: Record<string, unknown>, notice: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await command(body);
      setNotice(notice);
      if (body.action === 'delete') onDeleted();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const edit = (extra: Record<string, unknown> = {}) => ({
    action: 'edit',
    id: document.id,
    name,
    category,
    archived: document.archived,
    isDefault: document.isDefault,
    ...extra,
  });
  return (
    <>
      <form
        className="document-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(edit(), 'Document details saved.');
        }}
      >
        <label>
          Document name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={160}
            disabled={busy}
          />
        </label>
        <label>
          Category
          <select
            aria-label="Category"
            value={category}
            disabled={busy}
            onChange={(event) =>
              setCategory(event.target.value as DocumentCategory)
            }
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button variant="secondary" type="submit" disabled={busy}>
          Save details
        </Button>
      </form>
      <div className="document-actions">
        {document.category === 'Resumes' && !document.archived && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                edit({
                  name: document.name,
                  category: document.category,
                  isDefault: !document.isDefault,
                }),
                document.isDefault
                  ? 'Default resume cleared.'
                  : 'Default resume saved.',
              )
            }
          >
            <Star size={15} aria-hidden="true" />
            {document.isDefault ? 'Clear default' : 'Make default resume'}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(
              edit({
                name: document.name,
                category: document.category,
                archived: !document.archived,
                isDefault: false,
              }),
              document.archived
                ? 'Document restored.'
                : 'Document archived. Submitted versions are preserved.',
            )
          }
        >
          <Archive size={15} aria-hidden="true" />
          {document.archived ? 'Restore from archive' : 'Archive document'}
        </Button>
      </div>
      <p className="field-hint">
        {references} application{references === 1 ? '' : 's'} linked. The
        default resume uses its latest version; saved application links always
        keep the exact version you selected.
      </p>
      <div className="section-heading">
        <h3>Version history</h3>
        {!document.archived && !adding && (
          <Button
            variant="secondary"
            disabled={busy || document.versions.length >= 20}
            onClick={() => setAdding(true)}
          >
            <Plus size={15} aria-hidden="true" />
            Add version
          </Button>
        )}
      </div>
      {adding && (
        <div className="document-upload-panel">
          <h3>Upload a new version</h3>
          <UploadForm
            document={document}
            onSaved={() => {
              setAdding(false);
              setNotice(
                'New version saved. Existing application links are unchanged.',
              );
            }}
          />
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Cancel new version
          </Button>
        </div>
      )}
      <ol className="version-list">
        {document.versions.map((v, i) => (
          <li key={v.id}>
            <div>
              <strong>
                Version {v.number}
                {i === 0 ? ' · Latest' : ''}
              </strong>
              <p>{v.originalFilename}</p>
              <p className="field-hint">
                {v.format.toUpperCase()} · {fileSize(v.size)} ·{' '}
                {formatDate(v.createdAt)}
              </p>
            </div>
            <VersionActions version={v} onPreview={onPreview} />
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      <div className="document-delete">
        {references ? (
          <p className="field-hint">
            Archive this document to keep submitted history. Deletion is blocked
            while any application links to a version.
          </p>
        ) : confirming ? (
          <>
            <p>
              Delete this document and all {document.versions.length} versions?
              This cannot be undone. Keep a downloaded copy if you need one.
            </p>
            <div className="document-actions">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    { action: 'delete', id: document.id, confirmed: true },
                    'Document deleted.',
                  )
                }
              >
                Confirm deletion
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Keep document
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Delete document…
          </Button>
        )}
      </div>
    </>
  );
}
export function DocumentLibraryView() {
  const account = useAccount();
  const { library, loading, error, refresh } = useDocuments();
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('All categories'),
    [state, setState] = useState('Active'),
    [uploading, setUploading] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [preview, setPreview] = useState<DocumentVersion | null>(null),
    [notice, setNotice] = useState('');
  const searchInput = useRef<HTMLInputElement | null>(null);
  const uploadOpener = useRef<HTMLElement | null>(null);
  const documentOpener = useRef<HTMLElement | null>(null);
  const document = library?.documents.find((d) => d.id === selected);
  const documents =
    library?.documents.filter(
      (d) =>
        (state === 'All documents' || d.archived === (state === 'Archived')) &&
        (category === 'All categories' || d.category === category) &&
        `${d.name} ${d.versions.map((v) => v.originalFilename).join(' ')}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Tell your story"
        title="Your resumes & documents"
        description="Keep your files together, and remember exactly what you sent."
        action={
          account.user && !error ? (
            <Button
              disabled={account.expired}
              onClick={(event) => {
                uploadOpener.current = event.currentTarget;
                setUploading(true);
              }}
            >
              <Plus size={17} aria-hidden="true" />
              Upload document
            </Button>
          ) : undefined
        }
      />
      {!account.user ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="A private library for your next chapter."
            action={
              <ActionLink href="/sign-in?next=%2Fresumes">
                Sign in to manage documents
              </ActionLink>
            }
          >
            <p>
              Sign in to a verified account to upload resumes, cover letters,
              certificates, and other application documents. Your browser
              workspace stays separate.
            </p>
          </EmptyState>
        </Card>
      ) : loading ? (
        <p role="status">Loading your document library…</p>
      ) : error ? (
        <Card className="content-card">
          <h2>Your documents are unavailable.</h2>
          <p role="alert" className="error-message">
            {error}
          </p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Retry documents
          </Button>
        </Card>
      ) : (
        <>
          <div className="document-toolbar">
            <label className="document-search">
              <span>
                <Search size={16} aria-hidden="true" />
                Search documents
              </span>
              <input
                ref={searchInput}
                type="search"
                placeholder="Name or filename"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Category
              <select
                aria-label="Category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>All categories</option>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Show
              <select
                aria-label="Show"
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option>Active</option>
                <option>Archived</option>
                <option>All documents</option>
              </select>
            </label>
          </div>
          <p className="field-hint document-usage">
            {fileSize(library?.usedBytes ?? 0)} of{' '}
            {fileSize(MAX_ACCOUNT_DOCUMENT_BYTES)} used ·{' '}
            {library?.documents.length ?? 0} of 50 documents · up to 20 versions
            each
          </p>
          {documents.length ? (
            <div className="document-grid">
              {documents.map((d) => (
                <Card className="document-card" key={d.id}>
                  <div className="document-paper" aria-hidden="true">
                    <FileText size={46} strokeWidth={1} />
                    <span>{d.versions[0]?.format.toUpperCase()}</span>
                  </div>
                  <div className="document-card-copy">
                    <span className="eyebrow">{d.category}</span>
                    <h2>{d.name}</h2>
                    <div className="document-tags">
                      {d.isDefault && (
                        <span className="pill mint-pill">Default resume</span>
                      )}
                      {d.archived && <span className="pill">Archived</span>}
                    </div>
                    <p className="muted">
                      {d.versions.length} version
                      {d.versions.length === 1 ? '' : 's'} · Updated{' '}
                      {formatDate(d.updatedAt)}
                    </p>
                    {d.versions[0]?.health !== 'available' && (
                      <p className="error-message">
                        Latest file {d.versions[0]?.health}
                      </p>
                    )}
                    <Button
                      variant="secondary"
                      onClick={(event) => {
                        documentOpener.current = event.currentTarget;
                        setSelected(d.id);
                      }}
                    >
                      Open document<span className="sr-only"> {d.name}</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={FileText}
                title={
                  library?.documents.length
                    ? 'No documents match.'
                    : 'Make a little room for your story.'
                }
                action={
                  library?.documents.length ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch('');
                        setCategory('All categories');
                        setState('All documents');
                        searchInput.current?.focus();
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button
                      onClick={(event) => {
                        uploadOpener.current = event.currentTarget;
                        setUploading(true);
                      }}
                    >
                      Upload your first resume
                    </Button>
                  )
                }
              >
                <p>
                  {library?.documents.length
                    ? 'Try another name, category, or archive filter.'
                    : 'Add a resume you already have. Each new version keeps the earlier copy safe.'}
                </p>
              </EmptyState>
            </Card>
          )}
          <p role="status">{notice}</p>
        </>
      )}
      <Card className="guidance-card">
        <span className="icon-tile mint">
          <ShieldCheck size={23} aria-hidden="true" />
        </span>
        <div>
          <h2>Your files, kept private.</h2>
          <p>
            Only your verified account can access these files through FATS.
            Saving a resume here does not send it to an employer.
          </p>
          <p className="field-hint">
            Settings JSON exports contain applications and interviews. They
            exclude document files and submitted resume links. A complete local
            operator archive is needed to recover your library.
          </p>
        </div>
      </Card>
      <Dialog.Root open={uploading} onOpenChange={setUploading}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              uploadOpener.current?.focus();
            }}
          >
            <div className="dialog-heading">
              <Dialog.Title className="dialog-title">
                Upload a document
              </Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close upload">
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted">
              A private copy for your account. Choose a category to keep things
              organized.
            </Dialog.Description>
            <UploadForm
              onSaved={() => {
                setUploading(false);
                setNotice('Document uploaded.');
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={Boolean(document)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content document-details"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (documentOpener.current?.isConnected)
                documentOpener.current.focus();
              else window.document.getElementById('page-title')?.focus();
            }}
          >
            <div className="dialog-heading">
              <Dialog.Title className="dialog-title">
                {document?.name}
              </Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close document">
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted">
              Organize this document and keep earlier versions close.
            </Dialog.Description>
            {document && (
              <DocumentEditor
                key={document.id}
                document={document}
                onDeleted={() => {
                  setSelected(null);
                  setNotice('Document deleted.');
                }}
                onPreview={setPreview}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <PdfPreview version={preview} close={() => setPreview(null)} />
    </>
  );
}
