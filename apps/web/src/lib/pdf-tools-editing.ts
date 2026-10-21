import {
  fitElement,
  type PdfElement,
  type PdfPageInfo,
} from './pdf-tools-model';
import {
  overlapsPdfFormField,
  type PdfInfo,
  type Point,
} from './pdf-tools-model';
import { moveSignature, resizeSignature } from './pdf-tools-signature';
import { nativeMark } from './pdf-tools-organization';

export const markName = (mark: PdfElement) =>
  ({
    text: 'Text',
    date: 'Date',
    check: mark.checkStyle === 'cross' ? 'Cross' : 'Checkmark',
    signature: 'Signature',
    initials: 'Initials',
  })[mark.kind];
export const textFont = (mark: PdfElement) =>
  `${mark.fontWeight ?? 400} ${mark.fontSize ?? 16}px Arial, sans-serif`;
export function addedTextError(text: string) {
  if (text.length > 500)
    return 'Use at most 500 characters in each text box. Your text has been kept.';
  if (
    !/^[\u0020-\u007e\u00a0-\u00ff\u2013-\u2014\u2018-\u2019\u201c-\u201d\u2022\u2026\u20ac\u20b1\n]*$/u.test(
      text.normalize('NFC'),
    )
  )
    return 'Added text supports Latin and Latin-1 letters, numbers, common punctuation, € and ₱. This character is unsupported; your text has been kept.';
  return '';
}
export function layoutPdfText(
  mark: PdfElement,
  measure: (text: string) => number,
) {
  mark = nativeMark(mark);
  const size = mark.fontSize ?? 16,
    lineHeight = size * 1.35,
    padding = 4;
  let error = addedTextError(mark.text);
  if (!Number.isFinite(size) || size < 10 || size > 48)
    error = 'Choose a text size between 10 and 48 points.';
  const available = mark.width - padding * 2;
  const lines: string[] = [];
  for (const paragraph of mark.text.normalize('NFC').split('\n')) {
    let line = '';
    for (const token of paragraph.match(/\S+| +/gu) ?? []) {
      if (measure(line + token) <= available) {
        line += token;
        continue;
      }
      if (line && token.trim()) {
        lines.push(line);
        line = '';
      }
      for (const character of token) {
        if (measure(line + character) > available) {
          if (!line)
            error =
              'This text needs a wider box. Enlarge it or choose a smaller text size.';
          else lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  const neededHeight = padding * 2 + Math.max(1, lines.length) * lineHeight;
  if (!error && neededHeight > mark.height + 0.01)
    error =
      'This text needs more room. Widen the box, move it upward, or choose a smaller text size. Your text has been kept.';
  return { lines, size, lineHeight, padding, neededHeight, error };
}
export function measuredPdfText(mark: PdfElement) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context)
    throw new Error('Your browser cannot draw text. Try another browser.');
  context.font = textFont(mark);
  return layoutPdfText(mark, (text) => context.measureText(text).width);
}
export function fitTextContent(
  mark: PdfElement,
  page: PdfPageInfo,
): PdfElement {
  const layout = measuredPdfText(mark);
  const rotation = mark.contentRotation ?? 0;
  if (rotation % 180)
    return {
      ...mark,
      width: Math.min(
        rotation === 90 ? mark.x + mark.width : page.viewWidth - mark.x,
        Math.max(32, mark.width, layout.neededHeight),
      ),
      ...(rotation === 90
        ? {
            x: Math.max(
              0,
              mark.x +
                mark.width -
                Math.max(32, mark.width, layout.neededHeight),
            ),
          }
        : {}),
    };
  if (rotation === 180) {
    const height = Math.min(
      mark.y + mark.height,
      Math.max(32, mark.height, layout.neededHeight),
    );
    return { ...mark, height, y: mark.y + mark.height - height };
  }
  return {
    ...mark,
    height: Math.min(
      page.viewHeight - mark.y,
      Math.max(32, mark.height, layout.neededHeight),
    ),
  };
}
export function resizePdfMark(
  mark: PdfElement,
  width: number,
  page: PdfPageInfo,
  height?: number,
): PdfElement {
  if (mark.kind === 'signature' || mark.kind === 'initials')
    return resizeSignature(mark, width, page);
  if (
    !Number.isFinite(width) ||
    width < 24 ||
    (height !== undefined && (!Number.isFinite(height) || height < 18))
  )
    throw new Error(
      'Keep the mark at least 24 points wide and 18 points high.',
    );
  const result = fitElement(
    { ...mark, width, height: height ?? mark.height },
    page,
  );
  return mark.kind === 'text' || mark.kind === 'date'
    ? fitTextContent(result, page)
    : result;
}
export const movePdfMark = moveSignature;
export function dateText(value: string, format: 'long' | 'iso') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T12:00:00Z');
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return '';
  if (format === 'iso') return value;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
export function newPdfMark(
  kind: 'text' | 'date' | 'check',
  page: PdfPageInfo,
  date?: { value: string; format: 'long' | 'iso' },
): PdfElement {
  return fitElement(
    {
      id: '',
      page: 0,
      kind,
      x: 0,
      y: 0,
      width: kind === 'text' ? 240 : kind === 'date' ? 160 : 28,
      height: kind === 'check' ? 28 : 40,
      text: date ? dateText(date.value, date.format) : '',
      fontSize: kind === 'check' ? undefined : 16,
      fontWeight: 400,
      ink: '#172c45',
      ...(date ? { dateValue: date.value, dateFormat: date.format } : {}),
    },
    page,
  );
}

// Keyboard placement searches bounded page positions nearest the page center.
// Explicit pointer placement still reports collisions rather than relocating.
export function defaultMarkPoint(
  mark: PdfElement,
  index: number,
  info: PdfInfo,
  existing: PdfElement[] = [],
): Point | null {
  const page = info.pages[index];
  if (mark.width > page.viewWidth || mark.height > page.viewHeight) return null;
  const maxX = page.viewWidth - mark.width,
    maxY = page.viewHeight - mark.height;
  const preferred = { x: maxX / 2, y: maxY / 2 };
  const candidates = [preferred];
  for (let y = 0; y <= maxY + 24; y += 24)
    for (let x = 0; x <= maxX + 24; x += 24)
      candidates.push({ x: Math.min(x, maxX), y: Math.min(y, maxY) });
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - preferred.x, a.y - preferred.y) -
      Math.hypot(b.x - preferred.x, b.y - preferred.y),
  );
  const point = candidates.find(
    (point) =>
      !overlapsPdfFormField({ ...mark, ...point, page: index }, info) &&
      !existing.some(
        (other) =>
          other.page === index &&
          point.x < other.x + other.width &&
          point.x + mark.width > other.x &&
          point.y < other.y + other.height &&
          point.y + mark.height > other.y,
      ),
  );
  return point
    ? {
        x: point.x + (mark.kind === 'text' ? 0 : mark.width / 2),
        y: point.y + (mark.kind === 'text' ? 0 : mark.height / 2),
      }
    : null;
}
