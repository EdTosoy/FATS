import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { PDF_TOOLS_LIMITS, type PdfPageInfo } from './pdf-tools-model';
import { checkedPdfPage, createPdfLoadingTask } from './pdf-tools-renderer';
import { pdfRasterScale } from './pdf-tools-viewport';

export async function pdfDeadline<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        cancel = () => reject(new Error('PDF preparation cancelled.'));
        if (signal.aborted) return cancel();
        signal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'The PDF took too long to prepare. Retry or choose a simpler file.',
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
}
// The same bounded PDF.js reopening/geometry/all-pages render check used by
// completed downloads. Merge retains this verified renderer for its final preview.
export async function verifyPdfOutput(
  bytes: Uint8Array,
  pages: PdfPageInfo[],
  signal: AbortSignal,
  status: (message: string) => void,
) {
  let task: PDFDocumentLoadingTask | undefined;
  let render: RenderTask | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let released = false;
  const release = () => {
    released = true;
    render?.cancel();
    void task?.destroy().catch(() => {});
    if (canvas) canvas.width = canvas.height = 0;
  };
  signal.addEventListener('abort', release, { once: true });
  try {
    task = await pdfDeadline(
      createPdfLoadingTask(bytes).then((value) => {
        if (released || signal.aborted) void value.destroy().catch(() => {});
        return value;
      }),
      signal,
    );
    if (!task) throw new Error('The completed PDF could not be opened.');
    const pdf = await pdfDeadline(task.promise, signal);
    if (pdf.numPages !== pages.length)
      throw new Error(
        'The completed PDF has a different page count. No download was started.',
      );
    for (let index = 0; index < pages.length; index++) {
      status(`Checking completed page ${index + 1} of ${pages.length}…`);
      const proxy = await pdfDeadline(
        checkedPdfPage(pdf, index, pages[index]),
        signal,
      );
      const geometry = pages[index];
      const viewport = proxy.getViewport({
        scale: pdfRasterScale(geometry.viewWidth, geometry.viewHeight, 1, 1),
      });
      canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(
          'Your browser could not verify the completed PDF. Retry the download.',
        );
      render = proxy.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: 1,
      });
      await pdfDeadline(render.promise, signal);
      canvas.width = canvas.height = 0;
      proxy.cleanup();
    }
    if (signal.aborted) throw new Error('PDF preparation cancelled.');
    return { pdf, release };
  } catch (error) {
    release();
    // Never surface raw renderer diagnostics or document text.
    if (
      error instanceof Error &&
      /^(The PDF took too long|The completed PDF has|Your browser could not|PDF preparation cancelled)/.test(
        error.message,
      )
    )
      throw error;
    throw new Error(
      'The completed PDF could not be verified. No download was started. Retry or use a simpler file.',
    );
  } finally {
    signal.removeEventListener('abort', release);
  }
}
