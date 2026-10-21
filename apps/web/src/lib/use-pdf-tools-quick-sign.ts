'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalPdfDocument } from './use-pdf-tools-document';
import {
  emptyPdfEdits,
  editHistory,
  stepHistory,
  PDF_TOOLS_LIMITS,
  overlapsPdfFormField,
  PDF_FORM_OVERLAP_ERROR,
  pdfFieldsError,
  type PdfHistory,
  type PdfElement,
  type Point,
} from './pdf-tools-model';
import { moveSignature } from './pdf-tools-signature';
import { pdfMarkPng } from '@/components/pdf-tools-marks';
import { exportQuickSign } from './pdf-tools-quick-export';
import {
  fitTextContent,
  markName,
  measuredPdfText,
  defaultMarkPoint,
} from './pdf-tools-editing';
import {
  organizedInfo,
  organizePages,
  pagePlan,
} from './pdf-tools-organization';

const initialHistory = (): PdfHistory => ({
  past: [],
  present: emptyPdfEdits(),
  future: [],
});
export function usePdfToolsQuickSign(document: LocalPdfDocument) {
  const [history, setHistoryState] = useState<PdfHistory>(initialHistory);
  const historyRef = useRef(history);
  const pageEdits = history.present.pages;
  const info = useMemo(
    () => organizedInfo(document.info, { pages: pageEdits }),
    [document.info, pageEdits],
  );
  const pages = useMemo(
    () => pagePlan(document.info, { pages: pageEdits }),
    [document.info, pageEdits],
  );
  const position = (source: number) =>
    pages.findIndex((page) => page.source === source) + 1;
  const transaction = useRef<PdfHistory | null>(null);
  const setHistory = (update: (current: PdfHistory) => PdfHistory) => {
    const next = update(historyRef.current);
    historyRef.current = next;
    setHistoryState(next);
  };
  const [editingText, setEditingText] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [pending, setPending] = useState<PdfElement | null>(null);
  const [notice, setNotice] = useState('Create a signature to get started.');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [handedOff, setHandedOff] = useState(JSON.stringify(emptyPdfEdits()));
  const controller = useRef<AbortController | null>(null);
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const selectedMark =
    history.present.elements.find((mark) => mark.id === selected) ?? null;
  const dirty = JSON.stringify(history.present) !== handedOff;
  useEffect(
    () => () => {
      controller.current?.abort();
      for (const [url, timer] of downloadUrls.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
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
  const focusMark = (id: string) =>
    requestAnimationFrame(() =>
      window.document
        .querySelector<HTMLButtonElement>(`[data-mark-id="${id}"]`)
        ?.focus(),
    );
  const beginEdit = () => {
    transaction.current ??= historyRef.current;
  };
  const commitEdit = () => {
    const baseline = transaction.current;
    transaction.current = null;
    if (baseline)
      setHistory((current) =>
        JSON.stringify(current.present) === JSON.stringify(baseline.present)
          ? { ...current, past: baseline.past, future: baseline.future }
          : editHistory(baseline, current.present),
      );
    return historyRef.current.present;
  };
  const finishEditing = () => {
    commitEdit();
    setEditingText(null);
  };
  const startTextEditing = (id: string) => {
    finishEditing();
    setSelected(id);
    setPropertiesOpen(true);
    setEditingText(id);
    requestAnimationFrame(() => {
      const editor = Array.from(
        window.document.querySelectorAll<HTMLTextAreaElement>(
          `[data-text-editor="${id}"]`,
        ),
      ).find((node) => node.getClientRects().length);
      editor?.focus();
      editor?.setSelectionRange(editor.value.length, editor.value.length);
    });
  };
  const draftText = (mark: PdfElement) => {
    if (busy) return;
    beginEdit();
    const previous = historyRef.current.present.elements.find(
      (item) => item.id === mark.id,
    );
    let next = fitTextContent(mark, info.pages[mark.page]);
    const collision = overlapsPdfFormField(next, info);
    if (collision && previous)
      next = {
        ...next,
        x: previous.x,
        y: previous.y,
        width: previous.width,
        height: previous.height,
      };
    setHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        elements: current.present.elements.map((item) =>
          item.id === mark.id ? next : item,
        ),
      },
    }));
    setError(collision ? PDF_FORM_OVERLAP_ERROR : measuredPdfText(next).error);
  };
  const fieldChange = (
    name: string,
    value: string | boolean,
    immediate = false,
  ) => {
    if (busy) return;
    const spec = document.info.fields.find((field) => field.name === name);
    if (!spec || spec.readOnly) {
      setError('This form field is read-only.');
      return;
    }
    if (immediate) finishEditing();
    beginEdit();
    setHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        fields: { ...current.present.fields, [name]: value },
      },
    }));
    setError(pdfFieldsError(document.info, historyRef.current.present.fields));
    if (immediate) {
      commitEdit();
      setNotice('Form value updated. Undo restores its previous value.');
    }
  };
  const change = (mark: PdfElement) => {
    if (busy) return;
    finishEditing();
    if (overlapsPdfFormField(mark, info)) {
      setError(PDF_FORM_OVERLAP_ERROR);
      return;
    }
    setHistory((current) =>
      editHistory(current, {
        ...current.present,
        elements: current.present.elements.map((item) =>
          item.id === mark.id ? mark : item,
        ),
      }),
    );
    setError('');
    setNotice(`${markName(mark)} updated on page ${position(mark.page)}.`);
  };
  const remove = (id: string) => {
    if (busy) return;
    finishEditing();
    setHistory((current) =>
      editHistory(current, {
        ...current.present,
        elements: current.present.elements.filter((mark) => mark.id !== id),
      }),
    );
    setSelected(null);
    setPropertiesOpen(false);
    setNotice('Mark deleted. Undo restores it.');
    requestAnimationFrame(() =>
      window.document.getElementById('pdf-v2-marks')?.focus(),
    );
  };
  const place = (page: number, point: Point) => {
    if (!pending || busy) return;
    finishEditing();
    if (
      !window.document.querySelector(
        `[data-page-index="${page}"] canvas[data-rendered="true"]`,
      )
    ) {
      setError('Wait for this page to render before placing added content.');
      return;
    }
    if (history.present.elements.length >= PDF_TOOLS_LIMITS.elements) {
      setError(
        'Use at most 100 added elements. Delete one before placing another.',
      );
      return;
    }
    const geometry = info.pages[page];
    if (
      pending.width > geometry.viewWidth ||
      pending.height > geometry.viewHeight
    ) {
      setError(
        'This signature is wider than this page. Choose a larger page or create a smaller readable signature.',
      );
      return;
    }
    const mark = moveSignature(
      { ...pending, id: crypto.randomUUID(), page },
      point.x - (pending.kind === 'text' ? 0 : pending.width / 2),
      point.y - (pending.kind === 'text' ? 0 : pending.height / 2),
      geometry,
    );
    if (overlapsPdfFormField(mark, info)) {
      setError(PDF_FORM_OVERLAP_ERROR);
      return;
    }
    setHistory((current) =>
      editHistory(current, {
        ...current.present,
        elements: [...current.present.elements, mark],
      }),
    );
    setPending(null);
    setSelected(mark.id);
    setPropertiesOpen(window.matchMedia('(min-width: 761px)').matches);
    setError('');
    setNotice(
      `${markName(mark)} placed on page ${position(page)}. Adjust it, then download a completed copy.`,
    );
    if (mark.kind === 'text') startTextEditing(mark.id);
    else focusMark(mark.id);
  };
  const placeDefault = (page: number) => {
    if (!pending) return;
    const point = defaultMarkPoint(
      pending,
      page,
      info,
      historyRef.current.present.elements,
    );
    if (!point) {
      setError(
        'There is no blank space for this mark. Choose another page or a smaller mark.',
      );
      return;
    }
    place(page, point);
  };
  const historyStep = (direction: 'undo' | 'redo') => {
    if (busy) return;
    finishEditing();
    setHistory((current) => stepHistory(current, direction));
    setSelected(null);
    setPropertiesOpen(false);
    setPending(null);
    setNotice(
      direction === 'undo' ? 'Last change undone.' : 'Change restored.',
    );
    setError('');
  };
  const organize = (operation: Parameters<typeof organizePages>[2]) => {
    if (busy) return;
    finishEditing();
    try {
      const before = historyRef.current;
      const next = organizePages(document.info, before.present, operation);
      if (next === before.present) return;
      setHistory(() => editHistory(before, next));
      setSelected(null);
      setPropertiesOpen(false);
      setPending(null);
      setError('');
      setNotice(
        operation.kind === 'move'
          ? `Page ${position(operation.source)} moved to position ${operation.to + 1}. Undo restores the previous order.`
          : operation.kind === 'rotate'
            ? `Page ${position(operation.source)} rotated ${operation.clockwise ? 'clockwise' : 'counterclockwise'}. Undo restores its orientation.`
            : `Page ${position(operation.source)} removed with its added content. Undo restores both.`,
      );
    } catch (problem) {
      setError((problem as Error).message);
    }
  };
  const download = async (reviewPage?: (page: number) => void) => {
    if (controller.current || signatureOpen) return;
    if (pending) {
      setError(
        `Place or cancel your pending ${markName(pending).toLowerCase()} before downloading.`,
      );
      return;
    }
    if (
      !window.document.querySelector(
        `[data-page-index][data-current="true"] canvas[data-rendered="true"]`,
      )
    ) {
      setError('Wait for the current page to render before downloading.');
      return;
    }
    const edits = commitEdit();
    const fieldError = pdfFieldsError(document.info, edits.fields, true);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    for (const mark of edits.elements) {
      if (mark.fontSize && (mark.kind === 'text' || mark.kind === 'date')) {
        const message = !mark.text.trim()
          ? 'Enter text or choose a date, or delete the empty mark before downloading.'
          : measuredPdfText(mark).error;
        if (message) {
          setError(message);
          reviewPage?.(mark.page);
          if (mark.kind === 'text') startTextEditing(mark.id);
          else {
            finishEditing();
            setSelected(mark.id);
            setPropertiesOpen(true);
          }
          return;
        }
      }
    }
    finishEditing();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError('');
    try {
      const images = [];
      for (const element of edits.elements)
        images.push({ element, png: await pdfMarkPng(element) });
      const bytes = await exportQuickSign(
        document,
        edits,
        images,
        operation.signal,
        setNotice,
      );
      if (operation.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${document.name.replace(/\.pdf$/i, '')}-completed.pdf`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 60000);
      downloadUrls.current.set(url, timer);
      setHandedOff(JSON.stringify(edits));
      setNotice(
        'Completed PDF checked and handed to your browser. Check its downloads and review every page before sharing. Device saving cannot be confirmed here.',
      );
    } catch (problem) {
      if (!operation.signal.aborted) {
        setError((problem as Error).message);
        setNotice(
          'Download was not completed. Your edits and undo history are unchanged.',
        );
      }
    } finally {
      if (!operation.signal.aborted) setBusy(false);
      controller.current = null;
    }
  };
  return {
    info,
    pages,
    organize,
    history,
    selected,
    selectedMark,
    propertiesOpen,
    signatureOpen,
    pending,
    notice,
    error,
    busy,
    dirty,
    setSelected,
    setPropertiesOpen,
    setSignatureOpen,
    setPending,
    setNotice,
    setError,
    change,
    remove,
    place,
    placeDefault,
    historyStep,
    download,
    focusMark,
    editingText,
    startTextEditing,
    finishEditing,
    beginEdit,
    commitEdit,
    draftText,
    fieldChange,
  };
}
