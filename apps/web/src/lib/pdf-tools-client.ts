import {
  PDF_TOOLS_LIMITS,
  type PdfEdits,
  type PdfInfo,
} from './pdf-tools-model';
import type { PdfOverlayImage } from './pdf-tools-engine';
import type { PdfMergeInput } from './pdf-tools-merge';
export type PdfWorkerResult = { info: PdfInfo; bytes: Uint8Array };
export class LocalPdfWorker {
  private worker = new Worker(
    new URL('./pdf-tools.worker.ts', import.meta.url),
    { type: 'module' },
  );
  private sequence = 0;
  private stopped = false;
  private pending = new Map<
    number,
    {
      resolve: (value: PdfWorkerResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = (
      event: MessageEvent<PdfWorkerResult & { id: number; error?: string }>,
    ) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(event.data.id);
      if (event.data.error) request.reject(new Error(event.data.error));
      else request.resolve(event.data);
    };
    this.worker.onerror = () =>
      this.destroy(
        'The local PDF worker stopped. Close this file and choose it again.',
      );
  }
  request(
    action:
      | 'open'
      | 'inspect'
      | 'export'
      | 'stamp'
      | 'preview'
      | 'complete'
      | 'extract'
      | 'merge',
    edits: PdfEdits,
    images: PdfOverlayImage[] = [],
    bytes?: Uint8Array,
    merge?: PdfMergeInput,
  ): Promise<PdfWorkerResult> {
    if (this.stopped)
      return Promise.reject(
        new Error(
          'The local PDF worker stopped. Close this file and choose it again.',
        ),
      );
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.destroy(
            'This PDF took too long to process. Choose a simpler PDF.',
          ),
        PDF_TOOLS_LIMITS.timeout,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, action, edits, images, bytes, merge });
    });
  }
  destroy(message = 'The local file was closed.') {
    this.stopped = true;
    this.worker.terminate();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    }
    this.pending.clear();
  }
}
