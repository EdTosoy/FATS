import {
  inspectLocalPdf,
  exportLocalPdf,
  PdfToolsError,
} from './pdf-tools-engine';
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
  }>,
) => {
  const { id, action, bytes, edits, images } = event.data;
  try {
    if (action === 'open' && bytes) {
      original = bytes.slice();
      info = await inspectLocalPdf(original);
    }
    if (!original || !info) throw new PdfToolsError('Choose a PDF to begin.');
    const output = await exportLocalPdf(original, info, edits, images);
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
