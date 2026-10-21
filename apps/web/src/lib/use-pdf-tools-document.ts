'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { LocalPdfWorker } from './pdf-tools-client';
import { createPdfLoadingTask } from './pdf-tools-renderer';
import {
  emptyPdfEdits,
  PDF_TOOLS_LIMITS,
  validateLocalPdfFile,
  type PdfInfo,
} from './pdf-tools-model';

export type LocalPdfDocument = {
  id: number;
  name: string;
  size: number;
  info: PdfInfo;
  pdf: PDFDocumentProxy;
  original: Uint8Array;
};
type State = {
  document: LocalPdfDocument | null;
  loading: string;
  error: string;
};
// Only loading lifetime belongs here. Future editing must reuse PdfEdits and
// PdfHistory; view selection/zoom never become a competing document edit model.
export function usePdfToolsDocument() {
  const generation = useRef(0);
  const resources = useRef<{
    worker?: LocalPdfWorker;
    task?: PDFDocumentLoadingTask;
    timer?: ReturnType<typeof setTimeout>;
  }>({});
  const [state, setState] = useState<State>({
    document: null,
    loading: '',
    error: '',
  });
  const release = useCallback(() => {
    generation.current++;
    const current = resources.current;
    resources.current = {};
    clearTimeout(current.timer);
    current.worker?.destroy();
    void current.task?.destroy().catch(() => {});
  }, []);
  useEffect(() => release, [release]);
  const close = useCallback(() => {
    release();
    setState({ document: null, loading: '', error: '' });
  }, [release]);
  const open = async (file: File) => {
    try {
      validateLocalPdfFile(file);
    } catch (error) {
      setState((current) => ({ ...current, error: (error as Error).message }));
      return;
    }
    release();
    const id = generation.current;
    setState({ document: null, loading: 'Checking PDF…', error: '' });
    const current = resources.current;
    try {
      current.worker = new LocalPdfWorker();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (generation.current !== id) return;
      const result = await current.worker.request(
        'inspect',
        emptyPdfEdits(),
        [],
        bytes,
      );
      if (generation.current !== id) return;
      // Read-only foundation has no reason to retain a second original copy
      // in the processing worker after successful inspection.
      current.worker.destroy();
      current.worker = undefined;
      setState({
        document: null,
        loading: 'Opening document canvas…',
        error: '',
      });
      current.timer = setTimeout(() => {
        if (generation.current !== id) return;
        release();
        setState({
          document: null,
          loading: '',
          error:
            'The document renderer took too long. Choose a simpler PDF and try again.',
        });
      }, PDF_TOOLS_LIMITS.timeout);
      const task = await createPdfLoadingTask(result.bytes);
      if (generation.current !== id) {
        void task.destroy().catch(() => {});
        return;
      }
      current.task = task;
      const pdf = await task.promise;
      if (generation.current !== id) return;
      if (pdf.numPages !== result.info.pages.length) throw new Error();
      clearTimeout(current.timer);
      setState({
        document: {
          id,
          name: file.name,
          size: file.size,
          info: result.info,
          pdf,
          original: result.bytes,
        },
        loading: '',
        error: '',
      });
    } catch (error) {
      if (generation.current !== id) return;
      const wasInspecting = !!current.worker;
      release();
      setState({
        document: null,
        loading: '',
        error:
          wasInspecting && error instanceof Error
            ? error.message
            : 'This PDF could not be rendered. Choose it again or use a simpler, complete PDF.',
      });
    }
  };
  return { ...state, open, close };
}
