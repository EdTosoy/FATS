import type { PdfElement, PdfPageInfo } from './pdf-tools-model';

export const MIN_SIGNATURE_FONT_SIZE = 18;
export const signatureFont = (size: number, style: 'classic' | 'simple') =>
  `${style === 'classic' ? 'italic' : 'normal'} ${size}px "Times New Roman", serif`;

export function signatureNameError(text: string): string {
  const normalized = text.normalize('NFC');
  if (!normalized.trim()) return 'Enter your name to preview a signature.';
  if (Array.from(normalized).length > 100)
    return 'Use at most 100 characters, or choose Draw. Your full name has been kept.';
  // Deliberately bounded Latin repertoire. No tofu, emoji, control characters,
  // combining-only glyphs or silent font substitution for other scripts.
  if (!/^[\u0020-\u007e\u00c0-\u00ff]+$/u.test(normalized))
    return 'Typed styles support basic Latin and Latin-1 accented names. Use Draw for other characters; no characters will be dropped.';
  return '';
}

export function typedSignature(
  text: string,
  style: 'classic' | 'simple',
  page: PdfPageInfo,
  minimumWidth = 190,
): PdfElement {
  const name = text.normalize('NFC').trim();
  const error = signatureNameError(name);
  if (error) throw new Error(error);
  const context = document.createElement('canvas').getContext('2d');
  if (!context)
    throw new Error(
      'Your browser cannot draw signatures. Try another browser.',
    );
  context.font = signatureFont(32, style);
  const metrics = context.measureText(name);
  const inkWidth = Math.max(
    metrics.width,
    metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
  );
  const inkHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const width = Math.min(
    560,
    page.viewWidth - 12,
    Math.max(minimumWidth, Math.ceil(inkWidth + 16)),
  );
  const height = Math.min(60, page.viewHeight - 12);
  const size =
    Math.floor(
      Math.min(
        32,
        ((width - 12) / inkWidth) * 32,
        ((height - 12) / Math.max(1, inkHeight)) * 32,
      ) * 10,
    ) / 10;
  if (size < MIN_SIGNATURE_FONT_SIZE)
    throw new Error(
      'This name needs more room to stay readable. Try Simple style, a shorter name, Draw, or a larger page. Your name has been kept.',
    );
  return {
    id: '',
    page: 0,
    kind: 'signature',
    x: 0,
    y: 0,
    width,
    height,
    text: name,
    signatureStyle: style,
    signatureFontSize: size,
  };
}

// Preserve one aspect ratio and readable type at page bounds. Never use the
// legacy independent width/height clamp for a proportional signature resize.
export function resizeSignature(
  mark: PdfElement,
  width: number,
  page: PdfPageInfo,
): PdfElement {
  const maxFactor = Math.min(
    (page.viewWidth - mark.x) / mark.width,
    (page.viewHeight - mark.y) / mark.height,
  );
  const factor = Math.min(width / mark.width, maxFactor);
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    mark.width * factor < 24 ||
    mark.height * factor < 18 ||
    (mark.signatureFontSize &&
      mark.signatureFontSize * factor < MIN_SIGNATURE_FONT_SIZE)
  )
    throw new Error(
      'Keep the signature large enough to read. Move it inward to make more room.',
    );
  return {
    ...mark,
    width: mark.width * factor,
    height: mark.height * factor,
    ...(mark.signatureFontSize
      ? { signatureFontSize: mark.signatureFontSize * factor }
      : {}),
  };
}
export function moveSignature(
  mark: PdfElement,
  x: number,
  y: number,
  page: PdfPageInfo,
): PdfElement {
  return {
    ...mark,
    x: Math.max(0, Math.min(page.viewWidth - mark.width, x)),
    y: Math.max(0, Math.min(page.viewHeight - mark.height, y)),
  };
}
