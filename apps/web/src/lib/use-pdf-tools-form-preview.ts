'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import type { LocalPdfDocument } from './use-pdf-tools-document';
import { LocalPdfWorker } from './pdf-tools-client';
import { createPdfLoadingTask } from './pdf-tools-renderer';
import {
  emptyPdfEdits,
  pdfFieldsError,
  type PdfEdits,
} from './pdf-tools-model';

type Preview = {
  key: string;
  document: LocalPdfDocument;
  task?: PDFDocumentLoadingTask;
  error: string;
};
// Derive appearances from PdfEdits.fields; this hook owns no editable form state.
export function usePdfToolsFormPreview(
  document: LocalPdfDocument,
  fields: PdfEdits['fields'],
) {
  const fieldsKey = JSON.stringify(fields);
  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}:${fieldsKey}`;
  const [state, setState] = useState<Preview | null>(null);
  const generation = useRef(0);
  const current = useRef<PDFDocumentLoadingTask | undefined>(undefined);
  const validation = pdfFieldsError(document.info, fields);
  useEffect(() => {
    const id = ++generation.current;
    if (fieldsKey === '{}' || validation) return;
    let worker: LocalPdfWorker | undefined,
      task: PDFDocumentLoadingTask | undefined;
    let stopped = false;
    const timer = setTimeout(() => {
      void (async () => {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            (async () => {
              worker = new LocalPdfWorker();
              await worker.request(
                'inspect',
                emptyPdfEdits(),
                [],
                document.original,
              );
              const result = await worker.request('preview', {
                fields: JSON.parse(fieldsKey),
                elements: [],
              });
              worker.destroy();
              worker = undefined;
              if (stopped) return;
              task = await createPdfLoadingTask(result.bytes);
              if (stopped) {
                await task.destroy();
                return;
              }
              const pdf = await task.promise;
              if (stopped) return;
              if (pdf.numPages !== document.info.pages.length)
                throw new Error();
              return { pdf, task };
            })(),
            new Promise<never>((_, reject) => {
              deadline = setTimeout(() => reject(new Error()), 15000);
            }),
          ]);
          if (!result || stopped) return;
          current.current = result.task;
          setState({
            key,
            document: {
              ...document,
              pdf: result.pdf,
              id: document.id * 1000000 + id,
            },
            task: result.task,
            error: '',
          });
        } catch (error) {
          worker?.destroy();
          if (task && task !== current.current)
            void task.destroy().catch(() => {});
          if (!stopped)
            setState((previous) => ({
              key,
              document: previous?.document ?? document,
              task: previous?.task,
              error:
                error instanceof Error &&
                /^(A form value|These form values|Standard PDF fields)/.test(
                  error.message,
                )
                  ? error.message
                  : 'Form preview could not be updated. Your values are kept. Shorten a long value or retry the preview.',
            }));
          stopped = true;
        } finally {
          clearTimeout(deadline);
        }
      })();
    }, 180);
    return () => {
      stopped = true;
      clearTimeout(timer);
      worker?.destroy();
      if (task && task !== current.current) void task.destroy().catch(() => {});
    };
  }, [document, fieldsKey, key, validation]);
  useEffect(() => {
    const task = state?.task;
    return () => {
      if (task) void task.destroy().catch(() => {});
    };
  }, [state?.task]);
  return {
    document: fieldsKey === '{}' ? document : (state?.document ?? document),
    updating: !validation && fieldsKey !== '{}' && state?.key !== key,
    error: validation || (state?.key === key ? state.error : ''),
    retry: () => setAttempt((value) => value + 1),
  };
}
