import type { PageViewport } from 'pdfjs-dist';
import { PDF_TOOLS_LIMITS, type Point } from './pdf-tools-model';

type PageRect = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;
// Use the *actual PDF.js viewport*, never canvas backing pixels or an HTML
// approximation. getBoundingClientRect and PointerEvent.clientX/Y both use
// CSS viewport coordinates, so page/stage/window scroll is already accounted for.
export function clientToPdf(
  viewport: PageViewport,
  rect: PageRect,
  client: Point,
): Point {
  if (rect.width <= 0 || rect.height <= 0)
    throw new Error('The PDF page is not visible.');
  const [x, y] = viewport.convertToPdfPoint(
    ((client.x - rect.left) / rect.width) * viewport.width,
    ((client.y - rect.top) / rect.height) * viewport.height,
  );
  return { x, y };
}
export function pdfToClient(
  viewport: PageViewport,
  rect: PageRect,
  point: Point,
): Point {
  const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
  return {
    x: rect.left + (x / viewport.width) * rect.width,
    y: rect.top + (y / viewport.height) * rect.height,
  };
}
// Raster resolution is independent of physical PDF geometry. Ceil rounding is
// budgeted before allocation, including very wide/narrow accepted pages.
export function pdfRasterScale(
  width: number,
  height: number,
  cssScale: number,
  devicePixelRatio: number,
) {
  let scale = Math.min(
    cssScale * Math.max(1, Math.min(3, devicePixelRatio)),
    Math.sqrt(PDF_TOOLS_LIMITS.pixels / (width * height)),
  );
  while (
    Math.ceil(width * scale) * Math.ceil(height * scale) >
    PDF_TOOLS_LIMITS.pixels
  )
    scale *= 0.999;
  return scale;
}
