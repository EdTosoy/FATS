'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { FilePenLine, Download, LockKeyhole, X } from 'lucide-react';
import { LocalPdfWorker } from '@/lib/pdf-tools-client';
import {
  PDF_TOOLS_LIMITS,
  emptyPdfEdits,
  editHistory,
  stepHistory,
  fitElement,
  validateLocalPdfFile,
  type PdfHistory,
  type PdfInfo,
  type PdfElement,
  type PdfEdits,
  type Point,
} from '@/lib/pdf-tools-model';
import { Button, Card, PageHeading, ActionLink, EmptyState } from './ui';
import { PdfToolsPage } from './pdf-tools-page';
import { PdfMark, SignaturePad, pdfMarkPng } from './pdf-tools-marks';

const newHistory = (): PdfHistory => ({
  past: [],
  present: emptyPdfEdits(),
  future: [],
});
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'This PDF could not be processed. Choose another file and retry.';
export function PdfToolsView() {
  const router = useRouter();
  const signatureOpener = useRef<HTMLButtonElement>(null);
  const discardOpener = useRef<HTMLElement | null>(null);
  const worker = useRef<LocalPdfWorker | null>(null),
    session = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{
    name: string;
    info: PdfInfo;
    preview: Uint8Array;
    revision: number;
  } | null>(null);
  const [history, setHistory] = useState<PdfHistory>(newHistory),
    [downloaded, setDownloaded] = useState('');
  const [page, setPage] = useState(0),
    [zoom, setZoom] = useState(1),
    [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [signatureOpen, setSignatureOpen] = useState(false),
    [signatureMode, setSignatureMode] = useState('type'),
    [signatureText, setSignatureText] = useState(''),
    [strokes, setStrokes] = useState<Point[][]>([]),
    [closeOpen, setCloseOpen] = useState(false);
  const [tool, setTool] = useState<PdfElement['kind']>('text'),
    [text, setText] = useState(''),
    [date, setDate] = useState('');
  const [appliedFields, setAppliedFields] = useState('{}');
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const edits = history.present,
    serialized = JSON.stringify(edits);
  const dirty =
    !!file &&
    serialized !== downloaded &&
    (edits.elements.length > 0 || Object.keys(edits.fields).length > 0);
  const selectedMark = edits.elements.find(
    (element) => element.id === selected,
  );
  useEffect(
    () => () => {
      session.current++;
      worker.current?.destroy();
    },
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    const guardLink = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest('a');
      if (
        !anchor ||
        anchor.hasAttribute('download') ||
        anchor.target === '_blank'
      )
        return;
      const target = new URL(anchor.href, location.href);
      if (
        target.origin !== location.origin ||
        target.protocol !== location.protocol ||
        (target.pathname === location.pathname &&
          target.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      discardOpener.current = anchor;
      setPendingNavigation(target.pathname + target.search + target.hash);
      setCloseOpen(true);
    };
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', guard);
      document.removeEventListener('click', guardLink, true);
    };
  }, [dirty]);
  const commit = (next: PdfEdits) => {
    setHistory((current) => editHistory(current, next));
    setNotice('');
  };
  const updateMark = (element: PdfElement) =>
    commit({
      ...edits,
      elements: edits.elements.map((item) =>
        item.id === element.id ? element : item,
      ),
    });
  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setError('');
    setNotice('');
    const generation = ++session.current;
    try {
      validateLocalPdfFile(chosen);
      setBusy(true);
      worker.current?.destroy();
      worker.current = new LocalPdfWorker();
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      if (generation !== session.current) return;
      const result = await worker.current.request(
        'open',
        emptyPdfEdits(),
        [],
        bytes,
      );
      if (generation !== session.current) return;
      setFile({
        name: chosen.name,
        info: result.info,
        preview: result.bytes,
        revision: 0,
      });
      setHistory(newHistory());
      setDownloaded('');
      setAppliedFields('{}');
      setPage(0);
      setZoom(1);
      setSelected(null);
    } catch (error) {
      if (generation === session.current) {
        setError(errorText(error));
        worker.current?.destroy();
        worker.current = null;
      }
    } finally {
      if (generation === session.current) setBusy(false);
    }
  }
  function closeFile() {
    session.current++;
    worker.current?.destroy();
    worker.current = null;
    setFile(null);
    setHistory(newHistory());
    setDownloaded('');
    setSelected(null);
    setError('');
    setNotice('');
    setCloseOpen(false);
    setBusy(false);
    setSignatureText('');
    setStrokes([]);
    setText('');
    setDate('');
    setTool('text');
    setSignatureMode('type');
    if (pendingNavigation) {
      const target = pendingNavigation;
      setPendingNavigation(null);
      router.push(target);
    }
  }
  async function applyFields() {
    if (!worker.current || !file) return;
    setBusy(true);
    setError('');
    try {
      const result = await worker.current.request('export', edits);
      setFile({ ...file, preview: result.bytes, revision: file.revision + 1 });
      setAppliedFields(JSON.stringify(edits.fields));
      setNotice('Form fields updated in the preview.');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!worker.current || !file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Require a successfully rendered current page before exposing download.
      if (
        !document.querySelector(
          '[data-testid="pdf-edit-page"][data-ready="true"]',
        )
      )
        throw new Error(
          'Wait for the page preview. If rendering fails, choose a simpler PDF.',
        );
      const images = [];
      for (const element of edits.elements)
        images.push({ element, png: await pdfMarkPng(element) });
      const result = await worker.current.request('export', edits, images);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.name
        .replace(/\.pdf$/i, '')
        .replace(/[\u0000-\u001f/\\]/g, '_')
        .slice(0, 120)}-completed.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDownloaded(serialized);
      setNotice(
        'Completed copy prepared for download. Check every page before sharing it.',
      );
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  function add(
    kind: PdfElement['kind'],
    value: string,
    signatureStrokes?: Point[][],
  ) {
    if (!file) return;
    if (edits.elements.length >= PDF_TOOLS_LIMITS.elements) {
      setError('Use at most 100 added elements. Remove a mark to add another.');
      return;
    }
    const geometry = file.info.pages[page];
    const element = fitElement(
      {
        id: crypto.randomUUID(),
        page,
        kind,
        text: value,
        strokes: signatureStrokes,
        x: 24,
        y: 36,
        width: kind === 'check' ? 24 : kind === 'signature' ? 190 : 180,
        height: kind === 'check' ? 24 : kind === 'signature' ? 64 : 30,
      },
      geometry,
    );
    commit({ ...edits, elements: [...edits.elements, element] });
    setSelected(element.id);
    setError('');
  }
  const signatureDraft: PdfElement = {
    id: 'draft',
    page,
    kind: 'signature',
    text: signatureText,
    x: 0,
    y: 0,
    width: 320,
    height: 120,
    ...(signatureMode === 'draw' ? { strokes } : {}),
  };
  return (
    <>
      <PageHeading
        eyebrow="A little help with paperwork"
        title="PDF Tools"
        description="Fill a form, add your personal mark, and take a completed copy with you."
        action={
          !file ? (
            <ActionLink href="/resumes" variant="secondary">
              Back to documents
            </ActionLink>
          ) : undefined
        }
      />
      <div className="pdf-local-note">
        <LockKeyhole size={17} aria-hidden="true" />
        <p>
          On your device, in this tab. PDF bytes and signature marks stay in
          your browser. Nothing is uploaded or saved to your FATS library.
        </p>
      </div>
      {!file && (
        <Card className="pdf-empty">
          <EmptyState
            icon={FilePenLine}
            title="Let’s finish that form."
            action={
              <label
                className={`button button-primary ${busy ? 'pdf-disabled' : ''}`}
              >
                Choose a local PDF
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept=".pdf,application/pdf"
                  aria-label="Choose a local PDF"
                  disabled={busy}
                  onChange={(event) => void openFile(event)}
                />
              </label>
            }
          >
            <p>
              Open an unsigned PDF up to 10 MiB and 50 pages. Your original
              stays unchanged.
            </p>
            <p>
              Standard fillable forms work best. Scans allow added marks only;
              there is no OCR.
            </p>
          </EmptyState>
        </Card>
      )}
      {error && (
        <p role="alert" className="error-message pdf-tools-error">
          {error}
        </p>
      )}
      <p role="status" className="pdf-tools-status">
        {busy ? 'Working locally…' : notice}
      </p>
      {file && (
        <>
          <Card className="pdf-file-bar">
            <div>
              <strong>{file.name}</strong>
              <p className="field-hint">
                {dirty
                  ? 'Changes not downloaded'
                  : downloaded
                    ? 'Current changes downloaded'
                    : 'Original open · no changes yet'}{' '}
                · Download before leaving this tab.
              </p>
            </div>
            <div className="document-actions">
              <Button
                variant="secondary"
                disabled={busy || !history.past.length}
                onClick={() => {
                  setHistory((current) => stepHistory(current, 'undo'));
                  setSelected(null);
                }}
              >
                Undo
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !history.future.length}
                onClick={() => {
                  setHistory((current) => stepHistory(current, 'redo'));
                  setSelected(null);
                }}
              >
                Redo
              </Button>
              <Button disabled={busy} onClick={() => void download()}>
                <Download size={16} aria-hidden="true" />
                Download completed PDF
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={(event) => {
                  discardOpener.current = event.currentTarget;
                  if (dirty) setCloseOpen(true);
                  else closeFile();
                }}
              >
                Close file
              </Button>
            </div>
          </Card>
          <div className="pdf-tools-layout">
            <Card className="pdf-controls">
              <fieldset disabled={busy}>
                {file.info.fields.length > 0 && (
                  <details open>
                    <summary>
                      Fill the form ({file.info.fields.length} fields)
                    </summary>
                    <p className="field-hint">
                      Fields on the current page are listed below. Apply your
                      changes to see them on the page.
                    </p>
                    {file.info.fields
                      .filter((field) => field.pages.includes(page))
                      .map((field) => (
                        <label key={field.name} className="pdf-field">
                          <span>
                            {field.name}
                            {field.readOnly ? ' (read-only)' : ''}
                          </span>
                          {field.kind === 'checkbox' ? (
                            <input
                              type="checkbox"
                              disabled={field.readOnly}
                              checked={Boolean(
                                Object.hasOwn(edits.fields, field.name)
                                  ? edits.fields[field.name]
                                  : field.value,
                              )}
                              onChange={(event) =>
                                commit({
                                  ...edits,
                                  fields: {
                                    ...edits.fields,
                                    [field.name]: event.target.checked,
                                  },
                                })
                              }
                            />
                          ) : field.kind === 'choice' ? (
                            <select
                              disabled={field.readOnly}
                              value={String(
                                Object.hasOwn(edits.fields, field.name)
                                  ? edits.fields[field.name]
                                  : field.value,
                              )}
                              onChange={(event) =>
                                commit({
                                  ...edits,
                                  fields: {
                                    ...edits.fields,
                                    [field.name]: event.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">Choose an option</option>
                              {field.options?.map((value) => (
                                <option key={value}>{value}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              disabled={field.readOnly}
                              value={String(
                                Object.hasOwn(edits.fields, field.name)
                                  ? edits.fields[field.name]
                                  : field.value,
                              )}
                              maxLength={field.maxLength}
                              onChange={(event) =>
                                commit({
                                  ...edits,
                                  fields: {
                                    ...edits.fields,
                                    [field.name]: event.target.value,
                                  },
                                })
                              }
                            />
                          )}
                        </label>
                      ))}
                    {JSON.stringify(edits.fields) !== appliedFields && (
                      <p className="field-hint">
                        Form changes are waiting to appear in the preview.
                      </p>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => void applyFields()}
                    >
                      Apply fields to preview
                    </Button>
                  </details>
                )}
                <h2>Add to this page</h2>
                <label className="pdf-field">
                  <span>What would you like to add?</span>
                  <select
                    value={tool}
                    onChange={(event) =>
                      setTool(event.target.value as PdfElement['kind'])
                    }
                  >
                    <option value="text">Text</option>
                    <option value="date">Date</option>
                    <option value="check">Checkmark</option>
                    <option value="signature">Personal signature</option>
                  </select>
                </label>
                {tool === 'text' && (
                  <label className="pdf-field">
                    <span>Text to add</span>
                    <input
                      maxLength={500}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      placeholder="e.g. Your full name"
                    />
                  </label>
                )}
                {tool === 'date' && (
                  <label className="pdf-field">
                    <span>Date to add</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                )}
                <Button
                  ref={signatureOpener}
                  variant="secondary"
                  disabled={
                    tool === 'text'
                      ? !text.trim()
                      : tool === 'date'
                        ? !/^\d{4}-\d{2}-\d{2}$/.test(date)
                        : false
                  }
                  onClick={() =>
                    tool === 'signature'
                      ? setSignatureOpen(true)
                      : add(
                          tool,
                          tool === 'text' ? text : tool === 'date' ? date : '',
                        )
                  }
                >
                  {tool === 'signature'
                    ? 'Create signature mark'
                    : 'Add to page'}
                </Button>
                <p className="field-hint">
                  New marks appear near the top left. Drag one into place or use
                  its position controls. Select a mark and use arrow keys to
                  nudge; Shift moves farther.
                </p>
                {selectedMark && (
                  <section className="pdf-selection" aria-label="Selected mark">
                    <h3>Selected {selectedMark.kind}</h3>
                    {['text', 'date', 'signature'].includes(
                      selectedMark.kind,
                    ) &&
                      !selectedMark.strokes && (
                        <label className="pdf-field">
                          <span>Edit mark text</span>
                          <input
                            maxLength={500}
                            value={selectedMark.text}
                            onChange={(event) =>
                              updateMark({
                                ...selectedMark,
                                text: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                    <div className="pdf-position-grid">
                      {(['x', 'y', 'width', 'height'] as const).map((key) => (
                        <label key={key} className="pdf-field">
                          <span>
                            {
                              {
                                x: 'Left',
                                y: 'Top',
                                width: 'Width',
                                height: 'Height',
                              }[key]
                            }
                          </span>
                          <input
                            type="number"
                            min={key === 'width' || key === 'height' ? 12 : 0}
                            step={1}
                            value={Math.round(selectedMark[key])}
                            onChange={(event) => {
                              const value = event.target.valueAsNumber;
                              if (Number.isFinite(value))
                                updateMark(
                                  fitElement(
                                    { ...selectedMark, [key]: value },
                                    file.info.pages[selectedMark.page],
                                  ),
                                );
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <label className="pdf-field">
                      <span>Move mark to page</span>
                      <select
                        value={selectedMark.page}
                        onChange={(event) => {
                          const target = Number(event.target.value);
                          updateMark(
                            fitElement(
                              { ...selectedMark, page: target },
                              file.info.pages[target],
                            ),
                          );
                          setPage(target);
                        }}
                      >
                        {file.info.pages.map((_, index) => (
                          <option key={index} value={index}>
                            Page {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        commit({
                          ...edits,
                          elements: edits.elements.filter(
                            (item) => item.id !== selectedMark.id,
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      Remove mark
                    </Button>
                  </section>
                )}
                <details>
                  <summary>
                    Marks on this page (
                    {
                      edits.elements.filter((element) => element.page === page)
                        .length
                    }
                    )
                  </summary>
                  <ul className="pdf-mark-list">
                    {edits.elements
                      .filter((element) => element.page === page)
                      .map((element, index) => (
                        <li key={element.id}>
                          <Button
                            variant="ghost"
                            aria-pressed={selected === element.id}
                            onClick={() => setSelected(element.id)}
                          >
                            {index + 1}. {element.kind}:{' '}
                            {element.text || 'drawn mark'}
                          </Button>
                        </li>
                      ))}
                  </ul>
                </details>
              </fieldset>
            </Card>
            <Card className="pdf-preview-card">
              <div className="pdf-page-toolbar">
                <Button
                  variant="secondary"
                  disabled={busy || page === 0}
                  onClick={() => {
                    setPage(page - 1);
                    setSelected(null);
                  }}
                >
                  Previous page
                </Button>
                <label>
                  Page
                  <select
                    aria-label="Page number"
                    value={page}
                    disabled={busy}
                    onChange={(event) => {
                      setPage(Number(event.target.value));
                      setSelected(null);
                    }}
                  >
                    {file.info.pages.map((_, index) => (
                      <option value={index} key={index}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                  of {file.info.pages.length}
                </label>
                <Button
                  variant="secondary"
                  disabled={busy || page === file.info.pages.length - 1}
                  onClick={() => {
                    setPage(page + 1);
                    setSelected(null);
                  }}
                >
                  Next page
                </Button>
                <label>
                  Zoom
                  <select
                    aria-label="Zoom"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  >
                    <option value={0.75}>75%</option>
                    <option value={1}>Fit page</option>
                    <option value={1.5}>150%</option>
                    <option value={2}>200%</option>
                  </select>
                </label>
              </div>
              <PdfToolsPage
                key={`${page}:${file.revision}`}
                bytes={file.preview}
                page={page}
                geometry={file.info.pages[page]}
                zoom={zoom}
                edits={edits}
                selected={selected}
                onSelect={setSelected}
                onMove={updateMark}
                disabled={busy}
              />
            </Card>
          </div>
        </>
      )}
      <p className="field-hint pdf-limit-note">
        A personal signature mark is a visual mark, not a cryptographically
        verified digital signature. FATS does not verify identity, certify legal
        validity, or guarantee employer acceptance. Check the recipient’s
        requirements. Downloaded forms and marks are flattened. Saving an edited
        copy into FATS is unavailable while required scanning is not
        operational.
      </p>
      <Dialog.Root
        open={signatureOpen}
        onOpenChange={(open) => {
          setSignatureOpen(open);
          if (!open) {
            setSignatureText('');
            setStrokes([]);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content pdf-signature-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              signatureOpener.current?.focus();
            }}
          >
            <div className="dialog-heading">
              <Dialog.Title className="dialog-title">
                Your personal signature mark
              </Dialog.Title>
              <Dialog.Close
                className="icon-button"
                aria-label="Close signature"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted">
              Make a visual mark for this file only. It is not identity
              verification or a certified digital signature. Check whether the
              recipient accepts it.
            </Dialog.Description>
            <label className="pdf-field">
              <span>How would you like to make it?</span>
              <select
                value={signatureMode}
                onChange={(event) => setSignatureMode(event.target.value)}
              >
                <option value="type">Type a signature</option>
                <option value="draw">Draw a signature</option>
              </select>
            </label>
            {signatureMode === 'type' ? (
              <label className="pdf-field">
                <span>Name for signature</span>
                <input
                  maxLength={100}
                  value={signatureText}
                  onChange={(event) => setSignatureText(event.target.value)}
                />
              </label>
            ) : (
              <>
                <SignaturePad strokes={strokes} onChange={setStrokes} />
                <Button variant="ghost" onClick={() => setStrokes([])}>
                  Clear drawing
                </Button>
              </>
            )}
            <p>Preview</p>
            <div className="pdf-signature-preview">
              <PdfMark element={signatureDraft} />
            </div>
            <Button
              disabled={
                signatureMode === 'type'
                  ? !signatureText.trim()
                  : !strokes.length
              }
              onClick={() => {
                add(
                  'signature',
                  signatureMode === 'type' ? signatureText : '',
                  signatureMode === 'draw' ? strokes : undefined,
                );
                setSignatureOpen(false);
                setSignatureText('');
                setStrokes([]);
              }}
            >
              Place signature on page {page + 1}
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={closeOpen}
        onOpenChange={(open) => {
          setCloseOpen(open);
          if (!open) setPendingNavigation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (discardOpener.current?.isConnected)
                discardOpener.current.focus();
              else fileInput.current?.focus();
            }}
          >
            <Dialog.Title className="dialog-title">
              Close without downloading?
            </Dialog.Title>
            <Dialog.Description>
              Your latest changes have not been downloaded. Closing clears this
              file and its signature marks from the editor.
            </Dialog.Description>
            <div className="document-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setCloseOpen(false);
                  setPendingNavigation(null);
                }}
              >
                Keep editing
              </Button>
              <Button onClick={closeFile}>Discard and close</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
