// Shared browser renderer boundary for the existing editor and V2 candidate.
// No HTML annotation/link, scripting, XFA, remote font or persistence layer.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  PDF_TOOLS_LIMITS,
  viewToPdf,
  type PdfPageInfo,
} from './pdf-tools-model';

export async function createPdfLoadingTask(bytes: Uint8Array) {
  const renderer = await import('pdfjs-dist');
  renderer.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  return renderer.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: true,
    useWasm: false,
    useWorkerFetch: false,
    maxImageSize: PDF_TOOLS_LIMITS.pixels,
    canvasMaxAreaInBytes: 16_000_000,
    stopAtErrors: true,
    verbosity: 0,
  });
}

export async function checkedPdfPage(
  pdf: PDFDocumentProxy,
  index: number,
  geometry: PdfPageInfo,
  rotation?: number,
) {
  const proxy = await pdf.getPage(index + 1);
  const viewport = proxy.getViewport({
    scale: 1,
    ...(rotation === undefined ? {} : { rotation }),
  });
  if (
    Math.abs(viewport.width - geometry.viewWidth) > 0.1 ||
    Math.abs(viewport.height - geometry.viewHeight) > 0.1
  )
    throw new Error('PDF page geometry does not match.');
  // Check the actual PDF.js inverse against the engine/export coordinate
  // contract, including effective crop origin and every orthogonal rotation.
  for (const x of [0, viewport.width]) {
    for (const y of [0, viewport.height]) {
      const expected = viewToPdf(geometry, { x, y });
      const actual = viewport.convertToPdfPoint(x, y);
      if (
        Math.abs(expected.x - actual[0]) > 0.01 ||
        Math.abs(expected.y - actual[1]) > 0.01
      )
        throw new Error('PDF page geometry does not match.');
    }
  }
  return proxy;
}
