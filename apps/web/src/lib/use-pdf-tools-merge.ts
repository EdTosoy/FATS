'use client';
import { useEffect, useRef, useState } from 'react';
import { LocalPdfWorker } from './pdf-tools-client';
import {
  emptyPdfEdits,
  PDF_TOOLS_LIMITS,
  validateLocalPdfFile,
} from './pdf-tools-model';
import {
  emptyMergePlan,
  mergeFilename,
  mergePlanError,
  mergeResourceError,
  mergeSourceError,
  pdfFingerprint,
  type PdfMergePlan,
  type PdfMergeSource,
} from './pdf-tools-merge';
import { pdfDeadline, verifyPdfOutput } from './pdf-tools-output-verifier';
import type { LocalPdfDocument } from './use-pdf-tools-document';

type MergeSource = PdfMergeSource & {
  document: LocalPdfDocument;
  release: () => void;
};
type MergeHistory = {
  past: PdfMergePlan[];
  present: PdfMergePlan;
  future: PdfMergePlan[];
};
type Prepared = {
  document: LocalPdfDocument;
  url: string;
  release: () => void;
  requested: boolean;
};
export function usePdfToolsMerge() {
  const [sources, setSources] = useState<MergeSource[]>([]);
  const pool = useRef<MergeSource[]>([]);
  const [history, setHistory] = useState<MergeHistory>({
    past: [],
    present: emptyMergePlan(),
    future: [],
  });
  const current = useRef(history);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const copy = useRef<Prepared | null>(null);
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState(
    'Add two or more local PDFs to begin. Nothing is added automatically.',
  );
  const invalidate = () => {
    copy.current?.release();
    copy.current = null;
    setPrepared(null);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      copy.current?.release();
      for (const source of pool.current) source.release();
    };
  }, []);
  const publish = (next: MergeHistory) => {
    current.current = next;
    setHistory(next);
    invalidate();
  };
  const commit = (next: PdfMergePlan) => {
    if (
      operation.current ||
      JSON.stringify(next) === JSON.stringify(current.current.present)
    )
      return;
    publish({
      past: [...current.current.past, current.current.present].slice(
        -PDF_TOOLS_LIMITS.history,
      ),
      present: next,
      future: [],
    });
    setErrors([]);
    setNotice(
      'Merge plan updated. Review the final order and prepare a new combined copy.',
    );
  };
  const step = (direction: 'undo' | 'redo') => {
    if (operation.current) return;
    const state = current.current;
    if (direction === 'undo' && state.past.length)
      publish({
        past: state.past.slice(0, -1),
        present: state.past.at(-1)!,
        future: [state.present, ...state.future],
      });
    if (direction === 'redo' && state.future.length)
      publish({
        past: [...state.past, state.present].slice(-PDF_TOOLS_LIMITS.history),
        present: state.future[0],
        future: state.future.slice(1),
      });
    setNotice(
      `${direction === 'undo' ? 'Undid' : 'Redid'} a merge change. Your editing session is unchanged.`,
    );
  };
  const add = async (files: File[]) => {
    if (operation.current || !files.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy('add');
    setErrors([]);
    const problems: string[] = [];
    try {
      for (const file of files) {
        if (controller.signal.aborted) break;
        let opened: Awaited<ReturnType<typeof verifyPdfOutput>> | undefined;
        let worker: LocalPdfWorker | undefined;
        const abort = () => worker?.destroy();
        controller.signal.addEventListener('abort', abort, { once: true });
        try {
          validateLocalPdfFile(file);
          const capacity = mergeResourceError([
            ...pool.current,
            { size: file.size, info: { pages: [], fields: [] } },
          ]);
          if (capacity) throw new Error(capacity);
          setNotice(`Checking ${file.name}…`);
          const bytes = new Uint8Array(
            await pdfDeadline(
              file.arrayBuffer().catch(() => {
                throw new Error(
                  'This file could not be read. Choose it again.',
                );
              }),
              controller.signal,
            ),
          );
          const fingerprint = await pdfDeadline(
            pdfFingerprint(bytes),
            controller.signal,
          );
          if (pool.current.some((source) => source.fingerprint === fingerprint))
            throw new Error(
              'This exact PDF is already loaded, including files kept for Undo. Use Undo/Redo or choose another PDF.',
            );
          worker = new LocalPdfWorker();
          const result = await worker.request(
            'inspect',
            emptyPdfEdits(),
            [],
            bytes,
          );
          const blocked = mergeSourceError(result.info);
          if (blocked) throw new Error(blocked);
          const limit = mergeResourceError([
            ...pool.current,
            { size: file.size, info: result.info },
          ]);
          if (limit) throw new Error(limit);
          opened = await verifyPdfOutput(
            result.bytes,
            result.info.pages,
            controller.signal,
            () => {},
          );
          if (!alive.current || controller.signal.aborted) {
            opened.release();
            break;
          }
          const number = ++sequence.current;
          const source: MergeSource = {
            id: `file-${number}`,
            name: file.name,
            size: file.size,
            fingerprint,
            info: result.info,
            document: {
              id: number,
              name: file.name,
              size: file.size,
              original: result.bytes,
              info: result.info,
              pdf: opened.pdf,
            },
            release: opened.release,
          };
          pool.current = [...pool.current, source];
          setSources(pool.current);
          const state = current.current;
          const plan = {
            documents: [...state.present.documents, source.id],
            pages: [
              ...state.present.pages,
              ...source.info.pages.map((_, page) => ({
                document: source.id,
                page,
              })),
            ],
          };
          publish({
            past: [...state.past, state.present].slice(
              -PDF_TOOLS_LIMITS.history,
            ),
            present: plan,
            future: [],
          });
        } catch (error) {
          opened?.release();
          if (alive.current && !controller.signal.aborted) {
            problems.push(
              `${file.name.slice(0, 120)}: ${error instanceof Error ? error.message : 'This PDF could not be added. Choose a simpler copy.'}`,
            );
            setErrors([...problems]);
          }
        } finally {
          controller.signal.removeEventListener('abort', abort);
          worker?.destroy();
        }
      }
      if (alive.current && !controller.signal.aborted)
        setNotice(
          problems.length
            ? 'Some files were not added. Accepted files and your editing session are kept; review the named errors.'
            : 'Files checked and added. Review their pages and final order.',
        );
    } finally {
      if (operation.current === controller) operation.current = null;
      if (alive.current) setBusy('');
    }
  };
  const prepare = async () => {
    if (operation.current) return;
    const plan = current.current.present;
    const invalid = mergePlanError(pool.current, plan);
    if (invalid) {
      setErrors([invalid]);
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    const worker = new LocalPdfWorker();
    const abort = () => worker.destroy();
    controller.signal.addEventListener('abort', abort, { once: true });
    setBusy('export');
    setErrors([]);
    invalidate();
    let verified: Awaited<ReturnType<typeof verifyPdfOutput>> | undefined;
    try {
      setNotice('Preparing your combined PDF…');
      const result = await worker.request(
        'merge',
        emptyPdfEdits(),
        [],
        undefined,
        {
          sources: pool.current
            .filter((source) => plan.documents.includes(source.id))
            .map((source) => ({
              id: source.id,
              name: source.name,
              bytes: source.document.original,
            })),
          plan,
        },
      );
      const pages = plan.pages.map(
        (page) =>
          pool.current.find((source) => source.id === page.document)!.info
            .pages[page.page],
      );
      verified = await verifyPdfOutput(
        result.bytes,
        pages,
        controller.signal,
        (message) => {
          if (alive.current && !controller.signal.aborted) setNotice(message);
        },
      );
      if (!alive.current || controller.signal.aborted) {
        verified.release();
        return;
      }
      const name = mergeFilename(
        pool.current.find((source) => source.id === plan.documents[0])!.name,
      );
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }),
      );
      const release = verified.release;
      const ready: Prepared = {
        document: {
          id: ++sequence.current,
          name,
          size: result.bytes.length,
          info: { pages, fields: [] },
          original: result.bytes,
          pdf: verified.pdf,
        },
        url,
        requested: false,
        release: () => {
          URL.revokeObjectURL(url);
          release();
        },
      };
      copy.current = ready;
      setPrepared(ready);
      setNotice(
        'Combined PDF checked. Preview its pages, then download a copy. Your editing session is unchanged.',
      );
    } catch {
      verified?.release();
      if (alive.current && !controller.signal.aborted) {
        setErrors([
          'The combined PDF could not be prepared or verified. Your merge plan and edits are kept. Retry, or choose smaller, simpler files.',
        ]);
        setNotice('No download was started. Retry when ready.');
      }
    } finally {
      worker.destroy();
      controller.signal.removeEventListener('abort', abort);
      if (operation.current === controller) operation.current = null;
      if (alive.current) setBusy('');
    }
  };
  const download = () => {
    const ready = copy.current;
    if (!ready) return;
    setErrors([]);
    try {
      const anchor = document.createElement('a');
      anchor.href = ready.url;
      anchor.download = ready.document.name;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
      const requested = { ...ready, requested: true };
      copy.current = requested;
      setPrepared(requested);
      setNotice(
        'Download started. Check your browser’s downloads; device saving cannot be confirmed here. You can download this copy again.',
      );
    } catch {
      setErrors([
        'Your browser could not start the download. Retry or check its download settings. Your combined copy and plan are kept.',
      ]);
    }
  };
  const cancel = () => {
    operation.current?.abort();
    setNotice(
      'Preparation cancelled. Accepted files and your editing session are kept.',
    );
  };
  return {
    sources,
    plan: history.present,
    undo: !!history.past.length,
    redo: !!history.future.length,
    busy,
    errors,
    notice,
    prepared,
    add,
    commit,
    step,
    prepare,
    download,
    cancel,
  };
}
