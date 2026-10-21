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
  required?: boolean;
  control?: 'text' | 'checkbox' | 'radio' | 'dropdown';
  pages: number[];
};
export type PdfInfo = {
  pages: PdfPageInfo[];
  fields: PdfFieldInfo[];
  organization?: { blocked?: string; removalBlocked?: string };
  // PDF-space widget rectangles, used when signatures preserve live fields.
  formWidgets?: {
    field?: string;
    option?: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
};
export type PdfElement = {
  id: string;
  page: number;
  kind: 'text' | 'date' | 'check' | 'signature' | 'initials';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  strokes?: Point[][];
  // Optional V2 typography; legacy editor marks retain their existing painter.
  signatureStyle?: 'classic' | 'simple';
  signatureFontSize?: number;
  fontSize?: number;
  fontWeight?: 400 | 700;
  ink?: '#172c45' | '#111111' | '#244e80';
  dateValue?: string;
  dateFormat?: 'long' | 'iso';
  checkStyle?: 'check' | 'cross';
  // Clockwise artwork orientation inside the visible bounding box (V2 only).
  contentRotation?: number;
};
// source is the immutable, zero-based identity in the original local PDF.
export type PdfPageEdit = { source: number; rotation: number };
export type PdfEdits = {
  elements: PdfElement[];
  fields: Record<string, string | boolean>;
  pages?: PdfPageEdit[];
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
export const PDF_FORM_OVERLAP_ERROR =
  'Added content cannot cover an existing form field. Fill the field itself, or choose a blank area of the page.';
export function overlapsPdfFormField(
  element: PdfElement,
  info: PdfInfo,
): boolean {
  const page = info.pages[element.page];
  if (!page) return false;
  const a = viewToPdf(page, element);
  const b = viewToPdf(page, {
    x: element.x + element.width,
    y: element.y + element.height,
  });
  return (
    info.formWidgets?.some((widget) => {
      if (widget.page !== element.page || !widget.width || !widget.height)
        return false;
      return (
        Math.min(a.x, b.x) < Math.max(widget.x, widget.x + widget.width) &&
        Math.max(a.x, b.x) > Math.min(widget.x, widget.x + widget.width) &&
        Math.min(a.y, b.y) < Math.max(widget.y, widget.y + widget.height) &&
        Math.max(a.y, b.y) > Math.min(widget.y, widget.y + widget.height)
      );
    }) ?? false
  );
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

export function pdfFieldError(
  spec: PdfFieldInfo,
  value: string | boolean,
  required = false,
): string {
  if (
    required &&
    spec.required &&
    (value === false || (typeof value === 'string' && !value.trim()))
  )
    return 'Complete all required form fields before downloading.';
  if (spec.kind === 'checkbox')
    return typeof value === 'boolean' ? '' : 'Choose a valid checkbox value.';
  if (typeof value !== 'string') return 'Choose a valid form value.';
  if (spec.kind === 'choice')
    return !value || spec.options?.includes(value)
      ? ''
      : 'Choose an available form option.';
  if (value.length > (spec.maxLength ?? 500))
    return 'This form value is too long. Shorten it to the stated field limit.';
  if (
    !/^[\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]*$/u.test(
      value,
    )
  )
    return 'Standard PDF fields support Western European text. Use supported added text for other characters; your input has been kept.';
  return '';
}
export function pdfFieldsError(
  info: PdfInfo,
  values: PdfEdits['fields'],
  required = false,
): string {
  if (
    Object.keys(values).some(
      (name) => !info.fields.some((field) => field.name === name),
    )
  )
    return 'This PDF has an unknown form field. Choose the original PDF again.';
  for (const field of info.fields) {
    const changed = Object.hasOwn(values, field.name);
    if (changed && field.readOnly && values[field.name] !== field.value)
      return 'This form field is read-only.';
    const value = changed ? values[field.name] : field.value;
    if (
      required &&
      field.required &&
      (value === false || (typeof value === 'string' && !value.trim()))
    )
      return 'Complete all required form fields before downloading.';
    const error = changed ? pdfFieldError(field, value) : '';
    if (error) return error;
  }
  return '';
}
