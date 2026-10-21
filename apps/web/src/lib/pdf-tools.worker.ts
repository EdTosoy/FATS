import {
  inspectLocalPdf,
  exportLocalPdf,
  PdfToolsError,
  mergeLocalPdfs,
} from './pdf-tools-engine';
import type { PdfMergeInput } from './pdf-tools-merge';
import type { PdfEdits, PdfInfo } from './pdf-tools-model';
import type { PdfOverlayImage } from './pdf-tools-engine';
// Parser diagnostics can include user content. Return fixed, actionable errors.
console.log = console.warn = console.error = () => {};
let original: Uint8Array | undefined, info: PdfInfo | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    action: string;
    bytes?: Uint8Array;
    edits: PdfEdits;
    images: PdfOverlayImage[];
    merge?: PdfMergeInput;
  }>,
) => {
  const { id, action, bytes, edits, images } = event.data;
  try {
    if (action === 'merge') {
      if (!event.data.merge)
        throw new PdfToolsError('Add PDFs to begin merging.');
      const result = await mergeLocalPdfs(event.data.merge);
      self.postMessage({ id, ...result }, { transfer: [result.bytes.buffer] });
      return;
    }
    if ((action === 'open' || action === 'inspect') && bytes) {
      original = bytes.slice();
      info = await inspectLocalPdf(original);
    }
    if (!original || !info) throw new PdfToolsError('Choose a PDF to begin.');
    // The read-only V2 foundation renders the validated original, without
    // flattening fields, changing metadata, or invoking the export pipeline.
    const output =
      action === 'inspect'
        ? original.slice()
        : await exportLocalPdf(original, info, edits, images, {
            preserveFields: [
              'stamp',
              'preview',
              'complete',
              'extract',
            ].includes(action),
            editFields: action === 'preview' || action === 'complete',
            requireFields: action === 'complete' || action === 'stamp',
            independent: action === 'extract',
          });
    self.postMessage(
      { id, info, bytes: output },
      { transfer: [output.buffer] },
    );
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof PdfToolsError
          ? error.message
          : 'This PDF could not be processed. Choose a simpler, complete PDF and try again.',
    });
  }
};
