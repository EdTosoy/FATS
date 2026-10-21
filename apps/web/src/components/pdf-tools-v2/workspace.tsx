'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  Info,
  LockKeyhole,
  Minus,
  PanelLeftClose,
  PanelsTopLeft,
  Plus,
  X,
  PenLine,
  MousePointer2,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useTheme } from '../theme-provider';
import {
  usePdfToolsDocument,
  type LocalPdfDocument,
} from '@/lib/use-pdf-tools-document';
import type { ThemePreference } from '@/lib/theme';
import type { PdfPageInfo } from '@/lib/pdf-tools-model';
import { PageCanvas } from './page-canvas';
import { OrganizePages } from './organize-pages';
import { MergePdfsLauncher } from './merge-pdfs';
import { usePdfToolsQuickSign } from '@/lib/use-pdf-tools-quick-sign';
import { SignatureDialog } from './signature-dialog';
import { SignatureProperties } from './signature-properties';
import { usePdfToolsVisibleViewport } from '@/lib/use-pdf-tools-visible-viewport';
import { usePdfToolsFormPreview } from '@/lib/use-pdf-tools-form-preview';
import { markName, newPdfMark } from '@/lib/pdf-tools-editing';
import { DateDialog } from './date-dialog';
import { FieldProperties } from './field-properties';
import styles from './workspace.module.css';

const zooms = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
export function PdfToolsV2Workspace() {
  usePdfToolsVisibleViewport();
  const { document, loading, error, open, close } = usePdfToolsDocument();
  const { preference, choose, error: themeError } = useTheme();
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const router = useRouter();
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const leaveOpener = useRef<HTMLElement | null>(null);
  const requestLeave = (action: () => void) => {
    if (!dirty.current) {
      action();
      return;
    }
    leaveOpener.current = window.document.activeElement as HTMLElement;
    setLeave(() => action);
  };
  return (
    <div className={styles.workspace} data-pdf-v2-workspace>
      <a href="#pdf-v2-controls" className={styles.skip}>
        Skip to document controls
      </a>
      <header className={styles.header}>
        <Link
          href="/resumes/pdf-tools"
          aria-label="Return to current PDF Tools"
          className={styles.iconButton}
          onClick={(event) => {
            event.preventDefault();
            requestLeave(() => router.push('/resumes/pdf-tools'));
          }}
        >
          <ArrowLeft size={18} />
        </Link>
        <div className={styles.title}>
          <h1>
            PDF Tools <span>2.0 · Document editor</span>
          </h1>
          <p title={document?.name}>
            {document?.name ?? 'Local document workspace'}
          </p>
        </div>
        <span className={styles.privacy}>
          <LockKeyhole size={14} /> In this tab only
        </span>
        <label className={styles.appearance}>
          <span className={styles.srOnly}>Appearance</span>
          <select
            value={preference}
            onChange={(event) => choose(event.target.value as ThemePreference)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button
          type="button"
          className={styles.openButton}
          aria-label={document ? 'Replace PDF' : 'Open PDF'}
          onClick={() => input.current?.click()}
        >
          <FolderOpen size={17} />
          <span>{document ? 'Replace PDF' : 'Open PDF'}</span>
        </button>
        <button
          type="submit"
          form="pdf-v2-export"
          className={styles.downloadButton}
          aria-label="Download completed PDF"
          disabled={!document || !!loading}
        >
          <Download size={17} />
          <span>Download</span>
        </button>
        {!!(document || loading) && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close PDF"
            onClick={() => requestLeave(close)}
          >
            <X size={18} />
          </button>
        )}
        <input
          ref={input}
          type="file"
          tabIndex={-1}
          accept=".pdf,application/pdf"
          aria-label="Choose a local PDF"
          className={styles.srOnly}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) requestLeave(() => void open(file));
          }}
        />
      </header>
      {!document && (
        <div className={styles.phaseNotice}>
          <strong>Sign or complete a PDF</strong>
          <span>
            Fill standard form fields or add text, dates and personal marks.
            Your original stays unchanged.
          </span>
        </div>
      )}
      {(error || themeError) && (
        <p role="alert" className={styles.error}>
          {error || themeError}
        </p>
      )}
      {document ? (
        <DocumentWorkspace
          key={document.id}
          document={document}
          dirtyRef={dirty}
        />
      ) : (
        <main className={styles.empty} aria-busy={!!loading}>
          <div>
            <FileText size={36} strokeWidth={1.4} />
            <h2>{loading || 'Your document, with room to work.'}</h2>
            <p>
              {loading
                ? 'Your PDF is checked and rendered locally. You can cancel or choose another file.'
                : 'Open a local PDF, fill fields or add content, then download a completed copy. Your original stays unchanged.'}
            </p>
            {!loading && (
              <div className={styles.emptyActions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => input.current?.click()}
                >
                  <FolderOpen size={18} /> Open a PDF
                </button>
                <MergePdfsLauncher />
              </div>
            )}
            <p className={styles.limits}>
              PDF 1.0–1.7 · Up to 10 MiB and 50 pages
              <br />
              Plain, unsigned, unencrypted PDFs with supported standard fields.
            </p>
            <p className={styles.limits}>
              Choose files you trust. Local checks are not malware scanning.
              <br />
              Nothing is uploaded or saved to Career Vault.
            </p>
          </div>
        </main>
      )}
      <footer className={styles.footer}>
        <span>Development candidate</span>
        <p role="status">
          {loading ||
            (document
              ? `Original: ${document.info.pages.length} ${document.info.pages.length === 1 ? 'page' : 'pages'} open · Original unchanged · Local only`
              : 'Choose a local PDF to begin.')}
        </p>
        <Link
          href="/design/pdf-tools"
          onClick={(event) => {
            event.preventDefault();
            requestLeave(() => router.push('/design/pdf-tools'));
          }}
        >
          Compare design prototype
        </Link>
      </footer>
      <Dialog.Root
        open={!!leave}
        onOpenChange={(open) => {
          if (!open) setLeave(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.modal}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              leaveOpener.current?.focus();
            }}
          >
            <Dialog.Title>Keep your changes?</Dialog.Title>
            <Dialog.Description>
              This tab has changes that have not been handed to your browser as
              a completed PDF. Leaving discards this tab’s edits.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => setLeave(null)}>
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = leave;
                  setLeave(null);
                  action?.();
                }}
              >
                Discard changes and continue
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function DocumentWorkspace({
  document,
  dirtyRef,
}: {
  document: LocalPdfDocument;
  dirtyRef: { current: boolean };
}) {
  const sign = usePdfToolsQuickSign(document);
  const formPreview = usePdfToolsFormPreview(
    document,
    sign.history.present.fields,
  );
  const [mode, setMode] = useState<'quick' | 'edit'>('quick');
  const [signatureKind, setSignatureKind] = useState<'signature' | 'initials'>(
    'signature',
  );
  const [dateOpen, setDateOpen] = useState(false);
  const [fieldName, setFieldName] = useState<string | null>(null);
  const selectedField = document.info.fields.find(
    (field) => field.name === fieldName,
  );
  const contentsFocus = useRef<(() => void) | null>(null);
  const placeButton = useRef<HTMLButtonElement>(null);
  const signatureButton = useRef<HTMLButtonElement>(null);
  const signatureOpener = useRef<HTMLElement | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const marksOpener = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    dirtyRef.current = sign.dirty;
    return () => {
      dirtyRef.current = false;
    };
  }, [dirtyRef, sign.dirty]);
  const [selectedPage, setPage] = useState(0);
  const pages = sign.pages;
  const page = pages.some((item) => item.source === selectedPage)
    ? selectedPage
    : pages[0].source;
  const position = (source: number) =>
    pages.findIndex((item) => item.source === source) + 1;
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const organizeOpener = useRef<HTMLElement | null>(null);
  const openOrganizer = (opener: HTMLElement) => {
    sign.finishEditing();
    organizeOpener.current = opener;
    setOrganizeOpen(true);
  };
  const [view, setView] = useState(() =>
    window.matchMedia('(max-width: 760px)').matches ? 'fit-width' : 'fit-page',
  );
  const [rail, setRail] = useState(true);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [visible, setVisible] = useState<number[]>([0]);
  const [size, setSize] = useState({ width: 640, height: 640, dpr: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const papers = useRef(new Map<number, HTMLElement>());
  const pendingPage = useRef<number | null>(null);
  const scrollIntent = useRef(false);
  const pageOpener = useRef<HTMLButtonElement>(null);
  const infoOpener = useRef<HTMLButtonElement | null>(null);
  const anchor = useRef<{ page: number; x: number; y: number } | null>(null);
  const frame = useRef(0);
  const geometry = sign.info.pages[page];
  const pageScale = (geometry: PdfPageInfo) =>
    view === 'fit-width'
      ? Math.min(2, Math.max(0.05, (size.width - 48) / geometry.viewWidth))
      : view === 'fit-page'
        ? Math.min(
            2,
            Math.max(
              0.05,
              Math.min(
                (size.width - 48) / geometry.viewWidth,
                (size.height - 76) / geometry.viewHeight,
              ),
            ),
          )
        : Number(view);
  const scale = pageScale(geometry);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
        dpr: window.devicePixelRatio,
      });
    });
    observer.observe(element);
    const intersecting = new Set<number>();
    const pagesObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (entry.isIntersecting) intersecting.add(index);
          else intersecting.delete(index);
        }
        setVisible([...intersecting]);
      },
      { root: element },
    );
    for (const paper of papers.current.values()) pagesObserver.observe(paper);
    return () => {
      observer.disconnect();
      pagesObserver.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [pages]);
  useLayoutEffect(() => {
    const container = stage.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (pendingPage.current !== null) {
      const paper = papers.current.get(pendingPage.current);
      if (paper) {
        const rect = paper.getBoundingClientRect();
        container.scrollBy({
          top: rect.top - bounds.top - 36,
          left: rect.left + rect.width / 2 - bounds.left - bounds.width / 2,
        });
      }
      pendingPage.current = null;
      anchor.current = null;
    } else if (anchor.current) {
      const point = anchor.current;
      const rect = papers.current.get(point.page)?.getBoundingClientRect();
      if (rect)
        container.scrollBy({
          left:
            rect.left + rect.width * point.x - bounds.left - bounds.width / 2,
          top:
            rect.top + rect.height * point.y - bounds.top - bounds.height / 2,
        });
      anchor.current = null;
    }
  }, [scale, page, pages]);
  const changeView = (next: string) => {
    cancelAnimationFrame(frame.current);
    scrollIntent.current = false;
    const bounds = stage.current?.getBoundingClientRect();
    const rect = papers.current.get(page)?.getBoundingClientRect();
    if (bounds && rect)
      anchor.current = {
        page,
        x: (bounds.left + bounds.width / 2 - rect.left) / rect.width,
        y: (bounds.top + bounds.height / 2 - rect.top) / rect.height,
      };
    setView(next);
  };
  const selectPage = (index: number) => {
    sign.finishEditing();
    setFieldName(null);
    cancelAnimationFrame(frame.current);
    sign.setSelected(null);
    sign.setPropertiesOpen(false);
    scrollIntent.current = false;
    pendingPage.current = index;
    setPage(index);
    setPagesOpen(false);
    // Same-page selection still needs to reveal it after manual scrolling.
    if (index === page) {
      papers.current
        .get(index)
        ?.scrollIntoView({ block: 'start', inline: 'center' });
      pendingPage.current = null;
    }
  };
  const stepZoom = (direction: number) => {
    const next =
      direction > 0
        ? zooms.find((value) => value > scale + 0.001)
        : [...zooms].reverse().find((value) => value < scale - 0.001);
    if (next !== undefined) changeView(String(next));
  };
  const thumbnails = (dialog: boolean) => (
    <div className={styles.thumbnails}>
      {pages.map(({ source: index }) => (
        <button
          type="button"
          key={index}
          className={styles.thumbnail}
          aria-label={`Go to page ${position(index)}`}
          aria-current={page === index ? 'page' : undefined}
          onClick={() => selectPage(index)}
        >
          <span
            className={styles.thumbPaper}
            style={{
              aspectRatio: `${sign.info.pages[index].viewWidth}/${sign.info.pages[index].viewHeight}`,
            }}
          >
            <PageCanvas
              document={formPreview.document}
              index={index}
              scale={84 / sign.info.pages[index].viewWidth}
              geometry={sign.info.pages[index]}
              position={position(index)}
              marks={sign.history.present.elements.filter(
                (mark) => mark.page === index,
              )}
              thumbnail
            />
          </span>
          <span>
            <b>{position(index)}</b> Page {position(index)}
            {dialog && page === index ? ' · Current' : ''}
          </span>
        </button>
      ))}
    </div>
  );
  const showSignature = (kind: 'signature' | 'initials' = 'signature') => {
    sign.finishEditing();
    setFieldName(null);
    setSignatureKind(kind);
    scrollIntent.current = false;
    cancelAnimationFrame(frame.current);
    signatureOpener.current = window.document.activeElement as HTMLElement;
    sign.setPending(null);
    sign.setSignatureOpen(true);
  };
  const pickTool = (
    mark: ReturnType<typeof newPdfMark>,
    preserveOpener = false,
  ) => {
    sign.finishEditing();
    if (!preserveOpener)
      signatureOpener.current = window.document.activeElement as HTMLElement;
    sign.setPending(mark);
    sign.setSelected(null);
    sign.setPropertiesOpen(false);
    setFieldName(null);
    sign.setNotice(
      `${markName(mark)} ready. Click the page or use Place on page.`,
    );
    requestAnimationFrame(() => placeButton.current?.focus());
  };
  const inspectField = (name: string) => {
    scrollIntent.current = false;
    cancelAnimationFrame(frame.current);
    sign.finishEditing();
    sign.setPending(null);
    sign.setSelected(null);
    setFieldName(name);
  };
  const inspectMark = (id: string) => {
    sign.finishEditing();
    setFieldName(null);
    sign.setSelected(id);
    sign.setPropertiesOpen(window.matchMedia('(min-width: 761px)').matches);
    if (
      sign.history.present.elements.find((mark) => mark.id === id)?.kind ===
      'text'
    )
      sign.startTextEditing(id);
  };
  const editOnPage =
    !window.matchMedia('(max-width: 760px)').matches &&
    scale >= 0.75 &&
    !sign.selectedMark?.contentRotation;
  return (
    <>
      <form
        id="pdf-v2-export"
        className={styles.signToolbar}
        aria-label="PDF editing controls"
        onSubmit={(event) => {
          event.preventDefault();
          if (formPreview.updating || formPreview.error) {
            sign.setError(
              'Wait for the form preview or correct its values before downloading.',
            );
            return;
          }
          void sign.download((index) => {
            scrollIntent.current = false;
            pendingPage.current = index;
            setPage(index);
          });
        }}
        onKeyDown={(event) => {
          if (
            !(event.ctrlKey || event.metaKey) ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(
              (event.target as HTMLElement).tagName,
            )
          )
            return;
          if (
            event.key.toLowerCase() === 'z' ||
            event.key.toLowerCase() === 'y'
          ) {
            event.preventDefault();
            sign.historyStep(
              event.shiftKey || event.key.toLowerCase() === 'y'
                ? 'redo'
                : 'undo',
            );
          }
        }}
      >
        <div
          className={styles.modeButtons}
          role="group"
          aria-label="Editing mode"
        >
          {(['quick', 'edit'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                sign.finishEditing();
                sign.setPending(null);
                sign.setSelected(null);
                sign.setPropertiesOpen(false);
                setFieldName(null);
                setMode(value);
              }}
            >
              {value === 'quick' ? 'Quick Sign' : 'Edit PDF'}
            </button>
          ))}
        </div>
        <div className={styles.signTools}>
          <button
            type="button"
            aria-pressed={!sign.pending}
            aria-label="Select"
            disabled={sign.busy}
            onClick={() => {
              sign.finishEditing();
              setFieldName(null);
              sign.setPending(null);
              sign.setSelected(null);
              sign.setPropertiesOpen(false);
            }}
          >
            <MousePointer2 size={17} /> Select
          </button>
          <button
            ref={signatureButton}
            type="button"
            disabled={sign.busy}
            aria-pressed={sign.pending?.kind === 'signature'}
            onClick={() => showSignature()}
          >
            <PenLine size={17} /> Signature
          </button>
          <button
            type="button"
            disabled={sign.busy}
            aria-pressed={sign.pending?.kind === 'date'}
            onClick={() => {
              sign.finishEditing();
              signatureOpener.current = window.document
                .activeElement as HTMLElement;
              sign.setPending(null);
              setDateOpen(true);
            }}
          >
            Date
          </button>
          {mode === 'edit' && (
            <>
              <button
                type="button"
                disabled={sign.busy}
                aria-pressed={sign.pending?.kind === 'text'}
                onClick={() => pickTool(newPdfMark('text', geometry))}
              >
                Text
              </button>
              <button
                type="button"
                disabled={sign.busy}
                aria-pressed={sign.pending?.kind === 'initials'}
                onClick={() => showSignature('initials')}
              >
                Initials
              </button>
              <button
                type="button"
                disabled={sign.busy}
                aria-pressed={sign.pending?.kind === 'check'}
                onClick={() => pickTool(newPdfMark('check', geometry))}
              >
                Checkmark
              </button>
            </>
          )}
        </div>
        <div className={styles.historyButtons}>
          <button
            type="button"
            aria-label="Undo"
            disabled={sign.busy || !sign.history.past.length}
            onClick={() => sign.historyStep('undo')}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            aria-label="Redo"
            disabled={sign.busy || !sign.history.future.length}
            onClick={() => sign.historyStep('redo')}
          >
            <Redo2 size={17} />
          </button>
        </div>
      </form>
      <main
        className={styles.document}
        data-placing={!!sign.pending}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            sign.finishEditing();
            setFieldName(null);
            sign.setPending(null);
            sign.setSelected(null);
            sign.setPropertiesOpen(false);
          }
          if (
            !(event.ctrlKey || event.metaKey) ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(
              (event.target as HTMLElement).tagName,
            )
          )
            return;
          if (
            event.key.toLowerCase() === 'z' ||
            event.key.toLowerCase() === 'y'
          ) {
            event.preventDefault();
            sign.historyStep(
              event.shiftKey || event.key.toLowerCase() === 'y'
                ? 'redo'
                : 'undo',
            );
          }
        }}
      >
        {rail && (
          <aside className={styles.rail} aria-label="Page thumbnails">
            <div className={styles.railTitle}>
              Pages <span>{pages.length}</span>
            </div>
            <button
              type="button"
              className={styles.organizeEntry}
              onClick={(event) => openOrganizer(event.currentTarget)}
            >
              Organize pages
            </button>
            {thumbnails(false)}
          </aside>
        )}
        <section className={styles.main} aria-label="Document workspace">
          <nav
            id="pdf-v2-controls"
            className={styles.controls}
            aria-label="Document controls"
            tabIndex={-1}
          >
            <div className={styles.controlGroup}>
              <button
                id="pdf-v2-marks"
                ref={marksOpener}
                type="button"
                aria-label="Page contents"
                onClick={() => setContentsOpen(true)}
              >
                <PenLine size={17} />
              </button>
              <button
                type="button"
                className={styles.desktopRail}
                aria-label={
                  rail ? 'Collapse page thumbnails' : 'Expand page thumbnails'
                }
                onClick={() => setRail((value) => !value)}
              >
                {rail ? (
                  <PanelLeftClose size={17} />
                ) : (
                  <PanelsTopLeft size={17} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPagesOpen(true)}
                aria-label="Choose a page"
                ref={pageOpener}
              >
                <PanelsTopLeft size={17} />
                <span className={styles.pagesLabel}>Pages</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  infoOpener.current = event.currentTarget;
                  setInfoOpen(true);
                }}
                aria-label="Document information"
                className={styles.desktopInfo}
              >
                <Info size={17} />
              </button>
            </div>
            <div className={styles.controlGroup}>
              <button
                type="button"
                aria-label="Previous page"
                disabled={position(page) === 1}
                onClick={() => selectPage(pages[position(page) - 2].source)}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                <span className={styles.srOnly}>Current page</span>
                <select
                  value={page}
                  onChange={(event) => selectPage(Number(event.target.value))}
                >
                  {pages.map(({ source: index }) => (
                    <option value={index} key={index}>
                      {position(index)}
                    </option>
                  ))}
                </select>
              </label>
              <span className={styles.pageCount}>/ {pages.length}</span>
              <button
                type="button"
                aria-label="Next page"
                disabled={position(page) === pages.length}
                onClick={() => selectPage(pages[position(page)].source)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className={styles.controlGroup}>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={scale <= 0.25}
                onClick={() => stepZoom(-1)}
              >
                <Minus size={17} />
              </button>
              <label>
                <span className={styles.srOnly}>PDF zoom</span>
                <select
                  value={view}
                  onChange={(event) => changeView(event.target.value)}
                >
                  <option value="fit-page">Fit page</option>
                  <option value="fit-width">Fit width</option>
                  {zooms.map((value) => (
                    <option key={value} value={String(value)}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={scale >= 2}
                onClick={() => stepZoom(1)}
              >
                <Plus size={17} />
              </button>
            </div>
          </nav>
          <div
            ref={stage}
            className={styles.stage}
            tabIndex={0}
            aria-label="PDF document pages; scroll to navigate"
            onWheel={() => {
              scrollIntent.current = true;
            }}
            onTouchMove={() => {
              scrollIntent.current = true;
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget)
                scrollIntent.current = true;
            }}
            onKeyDown={(event) => {
              if (
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(
                  (event.target as HTMLElement).tagName,
                )
              )
                return;
              if (
                [
                  'ArrowDown',
                  'ArrowUp',
                  'PageDown',
                  'PageUp',
                  'Home',
                  'End',
                  ' ',
                ].includes(event.key)
              )
                scrollIntent.current = true;
            }}
            onScroll={() => {
              if (!scrollIntent.current) return;
              cancelAnimationFrame(frame.current);
              frame.current = requestAnimationFrame(() => {
                const container = stage.current;
                if (
                  !container ||
                  pendingPage.current !== null ||
                  !scrollIntent.current ||
                  sign.signatureOpen
                )
                  return;
                const bounds = container.getBoundingClientRect();
                const target = bounds.top + Math.min(bounds.height / 2, 250);
                let best = page,
                  distance = Infinity;
                for (const [index, paper] of papers.current) {
                  const rect = paper.getBoundingClientRect();
                  const delta = Math.max(
                    rect.top - target,
                    target - rect.bottom,
                    0,
                  );
                  if (delta < distance) {
                    distance = delta;
                    best = index;
                  }
                }
                if (best !== page) {
                  sign.finishEditing();
                  sign.setSelected(null);
                  sign.setPropertiesOpen(false);
                  setFieldName(null);
                }
                setPage(best);
              });
            }}
          >
            <div className={styles.pageStack}>
              {pages.map(({ source: index }) => {
                const info = sign.info.pages[index];
                const renderedScale = pageScale(info);
                return (
                  <figure key={index} className={styles.figure}>
                    <figcaption>
                      <span>Page {position(index)}</span>
                      <span>
                        {Math.round(renderedScale * 100)}% ·{' '}
                        {Object.keys(sign.history.present.fields).length
                          ? 'Form preview'
                          : 'Original PDF'}
                      </span>
                    </figcaption>
                    <div
                      ref={(element) => {
                        if (element) papers.current.set(index, element);
                        else papers.current.delete(index);
                      }}
                      className={styles.paper}
                      data-page-index={index}
                      data-current={page === index}
                      role="group"
                      aria-label={`Page ${position(index)} of ${pages.length}`}
                      style={{
                        width: info.viewWidth * renderedScale,
                        height: info.viewHeight * renderedScale,
                      }}
                      onPointerDown={() => setPage(index)}
                    >
                      {Math.abs(position(index) - position(page)) <= 1 ||
                      visible.includes(index) ? (
                        <PageCanvas
                          document={formPreview.document}
                          index={index}
                          scale={renderedScale}
                          dpr={size.dpr}
                          geometry={info}
                          position={position(index)}
                          onPlace={
                            sign.pending && !sign.busy
                              ? (point) => sign.place(index, point)
                              : undefined
                          }
                          interactions={{
                            marks: sign.history.present.elements.filter(
                              (mark) => mark.page === index,
                            ),
                            selected: sign.selected,
                            disabled: sign.busy || !!sign.pending,
                            onSelect: (id) => {
                              sign.finishEditing();
                              setFieldName(null);
                              sign.setSelected(id);
                            },
                            onInspect: inspectMark,
                            onChange: sign.change,
                            onDelete: sign.remove,
                            announce: sign.setNotice,
                            editingText: sign.editingText,
                            editOnPage:
                              !window.matchMedia('(max-width: 760px)')
                                .matches &&
                              renderedScale >= 0.75 &&
                              !sign.selectedMark?.contentRotation,
                            onBeginEdit: sign.beginEdit,
                            onDraft: sign.draftText,
                            onCommit: sign.commitEdit,
                            onDone: () => {
                              sign.finishEditing();
                              if (sign.selected) sign.focusMark(sign.selected);
                            },
                            onBlank: () => {
                              sign.finishEditing();
                              sign.setSelected(null);
                              sign.setPropertiesOpen(false);
                              setFieldName(null);
                            },
                          }}
                          forms={
                            mode === 'edit'
                              ? {
                                  info: sign.info,
                                  values: sign.history.present.fields,
                                  disabled: sign.busy || !!sign.pending,
                                  selected: fieldName,
                                  onInspect: (name) => {
                                    if (page !== index) selectPage(index);
                                    inspectField(name);
                                  },
                                  onChoose: (target) => {
                                    selectPage(target);
                                    setContentsOpen(true);
                                  },
                                  onChange: sign.fieldChange,
                                }
                              : undefined
                          }
                        />
                      ) : (
                        <span className={styles.pageMessage} aria-hidden="true">
                          Page {position(index)}
                        </span>
                      )}
                    </div>
                  </figure>
                );
              })}
            </div>
          </div>
          <p className={styles.documentStatus} role="status">
            Page {position(page)} of {pages.length} · {Math.round(scale * 100)}%
            · {Math.round(geometry.viewWidth)} ×{' '}
            {Math.round(geometry.viewHeight)} pt
            <button
              type="button"
              className={styles.mobileInfo}
              aria-label="Document information"
              onClick={(event) => {
                infoOpener.current = event.currentTarget;
                setInfoOpen(true);
              }}
            >
              <Info size={16} />
            </button>
          </p>
          {mode === 'edit' && (
            <p className={styles.editHint}>
              Fill highlighted fields or add text and marks. Original printed
              text is not editable.
            </p>
          )}
          {formPreview.updating && (
            <p role="status" className={styles.editHint}>
              Updating form preview…
            </p>
          )}
          {formPreview.error && (
            <div className={styles.signError} role="alert">
              {formPreview.error}{' '}
              <button type="button" onClick={formPreview.retry}>
                Retry form preview
              </button>
            </div>
          )}
          {mode === 'quick' &&
            !(
              sign.selectedMark &&
              sign.propertiesOpen &&
              window.matchMedia('(max-width: 760px)').matches
            ) && (
              <div className={styles.signGuide}>
                <div>
                  <ol aria-label="Signing steps">
                    <li
                      aria-current={
                        !sign.history.present.elements.length && !sign.pending
                          ? 'step'
                          : undefined
                      }
                    >
                      1 Create
                    </li>
                    <li aria-current={sign.pending ? 'step' : undefined}>
                      2 Place
                    </li>
                    <li
                      aria-current={
                        sign.history.present.elements.length && !sign.pending
                          ? 'step'
                          : undefined
                      }
                    >
                      3 Download
                    </li>
                  </ol>
                  <p>
                    {sign.pending
                      ? 'Tap or click once on the page. Nothing is placed while you scroll.'
                      : sign.history.present.elements.length
                        ? 'Review every page and the signature placement before downloading.'
                        : 'Make a signature, then choose where to place it.'}
                  </p>
                </div>
                {sign.pending ? (
                  <div className={styles.guideActions}>
                    <button
                      ref={placeButton}
                      type="button"
                      className={styles.primary}
                      onClick={() => sign.placeDefault(page)}
                    >
                      Place on page {position(page)}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sign.setPending(null);
                        signatureOpener.current?.focus();
                      }}
                    >
                      Cancel placement
                    </button>
                  </div>
                ) : sign.history.present.elements.length ? (
                  <button
                    type="submit"
                    form="pdf-v2-export"
                    className={styles.primary}
                    disabled={sign.busy}
                  >
                    <Download size={17} /> Download copy
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={sign.busy}
                    onClick={() => showSignature()}
                  >
                    <PenLine size={17} /> Create signature
                  </button>
                )}
              </div>
            )}
          {mode === 'edit' && sign.pending && (
            <div className={styles.signGuide}>
              <p>
                {markName(sign.pending)}: click or tap the page to place once.
              </p>
              <div className={styles.guideActions}>
                <button
                  ref={placeButton}
                  type="button"
                  className={styles.primary}
                  onClick={() => sign.placeDefault(page)}
                >
                  Place on page {position(page)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sign.setPending(null);
                    signatureOpener.current?.focus();
                  }}
                >
                  Cancel placement
                </button>
              </div>
            </div>
          )}
          {(sign.error || sign.notice) &&
            (!sign.error || sign.error !== formPreview.error) && (
              <div
                className={sign.error ? styles.signError : styles.signStatus}
                role={sign.error ? 'alert' : 'status'}
                aria-live="polite"
              >
                {sign.error || sign.notice}
              </div>
            )}
        </section>
        {sign.selectedMark && (
          <SignatureProperties
            mark={sign.selectedMark}
            page={sign.info.pages[sign.selectedMark.page]}
            expanded={sign.propertiesOpen}
            busy={sign.busy}
            onExpand={(value) => {
              sign.setPropertiesOpen(value);
              if (!value) {
                sign.finishEditing();
                sign.focusMark(sign.selectedMark!.id);
              }
            }}
            onChange={sign.change}
            onDelete={() => sign.remove(sign.selectedMark!.id)}
            announce={sign.setNotice}
            editing={sign.editingText === sign.selectedMark.id}
            contextualText={!editOnPage}
            onEdit={() => sign.startTextEditing(sign.selectedMark!.id)}
            onBegin={sign.beginEdit}
            onDraft={sign.draftText}
            onCommit={sign.commitEdit}
            onDone={() => {
              sign.finishEditing();
              sign.focusMark(sign.selectedMark!.id);
            }}
          />
        )}
        {selectedField && (
          <FieldProperties
            field={selectedField}
            value={
              Object.hasOwn(sign.history.present.fields, selectedField.name)
                ? sign.history.present.fields[selectedField.name]
                : selectedField.value
            }
            busy={sign.busy}
            onBegin={sign.beginEdit}
            onCommit={sign.commitEdit}
            onChange={sign.fieldChange}
            onDone={() => {
              sign.finishEditing();
              setFieldName(null);
              requestAnimationFrame(() =>
                (
                  window.document.querySelector<HTMLElement>(
                    `[data-field-control="${CSS.escape(selectedField.name)}"]`,
                  ) ?? marksOpener.current
                )?.focus(),
              );
            }}
          />
        )}
        {sign.signatureOpen && (
          <SignatureDialog
            kind={signatureKind}
            page={geometry}
            onCancel={() => {
              sign.setSignatureOpen(false);
              signatureOpener.current?.focus();
            }}
            onConfirm={(mark) => {
              scrollIntent.current = false;
              cancelAnimationFrame(frame.current);
              sign.setSignatureOpen(false);
              sign.setPending(mark);
              sign.setSelected(null);
              sign.setPropertiesOpen(false);
              sign.setNotice(
                `${markName(mark)} ready. Choose a position or use Place on page.`,
              );
              requestAnimationFrame(() => placeButton.current?.focus());
            }}
          />
        )}
        {dateOpen && (
          <DateDialog
            onCancel={() => {
              setDateOpen(false);
              signatureOpener.current?.focus();
            }}
            onConfirm={(value, format) => {
              setDateOpen(false);
              pickTool(newPdfMark('date', geometry, { value, format }), true);
            }}
          />
        )}
        <Dialog.Root open={contentsOpen} onOpenChange={setContentsOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content
              className={styles.modal}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (contentsFocus.current) {
                  const focus = contentsFocus.current;
                  contentsFocus.current = null;
                  focus();
                } else marksOpener.current?.focus();
              }}
            >
              <div className={styles.modalHeader}>
                <Dialog.Title>Page contents</Dialog.Title>
                <Dialog.Close aria-label="Close page contents">
                  <X size={17} />
                </Dialog.Close>
              </div>
              <Dialog.Description>
                Fields and added marks on page {position(page)}. Choose a name
                to edit it without clicking document coordinates. PDF reading
                and tagging are not included.
              </Dialog.Description>
              {mode === 'edit' &&
                document.info.fields
                  .filter((field) => field.pages.includes(page))
                  .map((field) => (
                    <button
                      type="button"
                      key={field.name}
                      onClick={() => {
                        inspectField(field.name);
                        contentsFocus.current = () =>
                          window.document
                            .querySelector<HTMLElement>(
                              '[aria-label="Selected form field"] input, [aria-label="Selected form field"] select',
                            )
                            ?.focus();
                        setContentsOpen(false);
                      }}
                    >
                      {field.name}
                      {field.required ? ' · Required' : ''}
                      {field.readOnly ? ' · Read-only' : ''}
                    </button>
                  ))}
              {sign.history.present.elements
                .filter((mark) => mark.page === page)
                .map((mark) => (
                  <button
                    type="button"
                    key={mark.id}
                    onClick={() => {
                      sign.finishEditing();
                      setFieldName(null);
                      sign.setSelected(mark.id);
                      sign.setPropertiesOpen(true);
                      contentsFocus.current = () => {
                        if (mark.kind === 'text')
                          sign.startTextEditing(mark.id);
                        else sign.focusMark(mark.id);
                      };
                      setContentsOpen(false);
                    }}
                  >
                    {mark.text ||
                      `${markName(mark)}${mark.strokes ? ' · Drawn' : ''}`}
                  </button>
                ))}
              {!sign.history.present.elements.some(
                (mark) => mark.page === page,
              ) && <p>No added marks on this page.</p>}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <OrganizePages
          document={document}
          edits={sign.history.present}
          open={organizeOpen}
          onOpenChange={(open) => {
            if (open) sign.finishEditing();
            setOrganizeOpen(open);
          }}
          pages={pages}
          info={sign.info}
          selected={page}
          onSelect={selectPage}
          returnFocus={() => organizeOpener.current?.focus()}
          busy={sign.busy}
          undo={!!sign.history.past.length}
          redo={!!sign.history.future.length}
          onHistory={(direction) => {
            setFieldName(null);
            scrollIntent.current = false;
            sign.historyStep(direction);
          }}
          notice={sign.notice}
          onMove={(source, to) => {
            scrollIntent.current = false;
            pendingPage.current = source;
            sign.organize({ kind: 'move', source, to });
          }}
          onRotate={(source, clockwise) => {
            setFieldName(null);
            scrollIntent.current = false;
            pendingPage.current = source;
            sign.organize({ kind: 'rotate', source, clockwise });
          }}
          onRemove={(source) => {
            setFieldName(null);
            scrollIntent.current = false;
            const index = pages.findIndex((item) => item.source === source);
            const next = pages[index + 1] ?? pages[index - 1];
            sign.organize({ kind: 'remove', source });
            if (next) {
              setPage(next.source);
              pendingPage.current = next.source;
            }
          }}
          thumbnail={(source, number) => (
            <span
              className={styles.thumbPaper}
              style={{
                aspectRatio: `${sign.info.pages[source].viewWidth}/${sign.info.pages[source].viewHeight}`,
              }}
            >
              <PageCanvas
                document={formPreview.document}
                index={source}
                position={number}
                geometry={sign.info.pages[source]}
                scale={120 / sign.info.pages[source].viewWidth}
                thumbnail
                marks={sign.history.present.elements.filter(
                  (mark) => mark.page === source,
                )}
              />
            </span>
          )}
        />
        <Dialog.Root open={pagesOpen} onOpenChange={setPagesOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content
              className={styles.modal}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                pageOpener.current?.focus();
              }}
            >
              <div className={styles.modalHeader}>
                <Dialog.Title>Choose a page</Dialog.Title>
                <Dialog.Close aria-label="Close page chooser">
                  <X size={18} />
                </Dialog.Close>
              </div>
              <Dialog.Description>
                Select a thumbnail to show that page. Your original stays
                unchanged.
              </Dialog.Description>
              <button
                type="button"
                className={styles.organizeEntry}
                onClick={() => {
                  setPagesOpen(false);
                  openOrganizer(pageOpener.current!);
                }}
              >
                Organize pages
              </button>
              {thumbnails(true)}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={infoOpen} onOpenChange={setInfoOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content
              className={styles.modal}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                infoOpener.current?.focus();
              }}
            >
              <div className={styles.modalHeader}>
                <Dialog.Title>Document information</Dialog.Title>
                <Dialog.Close aria-label="Close document information">
                  <X size={18} />
                </Dialog.Close>
              </div>
              <Dialog.Description>
                This PDF stays in this browser tab. Closing releases the
                document; your original file stays unchanged.
              </Dialog.Description>
              <dl className={styles.info}>
                <dt>File</dt>
                <dd>{document.name}</dd>
                <dt>Size</dt>
                <dd>{(document.size / 1024).toFixed(1)} KiB</dd>
                <dt>Pages</dt>
                <dd>{pages.length}</dd>
                <dt>Supported form fields</dt>
                <dd>{document.info.fields.length} · Available in Edit PDF</dd>
                <dt>Current page</dt>
                <dd>
                  {geometry.viewWidth} × {geometry.viewHeight} pt ·{' '}
                  {geometry.rotation}° existing rotation
                </dd>
              </dl>
              <p>
                Page images show the original PDF and existing field
                appearances. Quick Sign adds personal visual marks to a
                downloaded copy. Edit PDF fills supported fields and adds
                editable text, dates, initials and checkmarks.
              </p>
              <p>
                These editor controls navigate pages. Reading arbitrary PDF
                content, text selection, OCR and accessible PDF tagging are not
                included.
              </p>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </main>
    </>
  );
}
