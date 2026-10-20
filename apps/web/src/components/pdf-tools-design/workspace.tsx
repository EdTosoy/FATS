'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  FileText,
  Grip,
  Hand,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Maximize,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  RotateCcw,
  Type,
  Undo2,
  X,
  CalendarDays,
  PanelLeftClose,
  Trash2,
  CircleHelp,
  CheckCheck,
} from 'lucide-react';
import { AppearanceSelect } from '../appearance-settings';
import { Brand } from '../brand';
import {
  boundMark,
  clamp,
  initialSnapshot,
  pageNames,
  type Mark,
  type Snapshot,
  type Tool,
} from './model';
import { SyntheticPage } from './synthetic-page';
import s from './workspace.module.css';

type ModalName =
  | 'signature'
  | 'export'
  | 'leave'
  | 'replace'
  | 'pages'
  | 'help'
  | 'remove'
  | null;
type DemoState =
  'ready' | 'empty' | 'loading' | 'unsupported' | 'password' | 'error';
type History = { past: Snapshot[]; present: Snapshot; future: Snapshot[] };
const toolNames: Record<Tool, string> = {
  select: 'Select',
  signature: 'Signature',
  initials: 'Initials',
  text: 'Text',
  date: 'Date',
  check: 'Checkmark',
};
const icons = {
  select: MousePointer2,
  signature: PenLine,
  initials: Type,
  text: Type,
  date: CalendarDays,
  check: Check,
};
const newHistory = (): History => ({
  past: [],
  present: initialSnapshot(),
  future: [],
});
const same = (a: Snapshot, b: Snapshot) =>
  JSON.stringify(a) === JSON.stringify(b);

function Control({
  label,
  children,
  onClick,
  disabled,
  active,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${s.control} ${className}`}
    >
      {children}
    </button>
  );
}

export function PdfDesignWorkspace() {
  const [history, setHistory] = useState<History>(newHistory);
  const snapshot = history.present;
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'sign' | 'edit'>('sign');
  const [requestedPageId, setPageId] = useState('offer');
  const pageId = snapshot.pages.includes(requestedPageId)
    ? requestedPageId
    : snapshot.pages[0];
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMark, setPreviewMark] = useState<Mark | null>(null);
  const [pending, setPending] = useState<Partial<Mark> | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('type');
  const [signatureStyle, setSignatureStyle] = useState('classic');
  const [strokes, setStrokes] = useState<string[]>([]);
  const [title, setTitle] = useState('Harborlight · Employment offer');
  const [notice, setNotice] = useState(
    'Open a synthetic sample to explore the workspace.',
  );
  const [organizing, setOrganizing] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [zoom, setZoom] = useState('page');
  const [stageSize, setStageSize] = useState({ width: 900, height: 800 });
  const [demoState, setDemoState] = useState<DemoState>('ready');
  const [exportState, setExportState] = useState<
    'review' | 'working' | 'done' | 'error'
  >('review');
  const [simulateExportError, setSimulateExportError] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const placementButton = useRef<HTMLButtonElement>(null);
  const modalOpener = useRef<HTMLElement | null>(null);
  const selectedControl = useRef<HTMLButtonElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const requestedSample = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{
    mark: Mark;
    x: number;
    y: number;
    resize: boolean;
    moved: boolean;
  } | null>(null);
  const drawing = useRef(false);
  const selected = snapshot.marks.find((mark) => mark.id === selectedId);
  const pageIndex = snapshot.pages.indexOf(pageId);
  const dirty =
    !same(snapshot, initialSnapshot()) ||
    title !== 'Harborlight · Employment offer';

  const scale =
    zoom === 'page'
      ? Math.max(
          0.2,
          Math.min(
            (stageSize.width - 48) / 612,
            (stageSize.height - 64) / 792,
            1.4,
          ),
        )
      : zoom === 'width'
        ? Math.max(0.2, (stageSize.width - 40) / 612)
        : Number(zoom);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded, demoState]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
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
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  useEffect(() => {
    if (selectedId) {
      selectedControl.current?.focus({ preventScroll: true });
      selectedControl.current?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [selectedId]);

  function commit(next: Snapshot) {
    if (same(snapshot, next)) return;
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
  }
  function updateMark(mark: Mark) {
    const next =
      mark.kind === 'text' || mark.kind === 'date'
        ? {
            ...mark,
            width: Math.max(
              mark.width,
              Math.min(560, mark.text.length * mark.size * 0.58 + 8),
            ),
            height: Math.max(mark.height, mark.size * 1.4),
          }
        : mark;
    commit({
      ...snapshot,
      marks: snapshot.marks.map((item) =>
        item.id === mark.id ? boundMark(next) : item,
      ),
    });
  }
  function undo(redo = false) {
    setHistory((current) => {
      if (redo) {
        const [next, ...rest] = current.future;
        return next
          ? {
              past: [...current.past, current.present],
              present: next,
              future: rest,
            }
          : current;
      }
      const previous = current.past.at(-1);
      return previous
        ? {
            past: current.past.slice(0, -1),
            present: previous,
            future: [current.present, ...current.future],
          }
        : current;
    });
    setSelectedId(null);
    setFieldDrafts({});
    setNotice(redo ? 'Change redone.' : 'Change undone.');
  }
  function openModal(value: ModalName) {
    modalOpener.current = document.activeElement as HTMLElement;
    setModal(value);
  }
  function changePage(value: string) {
    setPageId(value);
    setSelectedId(null);
    setPreviewMark(null);
    setFieldDrafts({});
    setNotice(
      `${pageNames[value]}. Page ${snapshot.pages.indexOf(value) + 1} of ${snapshot.pages.length}.`,
    );
    stage.current?.scrollTo({ top: 0, left: 0 });
  }
  function loadSample(form = false) {
    setHistory(newHistory());
    setMode(form ? 'edit' : 'sign');
    setPageId(form ? 'details' : 'offer');
    setSelectedId(null);
    setPending(null);
    setTool('select');
    setFieldDrafts({});
    setLoaded(true);
    setZoom(window.innerWidth < 760 ? 'width' : 'page');
    setDemoState('ready');
    setTitle('Harborlight · Employment offer');
    setNotice(
      form
        ? 'Three supported fields highlighted. Click a field to begin.'
        : 'Offer open. Create your signature to get started.',
    );
    setModal(null);
  }
  function chooseTool(value: Tool) {
    setSelectedId(null);
    setPending(null);
    setTool(value);
    if (value === 'signature' || value === 'initials') {
      setSignatureName('');
      setStrokes([]);
      setSignatureMode('type');
      openModal('signature');
    } else if (value === 'select')
      setNotice('Select a mark to adjust it, or click a supported field.');
    else {
      setPending({
        kind: value,
        text:
          value === 'date'
            ? '20 Oct 2026'
            : value === 'check'
              ? '✓'
              : 'Your text',
      });
      setNotice(
        `Click on the page to place ${value === 'text' ? 'a text box' : `a ${toolNames[value].toLowerCase()}`}. Or use Place on page. Escape cancels.`,
      );
    }
  }
  function requestSample(form = false) {
    requestedSample.current = form;
    if (dirty) openModal('replace');
    else loadSample(form);
  }
  function place(x = 132, y = 625) {
    if (!pending) return;
    const kind = pending.kind ?? 'signature';
    const width =
      kind === 'signature'
        ? 190
        : kind === 'initials'
          ? 80
          : kind === 'check'
            ? 26
            : 160;
    const height = kind === 'signature' || kind === 'initials' ? 58 : 32;
    const mark = boundMark({
      id: `sample-mark-${++sequence.current}`,
      page: pageId,
      kind,
      text: pending.text ?? 'Alex Rivera',
      x: x - width / 2,
      y: y - height / 2,
      width,
      height,
      size: kind === 'signature' ? 32 : kind === 'initials' ? 30 : 15,
      bold: false,
      ink: 'blue',
      strokes: pending.strokes,
      signatureStyle: pending.signatureStyle,
    });
    commit({ ...snapshot, marks: [...snapshot.marks, mark] });
    setSelectedId(mark.id);
    setPending(null);
    setTool('select');
    setNotice(
      `${toolNames[kind]} placed. Drag to move, use the corner to resize, or adjust with arrow keys.`,
    );
  }
  function startGesture(
    event: PointerEvent<HTMLButtonElement>,
    mark: Mark,
    resize = false,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(mark.id);
    setTool('select');
    setPending(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      mark,
      x: event.clientX,
      y: event.clientY,
      resize,
      moved: false,
    };
  }
  function moveGesture(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = (event.clientX - current.x) / scale;
    const dy = (event.clientY - current.y) / scale;
    current.moved = current.moved || Math.abs(dx) + Math.abs(dy) > 2;
    if (!current.moved) return;
    const mark = current.mark;
    if (current.resize) {
      const width = clamp(mark.width + dx, 40, 612 - mark.x);
      const height =
        mark.kind === 'signature' || mark.kind === 'initials'
          ? (width * mark.height) / mark.width
          : clamp(mark.height + dy, 24, 792 - mark.y);
      setPreviewMark(
        boundMark({ ...mark, width, height: Math.min(height, 792 - mark.y) }),
      );
    } else
      setPreviewMark(boundMark({ ...mark, x: mark.x + dx, y: mark.y + dy }));
  }
  function endGesture(cancel = false) {
    if (!cancel && previewMark && gesture.current?.moved) {
      updateMark(previewMark);
      setNotice(
        gesture.current.resize
          ? 'Mark resized. Undo is available.'
          : 'Mark moved. Undo is available.',
      );
    }
    gesture.current = null;
    setPreviewMark(null);
  }
  function removeMark() {
    commit({
      ...snapshot,
      marks: snapshot.marks.filter((mark) => mark.id !== selectedId),
    });
    setSelectedId(null);
    setNotice('Mark deleted. Undo restores it.');
  }
  function movePage(direction: number) {
    const pages = [...snapshot.pages];
    const destination = pageIndex + direction;
    if (destination < 0 || destination >= pages.length) return;
    [pages[pageIndex], pages[destination]] = [
      pages[destination],
      pages[pageIndex],
    ];
    commit({ ...snapshot, pages });
    setNotice(
      `${pageNames[pageId]} moved to page ${destination + 1}. Undo is available.`,
    );
  }
  function draw(event: PointerEvent<SVGSVGElement>, start = false) {
    if (!drawing.current && !start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(
      ((event.clientX - rect.left) * 420) / rect.width,
      0,
      420,
    ).toFixed(1);
    const y = clamp(
      ((event.clientY - rect.top) * 140) / rect.height,
      0,
      140,
    ).toFixed(1);
    if (start) {
      drawing.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setStrokes((current) => [...current, `M ${x} ${y} l .1 .1`]);
    } else
      setStrokes((current) =>
        current.map((path, index) =>
          index === current.length - 1 ? `${path} L ${x} ${y}` : path,
        ),
      );
  }
  function simulateExport() {
    setExportState('working');
    timer.current = setTimeout(
      () => setExportState(simulateExportError ? 'error' : 'done'),
      800,
    );
  }
  function setReviewState(value: DemoState) {
    setDemoState(value);
    setNotice(
      value === 'ready'
        ? 'Workspace restored. Your current edits are preserved.'
        : `Design review: ${value} state. No file was processed.`,
    );
  }
  function thumbnails(inDialog = false) {
    return (
      <div className={s.thumbnails}>
        {snapshot.pages.map((id, index) => (
          <button
            key={id}
            type="button"
            className={`${s.thumbnail} ${id === pageId ? s.currentThumbnail : ''}`}
            aria-current={id === pageId ? 'page' : undefined}
            aria-label={`Page ${index + 1}: ${pageNames[id]}`}
            onClick={() => {
              changePage(id);
              if (inDialog) setModal(null);
            }}
          >
            <div className={s.miniPaper}>
              <SyntheticPage page={id} />
              {snapshot.marks
                .filter((mark) => mark.page === id)
                .map((mark) => (
                  <span
                    key={mark.id}
                    className={s.miniMark}
                    style={{
                      left: `${mark.x / 6.12}%`,
                      top: `${mark.y / 7.92}%`,
                    }}
                  >
                    —
                  </span>
                ))}
            </div>
            <span>
              <b>{index + 1}</b> {pageNames[id]}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <section
      data-pdf-design-workspace="true"
      className={s.workspace}
      aria-label="PDF Tools 2 design prototype"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="dialog"]',
          )
        )
          return;
        const modifier = event.metaKey || event.ctrlKey;
        if (modifier && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          undo(event.shiftKey);
        }
        if (modifier && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          undo(true);
        }
        if (event.key === 'Escape') {
          setPending(null);
          setTool('select');
          setSelectedId(null);
          setNotice('Selection and placement cleared.');
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
          event.preventDefault();
          removeMark();
        }
      }}
    >
      <div className={s.reviewBar}>
        <span>
          <b>DESIGN PROTOTYPE</b>
          <span className={s.reviewDetail}>
            {' '}
            Synthetic pages · Simulated PDF output
          </span>
        </span>
        <label>
          Review state{' '}
          <select
            aria-label="Review state"
            value={demoState}
            onChange={(event) =>
              setReviewState(event.target.value as DemoState)
            }
          >
            <option value="ready">Workspace</option>
            <option value="empty">Empty</option>
            <option value="loading">Loading</option>
            <option value="unsupported">Unsupported</option>
            <option value="password">Password protected</option>
            <option value="error">Render error</option>
          </select>
        </label>
      </div>
      <header className={s.header}>
        <Link
          href="/resumes/pdf-tools"
          className={s.back}
          aria-label="Leave prototype for existing PDF Tools"
          onClick={(event) => {
            if (dirty) {
              event.preventDefault();
              openModal('leave');
            }
          }}
        >
          <ArrowLeft size={18} />
          <Brand compact />
        </Link>
        <div className={s.titleGroup}>
          <h1>
            PDF Tools <span>2.0</span>
          </h1>
          <label>
            <span className="sr-only">Document title</span>
            <input
              aria-label="Document title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
            />
          </label>
        </div>
        <span className={s.localBadge}>
          <LockKeyhole size={13} /> In this tab only
        </span>
        <div className={s.headerActions}>
          <AppearanceSelect />
          <Control label="Interaction guide" onClick={() => openModal('help')}>
            <CircleHelp size={18} />
          </Control>
          <button
            type="button"
            className={s.primary}
            aria-label="Download"
            disabled={!loaded || demoState !== 'ready'}
            onClick={() => {
              setExportState('review');
              openModal('export');
            }}
          >
            <Download size={16} />
            <span>Download</span>
          </button>
        </div>
      </header>
      <div className={s.toolbar}>
        <div className={s.modes} role="group" aria-label="Workflow">
          <button
            type="button"
            aria-pressed={mode === 'sign'}
            onClick={() => {
              setMode('sign');
              setPending(null);
              setTool('select');
            }}
          >
            Quick Sign
          </button>
          <button
            type="button"
            aria-pressed={mode === 'edit'}
            onClick={() => {
              setMode('edit');
              setPending(null);
              setTool('select');
            }}
          >
            Edit PDF
          </button>
        </div>
        <div className={s.toolGroup} role="group" aria-label="Document tools">
          {(mode === 'sign'
            ? (['select', 'signature', 'date'] as const)
            : ([
                'select',
                'text',
                'signature',
                'initials',
                'date',
                'check',
              ] as const)
          ).map((value) => {
            const Icon = icons[value];
            return (
              <Control
                key={value}
                label={toolNames[value]}
                className={
                  value === 'signature' &&
                  mode === 'sign' &&
                  !snapshot.marks.some((mark) => mark.kind === 'signature')
                    ? s.suggestedTool
                    : ''
                }
                active={
                  tool === value ||
                  (value === 'select' && !pending && tool === 'select')
                }
                disabled={!loaded || demoState !== 'ready'}
                onClick={() => chooseTool(value)}
              >
                <Icon size={18} />
                <span>{toolNames[value]}</span>
              </Control>
            );
          })}
        </div>
        <div className={s.historyGroup}>
          <Control
            label="Undo"
            disabled={!history.past.length}
            onClick={() => undo()}
          >
            <Undo2 size={17} />
          </Control>
          <Control
            label="Redo"
            disabled={!history.future.length}
            onClick={() => undo(true)}
          >
            <Redo2 size={17} />
          </Control>
        </div>
      </div>
      <div className={s.contextBar}>
        {pending ? (
          <>
            <span className={s.contextHint}>
              <PenLine size={15} />
              {(pending.kind === 'signature' || pending.kind === 'initials') &&
              pageId === 'offer'
                ? 'Click where your signature belongs'
                : `Click to place ${toolNames[pending.kind ?? 'text'].toLowerCase()}`}
            </span>
            <button
              ref={placementButton}
              type="button"
              className={s.smallAction}
              onClick={() =>
                place(
                  pending.kind === 'date'
                    ? 435
                    : pageId === 'checklist'
                      ? 71
                      : 158,
                  pending.kind === 'date' ||
                    pending.kind === 'signature' ||
                    pending.kind === 'initials'
                    ? 625
                    : 566,
                )
              }
            >
              {(pending.kind === 'signature' || pending.kind === 'initials') &&
              pageId === 'offer'
                ? 'Place on signature line'
                : 'Place on page'}
            </button>
            <Control
              label="Cancel placement"
              onClick={() => {
                setPending(null);
                setTool('select');
              }}
            >
              <X size={15} />
            </Control>
          </>
        ) : selected ? (
          <>
            <span className={s.contextHint}>
              {toolNames[selected.kind]} selected
            </span>
            <span className={s.contextDetail}>
              Drag to move · Corner to resize · Arrow keys to nudge
            </span>
            <Control label="Delete selected mark" onClick={removeMark}>
              <Trash2 size={16} />
            </Control>
          </>
        ) : (
          <>
            <span className={s.contextHint}>
              <LockKeyhole size={14} />
              {loaded
                ? mode === 'sign'
                  ? 'Your offer. Your signature. One completed copy.'
                  : 'Click a field, or choose a tool and place it on the page.'
                : 'A little help with the paperwork.'}
            </span>
            <span className={s.contextDetail}>Original stays unchanged</span>
          </>
        )}
      </div>
      <div className={s.body}>
        {loaded && demoState === 'ready' ? (
          <>
            <aside
              className={`${s.pageRail} ${!railOpen ? s.hiddenRail : ''}`}
              aria-label="Document pages"
            >
              <div className={s.railHeading}>
                <h2>
                  Pages <span>{snapshot.pages.length}</span>
                </h2>
                <Control
                  label="Hide page thumbnails"
                  onClick={() => setRailOpen(false)}
                >
                  <PanelLeftClose size={15} />
                </Control>
              </div>
              {thumbnails()}
              <button
                type="button"
                className={s.organizeButton}
                aria-pressed={organizing}
                onClick={() => setOrganizing(!organizing)}
              >
                <LayoutGrid size={15} /> Organize pages
              </button>
              {organizing && (
                <div className={s.pageActions}>
                  <p>Selected: page {pageIndex + 1}</p>
                  <Control
                    label="Move page earlier"
                    disabled={pageIndex <= 0}
                    onClick={() => movePage(-1)}
                  >
                    <ArrowUp size={15} /> Move up
                  </Control>
                  <Control
                    label="Move page later"
                    disabled={pageIndex >= snapshot.pages.length - 1}
                    onClick={() => movePage(1)}
                  >
                    <ArrowDown size={15} /> Move down
                  </Control>
                  <Control
                    label="Remove page"
                    disabled={snapshot.pages.length <= 1}
                    onClick={() => openModal('remove')}
                  >
                    <Trash2 size={15} /> Remove
                  </Control>
                </div>
              )}
              <div className={s.railFoot}>
                <Grip size={14} />
                <span>Every change can be undone.</span>
              </div>
            </aside>
            <div className={s.documentArea}>
              <div className={s.viewControls}>
                <Control
                  label="Show page thumbnails"
                  className={s.showPages}
                  onClick={() => {
                    if (window.innerWidth < 760) openModal('pages');
                    else setRailOpen(!railOpen);
                  }}
                >
                  <LayoutGrid size={16} />
                  <span>Pages</span>
                </Control>
                <div className={s.pageStepper}>
                  <Control
                    label="Previous page"
                    disabled={pageIndex <= 0}
                    onClick={() => changePage(snapshot.pages[pageIndex - 1])}
                  >
                    <ChevronLeft size={17} />
                  </Control>
                  <label>
                    <span className="sr-only">Current page</span>
                    <select
                      aria-label="Current page"
                      value={pageId}
                      onChange={(event) => changePage(event.target.value)}
                    >
                      {snapshot.pages.map((id, index) => (
                        <option key={id} value={id}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>/ {snapshot.pages.length}</span>
                  <Control
                    label="Next page"
                    disabled={pageIndex >= snapshot.pages.length - 1}
                    onClick={() => changePage(snapshot.pages[pageIndex + 1])}
                  >
                    <ChevronRight size={17} />
                  </Control>
                </div>
                <div className={s.zoomControls}>
                  <Control
                    label="Zoom out"
                    onClick={() =>
                      setZoom(String(clamp(scale - 0.25, 0.25, 2)))
                    }
                  >
                    <Minus size={15} />
                  </Control>
                  <label>
                    <span className="sr-only">Document zoom</span>
                    <select
                      aria-label="Document zoom"
                      value={zoom}
                      onChange={(event) => setZoom(event.target.value)}
                    >
                      <option value="page">Fit page</option>
                      <option value="width">Fit width</option>
                      {[
                        ...new Set([
                          0.5,
                          0.75,
                          1,
                          1.25,
                          1.5,
                          2,
                          ...(zoom !== 'page' && zoom !== 'width'
                            ? [Number(zoom)]
                            : []),
                        ]),
                      ]
                        .sort((a, b) => a - b)
                        .map((value) => (
                          <option key={value} value={value}>
                            {Math.round(value * 100)}%
                          </option>
                        ))}
                    </select>
                  </label>
                  <Control
                    label="Zoom in"
                    onClick={() =>
                      setZoom(String(clamp(scale + 0.25, 0.25, 2)))
                    }
                  >
                    <Plus size={15} />
                  </Control>
                  <Control
                    label="Fit page"
                    className={s.fitButton}
                    onClick={() => setZoom('page')}
                  >
                    <Maximize size={15} />
                  </Control>
                </div>
              </div>
              <div
                ref={stage}
                className={s.stage}
                aria-label="Document canvas"
                tabIndex={0}
              >
                <div className={s.pageCaption}>
                  <span>{pageNames[pageId]}</span>
                  <span>{Math.round(scale * 100)}% · A4-style sample</span>
                </div>
                <div
                  className={s.paperSizing}
                  style={{ width: 612 * scale, height: 792 * scale }}
                >
                  <div
                    ref={paper}
                    data-testid="design-paper"
                    className={`${s.paper} ${pending ? s.placing : ''}`}
                    style={{ transform: `scale(${scale})` }}
                    onClick={(event) => {
                      if (pending && paper.current) {
                        const rect = paper.current.getBoundingClientRect();
                        place(
                          (event.clientX - rect.left) / scale,
                          (event.clientY - rect.top) / scale,
                        );
                      } else if (
                        event.target === event.currentTarget ||
                        (event.target as HTMLElement).closest(
                          `.${s.documentContent}`,
                        )
                      )
                        setSelectedId(null);
                    }}
                  >
                    <SyntheticPage page={pageId} />
                    {pageId === 'details' &&
                      ['fullName', 'preferredName', 'emergencyContact'].map(
                        (field, index) => (
                          <label
                            className={s.supportedField}
                            key={field}
                            style={{ top: 297 + index * 90 }}
                          >
                            <span className="sr-only">
                              {
                                [
                                  'Full name',
                                  'Preferred name',
                                  'Emergency contact',
                                ][index]
                              }
                            </span>
                            <input
                              aria-label={
                                [
                                  'Full name',
                                  'Preferred name',
                                  'Emergency contact',
                                ][index]
                              }
                              placeholder={
                                [
                                  'Click to enter a name',
                                  'What should we call you?',
                                  'Synthetic contact only',
                                ][index]
                              }
                              value={
                                fieldDrafts[field] ??
                                snapshot.fields[field] ??
                                ''
                              }
                              onFocus={() => {
                                setSelectedId(null);
                                setPending(null);
                                setTool('select');
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFieldDrafts({
                                  ...fieldDrafts,
                                  [field]: event.target.value,
                                })
                              }
                              onBlur={(event) => {
                                if (
                                  event.target.value !==
                                  (snapshot.fields[field] ?? '')
                                )
                                  commit({
                                    ...snapshot,
                                    fields: {
                                      ...snapshot.fields,
                                      [field]: event.target.value,
                                    },
                                  });
                              }}
                              maxLength={80}
                            />
                          </label>
                        ),
                      )}
                    {pending?.kind === 'signature' && pageId === 'offer' && (
                      <div
                        className={s.signatureTarget}
                        style={{ left: 50, top: 580, width: 265, height: 60 }}
                      >
                        <Plus size={18} /> Place signature here
                      </div>
                    )}
                    {snapshot.marks
                      .filter((mark) => mark.page === pageId)
                      .map((original) => {
                        const mark =
                          previewMark?.id === original.id
                            ? previewMark
                            : original;
                        const isSelected = selectedId === mark.id;
                        return (
                          <div
                            key={mark.id}
                            className={`${s.mark} ${isSelected ? s.selectedMark : ''}`}
                            style={{
                              left: mark.x,
                              top: mark.y,
                              width: mark.width,
                              height: mark.height,
                            }}
                          >
                            <button
                              ref={isSelected ? selectedControl : undefined}
                              type="button"
                              className={s.markContent}
                              aria-label={`${toolNames[mark.kind]}: ${mark.text || 'Drawn signature'}`}
                              aria-pressed={isSelected}
                              style={{
                                color:
                                  mark.ink === 'blue' ? '#1d4b76' : '#172c45',
                                fontSize:
                                  mark.kind === 'signature' ||
                                  mark.kind === 'initials'
                                    ? Math.min(
                                        mark.height * 0.62,
                                        mark.width /
                                          Math.max(1, mark.text.length * 0.55),
                                      )
                                    : mark.size,
                                fontWeight: mark.bold ? 700 : 400,
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedId(mark.id);
                              }}
                              onDoubleClick={() => {
                                if (mark.kind === 'text')
                                  textInput.current?.focus();
                              }}
                              onPointerDown={(event) =>
                                startGesture(event, mark)
                              }
                              onPointerMove={moveGesture}
                              onPointerUp={() => endGesture()}
                              onPointerCancel={() => endGesture(true)}
                              onKeyDown={(event) => {
                                const delta = event.shiftKey ? 10 : 1;
                                const moves: Record<string, [number, number]> =
                                  {
                                    ArrowLeft: [-delta, 0],
                                    ArrowRight: [delta, 0],
                                    ArrowUp: [0, -delta],
                                    ArrowDown: [0, delta],
                                  };
                                if (moves[event.key]) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  const [dx, dy] = moves[event.key];
                                  updateMark({
                                    ...mark,
                                    x: mark.x + dx,
                                    y: mark.y + dy,
                                  });
                                }
                              }}
                            >
                              {mark.strokes ? (
                                <svg viewBox="0 0 420 140" aria-hidden="true">
                                  <path
                                    d={mark.strokes}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : (
                                <span
                                  className={
                                    mark.kind === 'signature' ||
                                    mark.kind === 'initials'
                                      ? `${s.signatureText} ${mark.signatureStyle === 'simple' ? s.simpleSignature : ''}`
                                      : ''
                                  }
                                >
                                  {mark.text}
                                </span>
                              )}
                            </button>
                            {isSelected && (
                              <>
                                <span className={s.selectionLabel}>
                                  {toolNames[mark.kind]}
                                </span>
                                <i className={s.cornerTL} />
                                <i className={s.cornerTR} />
                                <i className={s.cornerBL} />
                                <button
                                  type="button"
                                  className={s.resizeHandle}
                                  aria-label="Resize selected mark"
                                  onPointerDown={(event) =>
                                    startGesture(event, mark, true)
                                  }
                                  onPointerMove={moveGesture}
                                  onPointerUp={() => endGesture()}
                                  onPointerCancel={() => endGesture(true)}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === 'ArrowRight' ||
                                      event.key === 'ArrowLeft'
                                    ) {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      const width =
                                        mark.width +
                                        (event.key === 'ArrowRight' ? 5 : -5);
                                      updateMark({
                                        ...mark,
                                        width,
                                        height:
                                          mark.kind === 'signature' ||
                                          mark.kind === 'initials'
                                            ? (width * mark.height) / mark.width
                                            : mark.height,
                                      });
                                    }
                                  }}
                                >
                                  <span />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
                <p className={s.paperHint}>
                  {pending ? (
                    'Click to place · Escape to cancel'
                  ) : (
                    <>
                      <Hand size={13} /> Scroll to explore · Your document stays
                      white in every theme
                    </>
                  )}
                </p>
              </div>
            </div>
            {selected && (
              <aside
                className={s.inspector}
                aria-label="Selected element properties"
              >
                <div className={s.inspectorTitle}>
                  <div>
                    <span>PROPERTIES</span>
                    <h2>{toolNames[selected.kind]}</h2>
                  </div>
                  <Control
                    label="Deselect mark"
                    onClick={() => setSelectedId(null)}
                  >
                    <X size={16} />
                  </Control>
                </div>
                {!selected.strokes && (
                  <label className={s.propertyField}>
                    {selected.kind === 'date'
                      ? 'Date text'
                      : selected.kind === 'signature' ||
                          selected.kind === 'initials'
                        ? 'Name on document'
                        : 'Text'}
                    <input
                      ref={textInput}
                      key={`${selected.id}-${selected.text}`}
                      aria-label="Selected mark text"
                      defaultValue={selected.text}
                      maxLength={160}
                      onBlur={(event) => {
                        if (event.target.value !== selected.text)
                          updateMark({ ...selected, text: event.target.value });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                  </label>
                )}
                {selected.kind === 'text' || selected.kind === 'date' ? (
                  <div className={s.propertyRow}>
                    <label className={s.propertyField}>
                      Size
                      <select
                        aria-label="Text size"
                        value={selected.size}
                        onChange={(event) =>
                          updateMark({
                            ...selected,
                            size: Number(event.target.value),
                          })
                        }
                      >
                        {[12, 15, 18, 24, 32].map((size) => (
                          <option key={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                    <Control
                      label="Bold text"
                      active={selected.bold}
                      onClick={() =>
                        updateMark({ ...selected, bold: !selected.bold })
                      }
                    >
                      <b>B</b>
                    </Control>
                  </div>
                ) : (
                  <p className={s.propertyHint}>
                    Proportions stay locked as you resize your signature.
                  </p>
                )}
                <fieldset className={s.inkChoices}>
                  <legend>Ink color</legend>
                  {(['blue', 'black'] as const).map((ink) => (
                    <label key={ink}>
                      <input
                        type="radio"
                        name="mark-ink"
                        checked={selected.ink === ink}
                        onChange={() => updateMark({ ...selected, ink })}
                      />
                      <span
                        className={ink === 'blue' ? s.blueInk : s.blackInk}
                      />
                      {ink === 'blue' ? 'Blue' : 'Black'}
                    </label>
                  ))}
                </fieldset>
                <div className={s.propertyDivider} />
                <h3>Position & size</h3>
                <div className={s.measurements}>
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <label key={`${selected.id}-${key}-${selected[key]}`}>
                      {key === 'x'
                        ? 'Left'
                        : key === 'y'
                          ? 'Top'
                          : key === 'width'
                            ? 'Width'
                            : 'Height'}
                      <input
                        type="number"
                        aria-label={`Mark ${key}`}
                        min={0}
                        max={key === 'height' || key === 'y' ? 792 : 612}
                        defaultValue={Math.round(selected[key])}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (
                            Number.isFinite(value) &&
                            value !== Math.round(selected[key])
                          ) {
                            const next = { ...selected, [key]: value };
                            if (
                              selected.kind === 'signature' ||
                              selected.kind === 'initials'
                            ) {
                              if (key === 'width')
                                next.height =
                                  (value * selected.height) / selected.width;
                              if (key === 'height')
                                next.width =
                                  (value * selected.width) / selected.height;
                            }
                            updateMark(next);
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className={s.propertyHint}>
                  Page points · Arrow keys move 1 point. Shift moves 10.
                </p>
                <button
                  type="button"
                  className={s.deleteButton}
                  onClick={removeMark}
                >
                  <Trash2 size={15} /> Delete element
                </button>
              </aside>
            )}
          </>
        ) : (
          <div className={s.emptyWorkspace}>
            {demoState === 'loading' ? (
              <>
                <LoaderCircle className={s.spinner} size={32} />
                <h2>Preparing your pages</h2>
                <p>Proposed loading state. No actual PDF is being processed.</p>
                <button
                  type="button"
                  className={s.secondary}
                  onClick={() => setReviewState('ready')}
                >
                  Return to workspace
                </button>
              </>
            ) : demoState === 'unsupported' ||
              demoState === 'password' ||
              demoState === 'error' ? (
              <>
                <FileText size={36} />
                <h2>
                  {demoState === 'password'
                    ? 'This PDF is password protected'
                    : demoState === 'error'
                      ? 'We could not display this page'
                      : 'This PDF needs a different tool'}
                </h2>
                <p>
                  {demoState === 'password'
                    ? 'Ask the sender for an unlocked, unsigned copy. FATS will not remove its protection.'
                    : demoState === 'error'
                      ? 'Your edits are still in this tab. Try rendering again, or return to the sample.'
                      : 'Signed, encrypted and unsupported PDF structures cannot be edited safely. Ask for an unsigned, standard PDF.'}
                </p>
                <span className={s.stateNote}>
                  Simulated state · Your current sample is preserved
                </span>
                <button
                  type="button"
                  className={s.primary}
                  onClick={() => setReviewState('ready')}
                >
                  {demoState === 'error'
                    ? 'Retry sample rendering'
                    : 'Return to sample'}
                </button>
              </>
            ) : (
              <>
                <div className={s.emptyDocument}>
                  <FileText size={30} />
                  <span />
                  <span />
                  <span />
                  <PenLine size={26} />
                </div>
                <span className={s.eyebrow}>PDF TOOLS 2.0</span>
                <h2>
                  Your next chapter.
                  <br />A little less paperwork.
                </h2>
                <p>
                  Sign an offer or complete a form in one calm workspace.
                  <br />
                  Start with a fictional document to explore the design.
                </p>
                <div className={s.sampleActions}>
                  <button
                    type="button"
                    className={s.primary}
                    onClick={() => requestSample()}
                  >
                    <PenLine size={17} /> Open sample offer
                  </button>
                  <button
                    type="button"
                    className={s.secondary}
                    onClick={() => requestSample(true)}
                  >
                    <Type size={17} /> Open sample form
                  </button>
                </div>
                <div className={s.emptyFoot}>
                  <LockKeyhole size={14} />
                  <span>
                    Synthetic documents only. No uploads. No PDF file is
                    generated.
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <footer className={s.statusBar}>
        <span role="status" aria-live="polite">
          {notice}
        </span>
        <button type="button" onClick={() => requestSample()}>
          <RotateCcw size={12} />
          <span>Restart sample</span>
        </button>
        <span className={s.tabOnly}>
          {dirty ? 'Unsaved prototype edits' : 'No changes'} · Memory only
        </span>
      </footer>

      <Dialog.Root
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && exportState !== 'working') {
            setModal(null);
            setSignatureName('');
            setStrokes([]);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={s.modalOverlay} />
          <Dialog.Content
            className={`${s.modal} ${modal === 'signature' ? s.signatureModal : ''}`}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (pending) placementButton.current?.focus();
              else if (modalOpener.current?.isConnected)
                modalOpener.current.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (exportState === 'working') event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (exportState === 'working') event.preventDefault();
            }}
          >
            <Dialog.Close
              className={s.modalClose}
              aria-label="Close dialog"
              disabled={exportState === 'working'}
            >
              <X size={19} />
            </Dialog.Close>
            {modal === 'signature' ? (
              <>
                <span className={s.eyebrow}>MAKE IT YOURS</span>
                <Dialog.Title>
                  Create your {tool === 'initials' ? 'initials' : 'signature'}
                </Dialog.Title>
                <Dialog.Description>
                  A personal mark for this document. Kept in this tab only.
                </Dialog.Description>
                <div
                  className={s.signatureModes}
                  role="group"
                  aria-label="Signature method"
                >
                  <button
                    type="button"
                    aria-pressed={signatureMode === 'type'}
                    onClick={() => setSignatureMode('type')}
                  >
                    <Type size={16} /> Type
                  </button>
                  <button
                    type="button"
                    aria-pressed={signatureMode === 'draw'}
                    onClick={() => setSignatureMode('draw')}
                  >
                    <PenLine size={16} /> Draw
                  </button>
                </div>
                {signatureMode === 'type' ? (
                  <label className={s.signatureName}>
                    Name for your{' '}
                    {tool === 'initials' ? 'initials' : 'signature'}
                    <input
                      autoComplete="off"
                      aria-label="Name for signature"
                      placeholder={
                        tool === 'initials' ? 'AR' : 'Alex Rivera (synthetic)'
                      }
                      value={signatureName}
                      maxLength={60}
                      onChange={(event) => setSignatureName(event.target.value)}
                    />
                  </label>
                ) : (
                  <p className={s.drawHint}>
                    Draw with a finger, pen or mouse. Typing is available for
                    keyboard use.
                  </p>
                )}
                <div className={s.signaturePreview}>
                  <span>
                    {signatureMode === 'type'
                      ? 'YOUR SIGNATURE PREVIEW'
                      : 'DRAW YOUR SIGNATURE'}
                  </span>
                  {signatureMode === 'type' ? (
                    <div
                      className={`${s.signatureText} ${signatureStyle === 'simple' ? s.simpleSignature : ''}`}
                    >
                      {signatureName || 'Your signature'}
                    </div>
                  ) : (
                    <svg
                      role="img"
                      aria-label="Signature drawing area"
                      viewBox="0 0 420 140"
                      onPointerDown={(event) => draw(event, true)}
                      onPointerMove={(event) => draw(event)}
                      onPointerUp={() => {
                        drawing.current = false;
                      }}
                      onPointerCancel={() => {
                        drawing.current = false;
                      }}
                    >
                      {strokes.map((path, index) => (
                        <path
                          key={index}
                          d={path}
                          fill="none"
                          stroke="#1d4b76"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  )}
                  <div className={s.signatureBaseline} />
                </div>
                {signatureMode === 'type' ? (
                  <fieldset className={s.signatureStyles}>
                    <legend>Signature style</legend>
                    <label>
                      <input
                        type="radio"
                        name="signature-style"
                        checked={signatureStyle === 'classic'}
                        onChange={() => setSignatureStyle('classic')}
                      />
                      <span className={s.signatureText}>Classic</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="signature-style"
                        checked={signatureStyle === 'simple'}
                        onChange={() => setSignatureStyle('simple')}
                      />
                      <span className={s.simpleSignature}>Simple</span>
                    </label>
                  </fieldset>
                ) : (
                  <button
                    type="button"
                    className={s.smallAction}
                    onClick={() => setStrokes([])}
                  >
                    Clear drawing
                  </button>
                )}
                <p className={s.signatureDisclosure}>
                  <LockKeyhole size={14} />A visual signature mark. No identity
                  verification, certificate or signing audit trail. Check what
                  the recipient accepts.
                </p>
                <div className={s.modalActions}>
                  <Dialog.Close className={s.secondary}>Cancel</Dialog.Close>
                  <button
                    type="button"
                    className={s.primary}
                    disabled={
                      signatureMode === 'type'
                        ? !signatureName.trim()
                        : !strokes.length
                    }
                    onClick={() => {
                      setPending({
                        kind: tool === 'initials' ? 'initials' : 'signature',
                        text:
                          signatureMode === 'type'
                            ? signatureName.trim()
                            : 'Drawn signature',
                        strokes:
                          signatureMode === 'draw'
                            ? strokes.join(' ')
                            : undefined,
                        signatureStyle,
                      });
                      setModal(null);
                      setSignatureName('');
                      setStrokes([]);
                      setNotice(
                        'Signature ready. Click the page or use Place on signature line.',
                      );
                    }}
                  >
                    <PenLine size={16} /> Use{' '}
                    {tool === 'initials' ? 'initials' : 'signature'}
                  </button>
                </div>
              </>
            ) : modal === 'export' ? (
              <>
                <span className={s.modalIcon}>
                  {exportState === 'done' ? (
                    <CheckCheck size={27} />
                  ) : exportState === 'working' ? (
                    <LoaderCircle className={s.spinner} size={27} />
                  ) : (
                    <Download size={27} />
                  )}
                </span>
                <Dialog.Title>
                  {exportState === 'done'
                    ? 'Your copy would be ready'
                    : exportState === 'working'
                      ? 'Preparing your completed copy'
                      : exportState === 'error'
                        ? 'Your copy could not be prepared'
                        : 'Review your completed copy'}
                </Dialog.Title>
                <Dialog.Description>
                  {exportState === 'done'
                    ? 'Prototype simulation complete. No PDF was generated or downloaded. Your edits remain unsaved in memory.'
                    : exportState === 'error'
                      ? 'Simulated export failure. Your edits are intact. Retry without starting over.'
                      : 'Review every page before sharing. A completed copy would include your fields and marks; the original would stay unchanged.'}
                </Dialog.Description>
                <div className={s.exportSummary}>
                  <FileCheck2 size={28} />
                  <div>
                    <strong>{title || 'Completed document'}.pdf</strong>
                    <span>
                      {snapshot.pages.length} pages · {snapshot.marks.length}{' '}
                      added marks ·{' '}
                      {Object.values(snapshot.fields).filter(Boolean).length}{' '}
                      filled fields
                    </span>
                  </div>
                  <span className={s.prototypePill}>SIMULATED</span>
                </div>
                <p className={s.propertyHint}>
                  The real editor will flatten supported fields and marks. This
                  design prototype does not test PDF fidelity, certificates or
                  file safety.
                </p>
                {exportState === 'review' && (
                  <label className={s.exportErrorToggle}>
                    <input
                      type="checkbox"
                      checked={simulateExportError}
                      onChange={(event) =>
                        setSimulateExportError(event.target.checked)
                      }
                    />{' '}
                    Design review: simulate export failure
                  </label>
                )}
                {exportState === 'error' && (
                  <label className={s.exportErrorToggle}>
                    <input
                      type="checkbox"
                      checked={simulateExportError}
                      onChange={(event) =>
                        setSimulateExportError(event.target.checked)
                      }
                    />{' '}
                    Keep simulating failure
                  </label>
                )}
                <div className={s.modalActions}>
                  <Dialog.Close
                    className={s.secondary}
                    disabled={exportState === 'working'}
                  >
                    Back to document
                  </Dialog.Close>
                  {exportState !== 'done' && (
                    <button
                      type="button"
                      className={s.primary}
                      disabled={exportState === 'working'}
                      onClick={simulateExport}
                    >
                      <Download size={16} />
                      {exportState === 'error'
                        ? 'Retry simulation'
                        : 'Simulate download'}
                    </button>
                  )}
                </div>
              </>
            ) : modal === 'leave' || modal === 'replace' ? (
              <>
                <span className={s.eyebrow}>BEFORE YOU GO</span>
                <Dialog.Title>Keep working on your changes?</Dialog.Title>
                <Dialog.Description>
                  Prototype edits exist only in this tab and have not been
                  saved.{' '}
                  {modal === 'replace'
                    ? 'Restarting removes the current sample edits.'
                    : 'Leaving discards the current sample edits.'}{' '}
                  A simulated download is not a backup.
                </Dialog.Description>
                <div className={s.modalActions}>
                  <Dialog.Close className={s.primary}>
                    Keep editing
                  </Dialog.Close>
                  {modal === 'replace' ? (
                    <button
                      type="button"
                      className={s.secondary}
                      onClick={() => loadSample(requestedSample.current)}
                    >
                      Discard and restart
                    </button>
                  ) : (
                    <Link
                      className={s.secondary}
                      href="/resumes/pdf-tools"
                      onClick={() => {
                        setHistory(newHistory());
                        setModal(null);
                      }}
                    >
                      Discard and leave
                    </Link>
                  )}
                </div>
              </>
            ) : modal === 'pages' ? (
              <>
                <Dialog.Title>Document pages</Dialog.Title>
                <Dialog.Description>
                  Choose a page. Your pending placement stays active.
                </Dialog.Description>
                {thumbnails(true)}
                <div className={s.mobileOrganize}>
                  <h3>Organize current page</h3>
                  <p>{pageNames[pageId]}</p>
                  <div className={s.propertyRow}>
                    <Control
                      label="Move page earlier"
                      disabled={pageIndex <= 0}
                      onClick={() => movePage(-1)}
                    >
                      <ArrowUp size={16} />
                    </Control>
                    <Control
                      label="Move page later"
                      disabled={pageIndex >= snapshot.pages.length - 1}
                      onClick={() => movePage(1)}
                    >
                      <ArrowDown size={16} />
                    </Control>
                    <Control
                      label="Remove page"
                      disabled={snapshot.pages.length <= 1}
                      onClick={() => setModal('remove')}
                    >
                      <Trash2 size={16} />
                    </Control>
                  </div>
                </div>
              </>
            ) : modal === 'remove' ? (
              <>
                <Dialog.Title>Remove this page?</Dialog.Title>
                <Dialog.Description>
                  {pageNames[pageId]} and its marks will be removed from the
                  sample. Undo restores the page and its marks together.
                </Dialog.Description>
                <div className={s.modalActions}>
                  <Dialog.Close className={s.secondary}>Keep page</Dialog.Close>
                  <button
                    type="button"
                    className={s.primary}
                    onClick={() => {
                      const pages = snapshot.pages.filter(
                        (id) => id !== pageId,
                      );
                      commit({
                        ...snapshot,
                        pages,
                        marks: snapshot.marks.filter(
                          (mark) => mark.page !== pageId,
                        ),
                        fields: pageId === 'details' ? {} : snapshot.fields,
                      });
                      setPageId(pages[Math.min(pageIndex, pages.length - 1)]);
                      setSelectedId(null);
                      setModal(null);
                      setNotice(
                        'Page removed. Undo restores it and its marks.',
                      );
                    }}
                  >
                    Remove page
                  </button>
                </div>
              </>
            ) : (
              <>
                <Dialog.Title>
                  A workspace that stays out of your way
                </Dialog.Title>
                <Dialog.Description>
                  This is an interactive product design, using HTML pages and
                  in-memory marks. Open only the supplied synthetic samples.
                </Dialog.Description>
                <dl className={s.helpList}>
                  <dt>Quick Sign</dt>
                  <dd>
                    Signature → type or draw → Use signature → click the page or
                    Place on signature line → adjust → Download.
                  </dd>
                  <dt>Edit PDF</dt>
                  <dd>
                    Click supported fields. Choose Text, Initials, Date or
                    Checkmark and place on a page. Select a mark to reveal its
                    properties.
                  </dd>
                  <dt>Keyboard</dt>
                  <dd>
                    Tab to tools and marks. Arrows nudge; Shift + arrows move 10
                    points. Resize handle + left/right changes size. Delete
                    removes; Escape cancels placement. Ctrl/⌘ + Z undoes; Shift
                    + Z redoes.
                  </dd>
                  <dt>Simulation boundary</dt>
                  <dd>
                    No PDF input, parsing, export, document storage or security
                    changes. Dates use a fixed synthetic example. Page
                    organization changes the sample only. Reload clears edits.
                  </dd>
                </dl>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
