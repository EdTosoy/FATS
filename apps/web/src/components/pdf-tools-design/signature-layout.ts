// Prototype typography only. These metrics say nothing about PDF glyph export.
export const MIN_SIGNATURE_SIZE = 18;
export const SIGNATURE_FONT = 'Georgia, serif';

export function signatureFit(
  measuredWidth: number,
  width: number,
  height: number,
) {
  const available = Math.min(
    32,
    ((width - 12) / Math.max(1, measuredWidth)) * 32,
    (height - 8) / 1.25,
  );
  return {
    size: Math.max(MIN_SIGNATURE_SIZE, Math.floor(available * 10) / 10),
    fits: available >= MIN_SIGNATURE_SIZE,
  };
}

export function signatureBox(measuredWidth: number, initials = false) {
  const width = Math.min(
    560,
    Math.max(initials ? 80 : 190, Math.ceil(measuredWidth + 12)),
  );
  const height = 58;
  return { width, height, ...signatureFit(measuredWidth, width, height) };
}

export function measureSignature(text: string, style = 'classic') {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return null;
  context.font = `${style === 'simple' ? 'normal' : 'italic'} 32px ${SIGNATURE_FONT}`;
  const metrics = context.measureText(text);
  return Math.max(
    metrics.width,
    metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
  );
}
