import type {
  PdfEdits,
  PdfElement,
  PdfInfo,
  PdfPageEdit,
} from './pdf-tools-model';

export const quarterTurn = (angle: number) => ((angle % 360) + 360) % 360;
export const pagePlan = (
  info: PdfInfo,
  edits: Pick<PdfEdits, 'pages'>,
): PdfPageEdit[] =>
  edits.pages ?? info.pages.map((_, source) => ({ source, rotation: 0 }));

export function pagePlanError(info: PdfInfo, edits: PdfEdits): string {
  if (!edits.pages) return '';
  const pages = edits.pages;
  if (
    !pages.length ||
    pages.length > info.pages.length ||
    new Set(pages.map((page) => page.source)).size !== pages.length ||
    pages.some(
      (page) =>
        !Number.isInteger(page.source) ||
        !info.pages[page.source] ||
        ![0, 90, 180, 270].includes(page.rotation),
    ) ||
    edits.elements.some(
      (mark) => !pages.some((page) => page.source === mark.page),
    )
  )
    return 'This page arrangement is invalid. Undo the last page change or reopen the original PDF.';
  const changed =
    pages.length !== info.pages.length ||
    pages.some((page, index) => page.source !== index || page.rotation !== 0);
  if (changed && info.organization?.blocked) return info.organization.blocked;
  if (pages.length !== info.pages.length && info.organization?.removalBlocked)
    return info.organization.removalBlocked;
  return '';
}

// Geometry remains indexed by immutable source identity, never display order.
export function organizedInfo(
  info: PdfInfo,
  edits: Pick<PdfEdits, 'pages'>,
): PdfInfo {
  if (!edits.pages) return info;
  return {
    ...info,
    pages: info.pages.map((page, source) => {
      const turn =
        edits.pages!.find((item) => item.source === source)?.rotation ?? 0;
      const rotation = quarterTurn(page.rotation + turn);
      return {
        ...page,
        rotation,
        viewWidth: rotation % 180 ? page.height : page.width,
        viewHeight: rotation % 180 ? page.width : page.height,
      };
    }),
  };
}

export function rotatePageMark(
  mark: PdfElement,
  width: number,
  height: number,
  clockwise: boolean,
): PdfElement {
  return {
    ...mark,
    x: clockwise ? height - mark.y - mark.height : mark.y,
    y: clockwise ? mark.x : width - mark.x - mark.width,
    width: mark.height,
    height: mark.width,
    contentRotation: quarterTurn(
      (mark.contentRotation ?? 0) + (clockwise ? 90 : -90),
    ),
  };
}

export function organizePages(
  info: PdfInfo,
  edits: PdfEdits,
  operation:
    | { kind: 'move'; source: number; to: number }
    | { kind: 'rotate'; source: number; clockwise: boolean }
    | { kind: 'remove'; source: number },
): PdfEdits {
  const pages = pagePlan(info, edits).map((page) => ({ ...page }));
  const index = pages.findIndex((page) => page.source === operation.source);
  if (index < 0) throw new Error('Choose a page in this document.');
  let elements = edits.elements;
  if (operation.kind === 'move') {
    if (
      !Number.isInteger(operation.to) ||
      operation.to < 0 ||
      operation.to >= pages.length
    )
      throw new Error('Choose an available page position.');
    if (index === operation.to) return edits;
    pages.splice(operation.to, 0, pages.splice(index, 1)[0]);
  } else if (operation.kind === 'rotate') {
    const geometry = organizedInfo(info, edits).pages[operation.source];
    pages[index].rotation = quarterTurn(
      pages[index].rotation + (operation.clockwise ? 90 : -90),
    );
    elements = elements.map((mark) =>
      mark.page === operation.source
        ? rotatePageMark(
            mark,
            geometry.viewWidth,
            geometry.viewHeight,
            operation.clockwise,
          )
        : mark,
    );
  } else {
    if (pages.length === 1)
      throw new Error('Keep at least one page in the document.');
    pages.splice(index, 1);
    elements = elements.filter((mark) => mark.page !== operation.source);
  }
  const next = { ...edits, pages, elements };
  const error = pagePlanError(info, next);
  if (error) throw new Error(error);
  return next;
}

// The painter and text layout use the artwork's native dimensions. Its stored
// width/height always describe the current visible page-aligned bounding box.
export function nativeMark(mark: PdfElement): PdfElement {
  return (mark.contentRotation ?? 0) % 180
    ? { ...mark, width: mark.height, height: mark.width, contentRotation: 0 }
    : { ...mark, contentRotation: 0 };
}
