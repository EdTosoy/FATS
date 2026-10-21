import type { LocalPdfDocument } from './use-pdf-tools-document';
import { LocalPdfWorker } from './pdf-tools-client';
import { verifyPdfOutput } from './pdf-tools-output-verifier';
import {
  emptyPdfEdits,
  PDF_TOOLS_LIMITS,
  type PdfEdits,
} from './pdf-tools-model';
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
  independent = false,
) {
  const worker = new LocalPdfWorker();
  const abortError = () =>
    new Error('Download preparation was cancelled. Your edits are unchanged.');
  const abort = () => {
    worker.destroy();
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
        independent
          ? 'extract'
          : Object.keys(edits.fields).length
            ? 'complete'
            : 'stamp',
        edits,
        images,
      ),
    );
    const expectedInfo = organizedInfo(document.info, edits);
    const expectedPages = pagePlan(document.info, edits).map(
      ({ source }) => expectedInfo.pages[source],
    );
    const verified = await verifyPdfOutput(
      result.bytes,
      expectedPages,
      signal,
      status,
    );
    verified.release();
    return result.bytes;
  } catch (error) {
    // PDF.js diagnostics can contain document text. Only our fixed user-facing
    // messages or known processing-worker messages reach the workspace.
    if (
      error instanceof Error &&
      /^(Extract and Split|Download preparation|The completed PDF|Your browser|This PDF|Choose |Password|Quick Sign|An added|Added marks|Added content|Use at most|Complete all required|Standard PDF fields|A form value)/.test(
        error.message,
      )
    )
      throw error;
    throw new Error(
      'The completed PDF could not be verified. No download was started. Your edits are unchanged; retry the download.',
    );
  } finally {
    signal.removeEventListener('abort', abort);
    abort();
  }
}
