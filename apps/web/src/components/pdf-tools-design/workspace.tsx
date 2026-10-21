'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type CSSProperties,
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
  ChevronDown,
  Download,
  FileCheck2,
  FileText,
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
import {
  measureSignature,
  signatureBox,
  signatureFit,
} from './signature-layout';
import { useEditingViewport } from './use-editing-viewport';

type ModalName =
  | 'signature'
  | 'contents'
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
const fields = [
  { id: 'fullName', label: 'Full name' },
  { id: 'preferredName', label: 'Preferred name' },
  { id: 'emergencyContact', label: 'Emergency contact' },
];
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
  expanded,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      aria-expanded={expanded}
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
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [markDraft, setMarkDraft] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const editingViewport = useEditingViewport();
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
  const [propertiesOpen, setPropertiesOpen] = useState(false);
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
  const fieldInput = useRef<HTMLInputElement>(null);
  const contentsButton = useRef<HTMLButtonElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const modalDestination = useRef<(() => void) | null>(null);
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
  const hasSignature = snapshot.marks.some((mark) => mark.kind === 'signature');
  const signingStep = pending?.kind === 'signature' ? 2 : hasSignature ? 3 : 1;

  const selectedFieldLabel = fields.find(
    (field) => field.id === selectedField,
  )?.label;
  function signatureWidth(text: string, style?: string) {
    return fontsReady ? measureSignature(text, style) : null;
  }
  const draftWidth = signatureWidth(signatureName.trim(), signatureStyle);
  const draftSignature = signatureBox(draftWidth ?? 0, tool === 'initials');
  function markFit(mark: Mark) {
    const width = signatureWidth(mark.text, mark.signatureStyle);
    return signatureFit(
      width ?? Number.POSITIVE_INFINITY,
      mark.width,
      mark.height,
    );
  }
  const invalidSignatures = snapshot.marks.filter(
    (mark) =>
      (mark.kind === 'signature' || mark.kind === 'initials') &&
      !mark.strokes &&
      !markFit(mark).fits,
  );
  const selectedText =
    selected && markDraft?.id === selected.id ? markDraft.text : selected?.text;

  const scale =
    zoom === 'page'
      ? Math.max(
          0.2,
          Math.min(stageSize.width / 612, (stageSize.height - 48) / 792, 1),
        )
      : zoom === 'width'
        ? Math.max(0.2, stageSize.width / 612)
        : Number(zoom);

  useEffect(() => {
    let mounted = true;
    void document.fonts.ready.then(() => {
      if (mounted) setFontsReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
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
      if (!gesture.current)
        selectedControl.current?.scrollIntoView({
          block: 'center',
          inline: 'nearest',
        });
    }
  }, [selectedId]);
  useEffect(() => {
    // A touch tray changes the canvas after layout. Reveal the object without
    // taking focus away from the properties being edited.
    const frame = requestAnimationFrame(() => {
      const target = selectedField
        ? paper.current?.querySelector<HTMLElement>(
            `[data-field="${selectedField}"]`,
          )
        : selectedControl.current;
      target?.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (
        editingViewport.keyboard &&
        inspector.current?.contains(document.activeElement)
      )
        (document.activeElement as HTMLElement).scrollIntoView({
          block: 'nearest',
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    propertiesOpen,
    editingViewport.height,
    editingViewport.keyboard,
    selectedField,
  ]);

  function commit(next: Snapshot) {
    if (same(snapshot, next)) return;
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
  }
  function updateMark(mark: Mark) {
    const original = snapshot.marks.find((item) => item.id === mark.id);
    if (
      (mark.kind === 'signature' || mark.kind === 'initials') &&
      !mark.strokes &&
      original?.text === mark.text &&
      (original.width !== mark.width || original.height !== mark.height) &&
      !markFit(mark).fits
    ) {
      setNotice(
        'That size would make the signature unreadable. Keep it larger, or edit the name/style.',
      );
      return false;
    }
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
    return true;
  }
  function undo(redo = false) {
    setSelectedField(null);
    if (document.activeElement?.closest('[data-design-mark]'))
      requestAnimationFrame(() => contentsButton.current?.focus());
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
  function reviewExport() {
    setExportState('review');
    openModal('export');
  }
  function placePending() {
    place(
      pending?.kind === 'date' ? 435 : pageId === 'checklist' ? 71 : 158,
      pageId === 'details' && pending?.kind === 'text'
        ? 606
        : pageId === 'details' && pending?.kind === 'initials'
          ? 676
          : pending?.kind === 'date' ||
              pending?.kind === 'signature' ||
              pending?.kind === 'initials'
            ? 625
            : 566,
    );
  }
  function changePage(value: string) {
    setSelectedField(null);
    setMarkDraft(null);
    setPropertiesOpen(false);
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
    setSelectedField(null);
    setMarkDraft(null);
    setHistory(newHistory());
    setMode(form ? 'edit' : 'sign');
    setPageId(form ? 'details' : 'offer');
    setSelectedId(null);
    setPending(null);
    setPropertiesOpen(false);
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
    setSelectedField(null);
    setMarkDraft(null);
    setPropertiesOpen(false);
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
    const typed =
      (kind === 'signature' || kind === 'initials') && !pending.strokes
        ? signatureBox(
            signatureWidth(pending.text ?? '', pending.signatureStyle) ?? 0,
            kind === 'initials',
          )
        : null;
    const width =
      typed?.width ??
      (kind === 'signature'
        ? 190
        : kind === 'initials'
          ? 80
          : kind === 'check'
            ? 26
            : 160);
    const height =
      typed?.height ?? (kind === 'signature' || kind === 'initials' ? 58 : 32);
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
    setSelectedField(null);
    setSelectedId(mark.id);
    setPropertiesOpen(kind === 'text' || kind === 'date');
    setPending(null);
    setTool('select');
    if (kind === 'text' || kind === 'date')
      requestAnimationFrame(() => textInput.current?.focus());
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
    setSelectedField(null);
    setMarkDraft(null);
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
      let width = clamp(mark.width + dx, 40, 612 - mark.x);
      let height =
        mark.kind === 'signature' || mark.kind === 'initials'
          ? (width * mark.height) / mark.width
          : clamp(mark.height + dy, 24, 792 - mark.y);
      if (mark.kind === 'signature' || mark.kind === 'initials') {
        const factor = Math.min(1, (792 - mark.y) / height);
        width *= factor;
        height *= factor;
      }
      setPreviewMark(boundMark({ ...mark, width, height }));
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
    requestAnimationFrame(() => contentsButton.current?.focus());
  }
  function selectField(id: string) {
    setSelectedField(id);
    setSelectedId(null);
    setPending(null);
    setTool('select');
    setPropertiesOpen(true);
    setNotice(
      `${fields.find((field) => field.id === id)?.label} selected. Edit its value in properties.`,
    );
    requestAnimationFrame(() =>
      fieldInput.current?.focus({ preventScroll: true }),
    );
  }
  function selectMark(mark: Mark, edit = false) {
    setSelectedField(null);
    setMarkDraft(null);
    setSelectedId(mark.id);
    setPropertiesOpen(edit);
    setNotice(
      `${toolNames[mark.kind]} selected: ${mark.text}. Enter edits; arrow keys move; Delete removes.`,
    );
    if (edit)
      requestAnimationFrame(() =>
        (textInput.current ?? selectedControl.current)?.focus({
          preventScroll: true,
        }),
      );
  }
  function saveField(id: string, value: string) {
    if (value !== (snapshot.fields[id] ?? ''))
      commit({ ...snapshot, fields: { ...snapshot.fields, [id]: value } });
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
      data-properties-open={propertiesOpen && !!(selected || selectedField)}
      data-keyboard-open={editingViewport.keyboard}
      style={
        {
          '--editing-height': editingViewport.height
            ? `${editingViewport.height}px`
            : undefined,
          '--editing-top': `${editingViewport.top}px`,
        } as CSSProperties
      }
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
      <a className={s.skipEditor} href="#design-view-controls">
        Skip to document controls
      </a>
      <p id="design-editor-help" className="sr-only">
        Editor controls expose supported fields and added marks. Printed sample
        artwork is not an accessible PDF reading view. No PDF reading or tagging
        is provided. Use Page contents to select objects without coordinates.
      </p>
      <p id="design-selection-help" className="sr-only">
        Enter opens properties. Arrows move one point; Shift plus arrows moves
        ten. Delete removes; Undo restores. Use Advanced for precise position
        and size.
      </p>
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
            PDF Tools <span>2.0 · Prototype</span>
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
          <LockKeyhole size={13} /> Synthetic sample · In this tab only
        </span>
        <div className={s.headerActions}>
          <AppearanceSelect />
          <Control label="Interaction guide" onClick={() => openModal('help')}>
            <CircleHelp size={18} />
          </Control>
          <button
            type="button"
            className={
              hasSignature || mode === 'edit' ? s.primary : s.secondary
            }
            aria-label="Download"
            disabled={!loaded || demoState !== 'ready'}
            onClick={reviewExport}
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
            </aside>
            <div className={s.documentArea}>
              <div
                className={s.viewControls}
                id="design-view-controls"
                tabIndex={-1}
                role="group"
                aria-label="Document navigation"
              >
                <Control
                  label={
                    railOpen ? 'Hide page thumbnails' : 'Show page thumbnails'
                  }
                  expanded={railOpen}
                  className={`${s.showPages} ${s.desktopPages}`}
                  onClick={() => setRailOpen(!railOpen)}
                >
                  <LayoutGrid size={16} />
                  <span>{railOpen ? 'Pages' : 'Show pages'}</span>
                </Control>
                <Control
                  label="Show page thumbnails"
                  className={`${s.showPages} ${s.mobilePages}`}
                  onClick={() => openModal('pages')}
                >
                  <LayoutGrid size={16} />
                </Control>
                <button
                  ref={contentsButton}
                  type="button"
                  className={s.contentsButton}
                  aria-label="Page contents"
                  onClick={() => openModal('contents')}
                >
                  <FileText size={16} />
                  <span>Contents</span>
                </button>
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
                          0.25,
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
                role="region"
                aria-describedby="design-editor-help"
                tabIndex={0}
              >
                <div className={s.pageSurface}>
                  <div className={s.pageCaption} style={{ width: 612 * scale }}>
                    <span>{pageNames[pageId]}</span>
                    <span>{Math.round(scale * 100)}% · Synthetic sample</span>
                  </div>
                  <div
                    className={s.paperSizing}
                    style={{ width: 612 * scale, height: 792 * scale }}
                  >
                    <div
                      ref={paper}
                      data-testid="design-paper"
                      role="group"
                      aria-label={`Page ${pageIndex + 1} of ${snapshot.pages.length}: ${pageNames[pageId]}`}
                      className={`${s.paper} ${pending ? s.placing : ''}`}
                      style={
                        {
                          transform: `scale(${scale})`,
                          '--page-scale': scale,
                        } as CSSProperties
                      }
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
                        fields.map((field, index) => (
                          <label
                            className={s.supportedField}
                            key={field.id}
                            data-field={field.id}
                            style={{ top: 297 + index * 90 }}
                          >
                            <span className="sr-only">{field.label}</span>
                            <span className={s.fieldArtwork} aria-hidden="true">
                              {fieldDrafts[field.id] ??
                                snapshot.fields[field.id] ??
                                'Tap to edit'}
                            </span>
                            <input
                              aria-label={field.label}
                              aria-describedby="design-editor-help"
                              value={
                                fieldDrafts[field.id] ??
                                snapshot.fields[field.id] ??
                                ''
                              }
                              tabIndex={scale < 0.5 ? -1 : 0}
                              disabled={scale < 0.5}
                              onFocus={() => selectField(field.id)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setFieldDrafts({
                                  ...fieldDrafts,
                                  [field.id]: event.target.value,
                                })
                              }
                              onBlur={(event) =>
                                saveField(field.id, event.target.value)
                              }
                              maxLength={80}
                            />
                          </label>
                        ))}
                      {pageId === 'details' && scale < 0.5 && (
                        <button
                          type="button"
                          className={s.fieldGroupTarget}
                          onClick={(event) => {
                            event.stopPropagation();
                            openModal('contents');
                          }}
                        >
                          <span>3 fields · Edit</span>
                        </button>
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
                          const shownText =
                            isSelected && markDraft?.id === mark.id
                              ? markDraft.text
                              : mark.text;
                          const typedSignature =
                            (mark.kind === 'signature' ||
                              mark.kind === 'initials') &&
                            !mark.strokes;
                          const fit = typedSignature
                            ? markFit({ ...mark, text: shownText })
                            : null;
                          return (
                            <div
                              key={mark.id}
                              data-design-mark={mark.id}
                              data-signature-fits={fit?.fits}
                              className={`${s.mark} ${isSelected ? s.selectedMark : ''}`}
                              style={
                                {
                                  left: mark.x,
                                  top: mark.y,
                                  width: mark.width,
                                  height: mark.height,
                                  '--page-scale': scale,
                                  '--mark-width': `${mark.width}px`,
                                  '--mark-height': `${mark.height}px`,
                                } as CSSProperties
                              }
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
                                  fontSize: fit?.size ?? mark.size,
                                  fontWeight: mark.bold ? 700 : 400,
                                }}
                                aria-describedby="design-selection-help"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (selectedId !== mark.id) selectMark(mark);
                                }}
                                onDoubleClick={() => selectMark(mark, true)}
                                onPointerDown={(event) =>
                                  startGesture(event, mark)
                                }
                                onPointerMove={moveGesture}
                                onPointerUp={() => endGesture()}
                                onPointerCancel={() => endGesture(true)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    selectMark(mark, true);
                                    return;
                                  }
                                  const delta = event.shiftKey ? 10 : 1;
                                  const moves: Record<
                                    string,
                                    [number, number]
                                  > = {
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
                                <span
                                  className={s.markArtwork}
                                  aria-hidden="true"
                                >
                                  {fit && !fit.fits ? (
                                    <span className={s.markOverflow}>
                                      Needs more space
                                    </span>
                                  ) : mark.strokes ? (
                                    <svg
                                      viewBox="0 0 420 140"
                                      aria-hidden="true"
                                    >
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
                                      {shownText}
                                    </span>
                                  )}
                                </span>
                              </button>
                              {isSelected && (
                                <>
                                  <span className={s.selectionLabel}>
                                    {toolNames[mark.kind]}
                                  </span>
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
                                              ? (width * mark.height) /
                                                mark.width
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
                    {pending
                      ? 'Tap the page to place · Escape to cancel'
                      : 'Synthetic document · Original stays unchanged'}
                  </p>
                </div>
              </div>
              {(mode === 'sign' || pending) && (
                <div
                  className={s.signGuide}
                  aria-label={
                    mode === 'sign' ? 'Quick Sign guide' : 'Placement guide'
                  }
                >
                  <div className={s.guideCopy}>
                    {mode === 'sign' && (
                      <ol className={s.signSteps} aria-label="Signing progress">
                        {['Create', 'Place', 'Download'].map((step, index) => (
                          <li
                            key={step}
                            aria-current={
                              signingStep === index + 1 ? 'step' : undefined
                            }
                            data-complete={signingStep > index + 1}
                          >
                            <b>
                              {signingStep > index + 1 ? (
                                <Check size={10} />
                              ) : (
                                index + 1
                              )}
                            </b>
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}
                    <p>
                      {pending
                        ? 'Ready to place. Tap the page or use the button.'
                        : hasSignature
                          ? 'Signature placed. Review every page before sharing.'
                          : 'Your offer is open. Make it yours.'}
                    </p>
                  </div>
                  {pending ? (
                    <>
                      <button
                        ref={placementButton}
                        type="button"
                        className={s.primary}
                        onClick={placePending}
                      >
                        <PenLine size={16} />
                        {(pending.kind === 'signature' ||
                          pending.kind === 'initials') &&
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
                        <X size={16} />
                      </Control>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={s.primary}
                      onClick={
                        hasSignature
                          ? reviewExport
                          : () => chooseTool('signature')
                      }
                    >
                      {hasSignature ? (
                        <Download size={16} />
                      ) : (
                        <PenLine size={16} />
                      )}
                      {hasSignature ? 'Review & download' : 'Create signature'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {(selected || selectedField) && (
              <aside
                ref={inspector}
                className={`${s.inspector} ${propertiesOpen ? s.expandedInspector : ''}`}
                aria-label="Selected element properties"
              >
                <div className={s.inspectorTitle}>
                  <div>
                    <span>SELECTED</span>
                    <h2>
                      {selected ? toolNames[selected.kind] : selectedFieldLabel}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className={s.editProperties}
                    aria-expanded={propertiesOpen}
                    aria-controls="design-properties"
                    onClick={() => {
                      setPropertiesOpen(!propertiesOpen);
                      if (propertiesOpen) {
                        (document.activeElement as HTMLElement)?.blur();
                        requestAnimationFrame(() =>
                          (selected
                            ? selectedControl.current
                            : contentsButton.current
                          )?.focus({ preventScroll: true }),
                        );
                      }
                    }}
                  >
                    {propertiesOpen ? 'Done' : 'Edit'}
                    <ChevronDown size={15} />
                  </button>
                  <Control
                    label={selected ? 'Deselect mark' : 'Deselect field'}
                    onClick={() => {
                      setSelectedId(null);
                      setSelectedField(null);
                      contentsButton.current?.focus();
                    }}
                  >
                    <X size={16} />
                  </Control>
                </div>
                <div id="design-properties" className={s.propertyBody}>
                  {selected ? (
                    <>
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
                            key={selected.id}
                            aria-label="Selected mark text"
                            value={selectedText ?? ''}
                            onChange={(event) =>
                              setMarkDraft({
                                id: selected.id,
                                text: event.target.value,
                              })
                            }
                            maxLength={160}
                            onBlur={(event) => {
                              if (event.target.value !== selected.text)
                                updateMark({
                                  ...selected,
                                  text: event.target.value,
                                });
                              setMarkDraft(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter')
                                event.currentTarget.blur();
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
                      ) : selected.kind === 'signature' ||
                        selected.kind === 'initials' ? (
                        <div className={s.signatureSize}>
                          <span>Signature size</span>
                          <div className={s.propertyRow}>
                            {[-1, 1].map((direction) => (
                              <button
                                key={direction}
                                type="button"
                                className={s.secondary}
                                aria-label={
                                  direction < 0
                                    ? 'Smaller signature'
                                    : 'Larger signature'
                                }
                                onClick={() => {
                                  const width = clamp(
                                    selected.width + direction * 12,
                                    40,
                                    560,
                                  );
                                  updateMark({
                                    ...selected,
                                    width,
                                    height:
                                      (width * selected.height) /
                                      selected.width,
                                  });
                                }}
                              >
                                {direction < 0 ? (
                                  <Minus size={14} />
                                ) : (
                                  <Plus size={14} />
                                )}
                                {direction < 0 ? 'Smaller' : 'Larger'}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {(selected.kind === 'signature' ||
                        selected.kind === 'initials') &&
                        !selected.strokes && (
                          <>
                            {!markFit({ ...selected, text: selectedText ?? '' })
                              .fits && (
                              <p className={s.fitWarning} role="alert">
                                This name needs more space at a readable size.
                                Enlarge the signature or edit its name. The full
                                name is preserved.
                              </p>
                            )}
                            <label className={s.propertyField}>
                              Signature style
                              <select
                                aria-label="Selected signature style"
                                value={selected.signatureStyle ?? 'classic'}
                                onChange={(event) =>
                                  updateMark({
                                    ...selected,
                                    signatureStyle: event.target.value,
                                  })
                                }
                              >
                                <option value="classic">Classic</option>
                                <option value="simple">Simple</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              className={s.smallAction}
                              onClick={() => {
                                const box = signatureBox(
                                  signatureWidth(
                                    selected.text,
                                    selected.signatureStyle,
                                  ) ?? 0,
                                  selected.kind === 'initials',
                                );
                                if (box.fits)
                                  updateMark({
                                    ...selected,
                                    width: box.width,
                                    height:
                                      (box.width * selected.height) /
                                      selected.width,
                                  });
                                else
                                  setNotice(
                                    'This name cannot fit on the sample at the minimum readable size. Edit the name or try the other style.',
                                  );
                              }}
                            >
                              Fit signature to name
                            </button>
                          </>
                        )}
                      <div
                        className={s.moveControls}
                        role="group"
                        aria-label="Move selected mark"
                      >
                        {[
                          ['left', -5, 0],
                          ['up', 0, -5],
                          ['down', 0, 5],
                          ['right', 5, 0],
                        ].map(([direction, dx, dy]) => (
                          <button
                            type="button"
                            key={direction}
                            aria-label={`Move selected mark ${direction}`}
                            onClick={() => {
                              updateMark({
                                ...selected,
                                x: selected.x + Number(dx),
                                y: selected.y + Number(dy),
                              });
                              setNotice(`Moved ${direction} by 5 page points.`);
                            }}
                          >
                            {direction === 'left'
                              ? '←'
                              : direction === 'right'
                                ? '→'
                                : direction === 'up'
                                  ? '↑'
                                  : '↓'}
                          </button>
                        ))}
                      </div>
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
                              className={
                                ink === 'blue' ? s.blueInk : s.blackInk
                              }
                            />
                            {ink === 'blue' ? 'Blue' : 'Black'}
                          </label>
                        ))}
                      </fieldset>
                      <p className={s.propertyHint}>
                        Drag to move. Use the corner to resize.
                      </p>
                      <details key={selected.id} className={s.advanced}>
                        <summary>
                          Advanced <ChevronDown size={15} />
                        </summary>
                        <h3>Position & size</h3>
                        <div className={s.measurements}>
                          {(['x', 'y', 'width', 'height'] as const).map(
                            (key) => (
                              <label
                                key={`${selected.id}-${key}-${selected[key]}`}
                              >
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
                                  max={
                                    key === 'height' || key === 'y' ? 792 : 612
                                  }
                                  defaultValue={Math.round(selected[key])}
                                  onBlur={(event) => {
                                    const value = Number(event.target.value);
                                    if (
                                      Number.isFinite(value) &&
                                      value !== Math.round(selected[key])
                                    ) {
                                      const next = {
                                        ...selected,
                                        [key]: value,
                                      };
                                      if (
                                        selected.kind === 'signature' ||
                                        selected.kind === 'initials'
                                      ) {
                                        if (key === 'width')
                                          next.height =
                                            (value * selected.height) /
                                            selected.width;
                                        if (key === 'height')
                                          next.width =
                                            (value * selected.width) /
                                            selected.height;
                                      }
                                      if (!updateMark(next))
                                        event.currentTarget.value = String(
                                          Math.round(selected[key]),
                                        );
                                    }
                                  }}
                                />
                              </label>
                            ),
                          )}
                        </div>
                        <p className={s.propertyHint}>
                          Page points · Arrow keys move 1 point. Shift moves 10.
                        </p>
                      </details>
                      <button
                        type="button"
                        className={s.deleteButton}
                        onClick={removeMark}
                      >
                        <Trash2 size={15} /> Delete element
                      </button>
                    </>
                  ) : (
                    selectedField && (
                      <label className={s.propertyField}>
                        Field value
                        <input
                          ref={fieldInput}
                          aria-label="Selected field value"
                          value={
                            fieldDrafts[selectedField] ??
                            snapshot.fields[selectedField] ??
                            ''
                          }
                          maxLength={80}
                          onChange={(event) =>
                            setFieldDrafts({
                              ...fieldDrafts,
                              [selectedField]: event.target.value,
                            })
                          }
                          onBlur={(event) =>
                            saveField(selectedField, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter')
                              event.currentTarget.blur();
                          }}
                        />
                      </label>
                    )
                  )}
                </div>
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
        <label className={s.reviewControl}>
          <span>Prototype</span>
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
        <span role="status" aria-live="polite">
          {notice}
        </span>
        <button
          type="button"
          aria-label="Restart sample"
          onClick={() => requestSample()}
        >
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
            style={
              editingViewport.height
                ? {
                    top: editingViewport.top + editingViewport.height / 2,
                    maxHeight: editingViewport.height - 24,
                  }
                : undefined
            }
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (modalDestination.current) {
                const focus = modalDestination.current;
                modalDestination.current = null;
                requestAnimationFrame(focus);
              } else if (pending) placementButton.current?.focus();
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
            {modal === 'contents' ? (
              <>
                <Dialog.Title>Page contents</Dialog.Title>
                <Dialog.Description>
                  Page {pageIndex + 1}: {pageNames[pageId]}. Choose a field or
                  mark to edit. This lists editor objects, not printed PDF
                  content or reading order.
                </Dialog.Description>
                <button
                  type="button"
                  className={s.smallAction}
                  onClick={() => setModal('pages')}
                >
                  View page thumbnails
                </button>
                <div className={s.contentsList}>
                  {pageId === 'details' && (
                    <>
                      <h3>Supported fields</h3>
                      {fields.map((field) => (
                        <button
                          type="button"
                          key={field.id}
                          onClick={() => {
                            selectField(field.id);
                            modalDestination.current = () =>
                              fieldInput.current?.focus();
                            setModal(null);
                          }}
                        >
                          {field.label}
                          <span>
                            {fieldDrafts[field.id] ??
                              snapshot.fields[field.id] ??
                              'Empty'}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  <h3>Added marks</h3>
                  {snapshot.marks
                    .filter((mark) => mark.page === pageId)
                    .map((mark, index) => (
                      <button
                        type="button"
                        key={mark.id}
                        onClick={() => {
                          selectMark(mark, true);
                          modalDestination.current = () =>
                            (
                              textInput.current ?? selectedControl.current
                            )?.focus();
                          setModal(null);
                        }}
                      >
                        {index + 1}. {toolNames[mark.kind]}
                        <span>{mark.text}</span>
                      </button>
                    ))}
                  {!snapshot.marks.some((mark) => mark.page === pageId) && (
                    <p>
                      No added marks on this page. Choose a tool, then use Place
                      on page.
                    </p>
                  )}
                </div>
              </>
            ) : modal === 'signature' ? (
              <>
                <span className={s.eyebrow}>MAKE IT YOURS</span>
                <Dialog.Title>
                  Create your {tool === 'initials' ? 'initials' : 'signature'}
                </Dialog.Title>
                <Dialog.Description>
                  Type your name or draw. Next, place it on the sample.
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
                      maxLength={160}
                      onChange={(event) => setSignatureName(event.target.value)}
                    />
                  </label>
                ) : (
                  <p className={s.drawHint}>
                    Draw with a finger, pen or mouse. Typing is available for
                    keyboard use.
                  </p>
                )}
                <div
                  className={s.signaturePreview}
                  role="region"
                  aria-label="Signature preview, scroll horizontally for the full name"
                  tabIndex={0}
                >
                  <span>
                    {signatureMode === 'type'
                      ? 'YOUR SIGNATURE PREVIEW'
                      : 'DRAW YOUR SIGNATURE'}
                  </span>
                  {signatureMode === 'type' ? (
                    <div
                      className={`${s.signatureText} ${signatureStyle === 'simple' ? s.simpleSignature : ''}`}
                      style={{
                        minWidth: signatureName
                          ? Math.max(
                              draftSignature.width,
                              ((draftWidth ?? 0) * draftSignature.size) / 32,
                            ) + 48
                          : undefined,
                        fontSize: draftSignature.size,
                      }}
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
                {signatureMode === 'type' && (
                  <p className={s.signatureFitCopy} role="status">
                    {!fontsReady || draftWidth === null
                      ? fontsReady
                        ? 'Local font measurement is unavailable. Try Draw.'
                        : 'Measuring local font…'
                      : !draftSignature.fits
                        ? `This name cannot fit at 18 pt or larger. ${signatureStyle === 'classic' ? 'Edit the name or try Simple style.' : 'Edit the name or try Draw.'}`
                        : `Sample size: ${draftSignature.size} pt. Scroll the preview for the full name when needed.`}
                  </p>
                )}
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
                  <LockKeyhole size={14} />
                  Visual preview only; PDF font/export quality is unverified. No
                  identity verification, certificate or signing audit trail.
                </p>
                <div className={s.modalActions}>
                  <Dialog.Close className={s.secondary}>Cancel</Dialog.Close>
                  <button
                    type="button"
                    className={s.primary}
                    disabled={
                      signatureMode === 'type'
                        ? !signatureName.trim() ||
                          !fontsReady ||
                          draftWidth === null ||
                          !draftSignature.fits
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
                <span
                  className={`${s.modalIcon} ${exportState === 'done' ? s.completedIcon : ''}`}
                  aria-hidden="true"
                >
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
                    ? 'Preview complete'
                    : exportState === 'working'
                      ? 'Previewing the download step'
                      : exportState === 'error'
                        ? 'Your copy could not be prepared'
                        : 'Review before downloading'}
                </Dialog.Title>
                <Dialog.Description>
                  {exportState === 'done'
                    ? 'This was a preview only. No PDF was created or downloaded. Your sample edits are still here, until you close or reload this tab.'
                    : exportState === 'error'
                      ? 'The preview hit a simulated error. Your sample edits are intact. Try again without starting over.'
                      : 'Check the pages, fields and marks. This prototype previews the download flow; it does not create a PDF or save your work.'}
                </Dialog.Description>
                <div className={s.exportSummary}>
                  <FileCheck2 size={28} />
                  <div>
                    <strong>{title || 'Completed document'}.pdf</strong>
                    <span>
                      {snapshot.pages.length} pages · {snapshot.marks.length}{' '}
                      {snapshot.marks.length === 1 ? 'mark' : 'marks'} ·{' '}
                      {Object.values(snapshot.fields).filter(Boolean).length}{' '}
                      filled fields
                    </span>
                  </div>
                  <span className={s.prototypePill}>SIMULATED</span>
                </div>
                <div className={s.exportNotice}>
                  <LockKeyhole size={16} />
                  <div>
                    <strong>
                      {exportState === 'done'
                        ? 'Your original stays unchanged'
                        : 'A separate copy, when implemented'}
                    </strong>
                    <p>
                      {exportState === 'done'
                        ? 'Keep editing to adjust your sample. Nothing was saved or sent.'
                        : 'The proposed PDF output flattens supported fields and marks. Review it before sharing.'}
                    </p>
                  </div>
                </div>
                {invalidSignatures.length > 0 && (
                  <p className={s.fitWarning} role="alert">
                    Adjust {invalidSignatures.length} signature(s) that need
                    more space before previewing a download.
                  </p>
                )}
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
                    className={exportState === 'done' ? s.primary : s.secondary}
                    disabled={exportState === 'working'}
                  >
                    {exportState === 'done'
                      ? 'Keep editing'
                      : 'Back to document'}
                  </Dialog.Close>
                  {exportState !== 'done' && (
                    <button
                      type="button"
                      className={s.primary}
                      disabled={
                        exportState === 'working' ||
                        invalidSignatures.length > 0
                      }
                      onClick={simulateExport}
                    >
                      <Download size={16} />
                      {exportState === 'error'
                        ? 'Retry simulation'
                        : exportState === 'working'
                          ? 'Previewing…'
                          : 'Preview download'}
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
