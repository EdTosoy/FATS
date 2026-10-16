// Browser-only PDF Tools data. Never part of account persistence or backups.
export const PDF_TOOLS_LIMITS = {
  bytes: 10 * 1024 * 1024,
  pages: 50,
  fields: 150,
  elements: 100,
  history: 50,
  pageSide: 2400,
  pixels: 4_000_000,
  outputBytes: 30 * 1024 * 1024,
  timeout: 15000,
} as const;
export type Point = { x: number; y: number };
export type PdfPageInfo = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  viewWidth: number;
  viewHeight: number;
};
export type PdfFieldInfo = {
  name: string;
  kind: 'text' | 'checkbox' | 'choice';
  value: string | boolean;
  options?: string[];
  maxLength?: number;
  readOnly: boolean;
  pages: number[];
};
export type PdfInfo = { pages: PdfPageInfo[]; fields: PdfFieldInfo[] };
export type PdfElement = {
  id: string;
  page: number;
  kind: 'text' | 'date' | 'check' | 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  strokes?: Point[][];
};
export type PdfEdits = {
  elements: PdfElement[];
  fields: Record<string, string | boolean>;
};
export const emptyPdfEdits = (): PdfEdits => ({ elements: [], fields: {} });
export type PdfHistory = {
  past: PdfEdits[];
  present: PdfEdits;
  future: PdfEdits[];
};
export function editHistory(history: PdfHistory, next: PdfEdits): PdfHistory {
  return {
    past: [...history.past, history.present].slice(-PDF_TOOLS_LIMITS.history),
    present: next,
    future: [],
  };
}
export function stepHistory(
  history: PdfHistory,
  direction: 'undo' | 'redo',
): PdfHistory {
  if (direction === 'undo') {
    const previous = history.past.at(-1);
    return previous
      ? {
          past: history.past.slice(0, -1),
          present: previous,
          future: [history.present, ...history.future],
        }
      : history;
  }
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
      }
    : history;
}
// Display coordinates use the visible crop, top-left origin, scale 1. Export
// applies this inverse of PDF.js's viewport, independent of CSS size or zoom.
export function viewToPdf(page: PdfPageInfo, point: Point): Point {
  switch (page.rotation) {
    case 90:
      return { x: page.x + point.y, y: page.y + point.x };
    case 180:
      return { x: page.x + page.width - point.x, y: page.y + point.y };
    case 270:
      return {
        x: page.x + page.width - point.y,
        y: page.y + page.height - point.x,
      };
    default:
      return { x: page.x + point.x, y: page.y + page.height - point.y };
  }
}
export function fitElement(element: PdfElement, page: PdfPageInfo): PdfElement {
  const width = Math.max(12, Math.min(element.width, page.viewWidth));
  const height = Math.max(12, Math.min(element.height, page.viewHeight));
  return {
    ...element,
    width,
    height,
    x: Math.max(0, Math.min(element.x, page.viewWidth - width)),
    y: Math.max(0, Math.min(element.y, page.viewHeight - height)),
  };
}
export function validateLocalPdfFile(file: { name: string; size: number }) {
  if (!/\.pdf$/i.test(file.name))
    throw new Error(
      'Choose a PDF file (.pdf). Word documents and images are not supported.',
    );
  if (!file.size || file.size > PDF_TOOLS_LIMITS.bytes)
    throw new Error('Choose a nonempty PDF no larger than 10 MiB.');
}
