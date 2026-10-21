import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import type { LocalPdfDocument } from './use-pdf-tools-document';
import { LocalPdfWorker } from './pdf-tools-client';
import { createPdfLoadingTask, checkedPdfPage } from './pdf-tools-renderer';
import {
  emptyPdfEdits,
  PDF_TOOLS_LIMITS,
  type PdfEdits,
} from './pdf-tools-model';
import { pdfRasterScale } from './pdf-tools-viewport';
import type { PdfOverlayImage } from './pdf-tools-engine';
import { organizedInfo, pagePlan } from './pdf-tools-organization';

// Uses the same processing worker/engine. A fresh worker per attempt means a
// timeout/failure can be retried without losing the original or editing history.
export async function exportQuickSign(
  document: LocalPdfDocument,
  edits: PdfEdits,
  images: PdfOverlayImage[],
  signal: AbortSignal,
  status: (message: string) => void,
) {
  const worker = new LocalPdfWorker();
  let loading: PDFDocumentLoadingTask | undefined;
  let render: RenderTask | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let released = false;
  const abortError = () =>
    new Error('Download preparation was cancelled. Your edits are unchanged.');
  const abort = () => {
    worker.destroy();
    render?.cancel();
    void loading?.destroy().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  const bounded = async <T>(operation: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => {};
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          cancel = () => reject(abortError());
          if (signal.aborted) {
            cancel();
            return;
          }
          signal.addEventListener('abort', cancel, { once: true });
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  'The completed PDF took too long to verify. Your edits are unchanged; retry or use a simpler PDF.',
                ),
              ),
            PDF_TOOLS_LIMITS.timeout,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  };
  try {
    if (signal.aborted) throw abortError();
    status('Preparing your completed PDF…');
    await bounded(
      worker.request('inspect', emptyPdfEdits(), [], document.original),
    );
    const result = await bounded(
      worker.request(
        Object.keys(edits.fields).length ? 'complete' : 'stamp',
        edits,
        images,
      ),
    );
    const outputTask = await bounded(
      createPdfLoadingTask(result.bytes).then((task) => {
        if (released || signal.aborted) void task.destroy().catch(() => {});
        else loading = task;
        return task;
      }),
    );
    loading = outputTask;
    const pdf = await bounded(outputTask.promise);
    const expectedInfo = organizedInfo(document.info, edits);
    const expectedPages = pagePlan(document.info, edits).map(
      ({ source }) => expectedInfo.pages[source],
    );
    if (pdf.numPages !== expectedPages.length)
      throw new Error(
        'The completed PDF has a different page count. No download was started.',
      );
    for (let index = 0; index < pdf.numPages; index++) {
      status(`Checking completed page ${index + 1} of ${pdf.numPages}…`);
      const proxy = await bounded(
        checkedPdfPage(pdf, index, expectedPages[index]),
      );
      const geometry = expectedPages[index];
      const viewport = proxy.getViewport({
        scale: pdfRasterScale(geometry.viewWidth, geometry.viewHeight, 1, 1),
      });
      canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(
          'Your browser could not verify the completed PDF. Your edits are unchanged. Retry the download.',
        );
      render = proxy.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: 1,
      });
      await bounded(render.promise);
      canvas.width = canvas.height = 0;
      proxy.cleanup();
    }
    if (signal.aborted) throw abortError();
    return result.bytes;
  } catch (error) {
    // PDF.js diagnostics can contain document text. Only our fixed user-facing
    // messages or known processing-worker messages reach the workspace.
    if (
      error instanceof Error &&
      /^(Download preparation|The completed PDF|Your browser|This PDF|Choose |Password|Quick Sign|An added|Added marks|Added content|Use at most|Complete all required|Standard PDF fields|A form value)/.test(
        error.message,
      )
    )
      throw error;
    throw new Error(
      'The completed PDF could not be verified. No download was started. Your edits are unchanged; retry the download.',
    );
  } finally {
    released = true;
    signal.removeEventListener('abort', abort);
    abort();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
