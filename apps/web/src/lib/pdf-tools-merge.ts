import { PDF_TOOLS_LIMITS, type PdfInfo } from './pdf-tools-model';
import { pageOutputError } from './pdf-tools-page-outputs';

export const PDF_MERGE_LIMITS = {
  documents: 8,
  bytes: 20 * 1024 * 1024,
  pages: PDF_TOOLS_LIMITS.pages,
} as const;
export type PdfMergeSource = {
  id: string;
  name: string;
  size: number;
  fingerprint: string;
  info: PdfInfo;
};
export type PdfMergePage = { document: string; page: number };
export type PdfMergePlan = { documents: string[]; pages: PdfMergePage[] };
export type PdfMergeInput = {
  sources: { id: string; name: string; bytes: Uint8Array }[];
  plan: PdfMergePlan;
};
export const emptyMergePlan = (): PdfMergePlan => ({
  documents: [],
  pages: [],
});
export const mergePageId = (page: PdfMergePage) =>
  `${page.document}:${page.page}`;
export const mergeFilename = (name: string) =>
  `${
    Array.from(
      name.replace(/\.pdf$/i, '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_'),
    )
      .slice(0, 60)
      .join('')
      .trim() || 'documents'
  }-combined.pdf`;
export const mergeSourceError = (info: PdfInfo): string => {
  if (info.fields.length)
    return 'Live form fields cannot be merged safely. Create a plain copy in its source application; no fields will be flattened here.';
  return (
    info.organization?.mergeBlocked ||
    (pageOutputError(info)
      ? 'Links, annotations, bookmarks, tags or other document references cannot be safely combined. Use a plain copy from its source application.'
      : '')
  );
};
export async function pdfFingerprint(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
// Retained sources include removals kept for Undo. Their bytes/proxies still
// consume resources, so removal must not make them disappear from this budget.
export function mergeResourceError(
  sources: Pick<PdfMergeSource, 'size' | 'info'>[],
) {
  if (sources.length > PDF_MERGE_LIMITS.documents)
    return 'Use at most 8 PDFs per merge. Close Merge and reopen it to release files kept for Undo.';
  if (
    sources.reduce((sum, source) => sum + source.size, 0) >
    PDF_MERGE_LIMITS.bytes
  )
    return 'Use at most 20 MiB of PDF files per merge. Choose smaller files, or reopen Merge to release files kept for Undo.';
  if (
    sources.reduce((sum, source) => sum + source.info.pages.length, 0) >
    PDF_MERGE_LIMITS.pages
  )
    return 'Use at most 50 source pages per merge, including pages kept for Undo. Extract smaller copies first, or reopen Merge.';
  return '';
}
export function mergePlanError(
  sources: PdfMergeSource[],
  plan: PdfMergePlan,
): string {
  if (!plan.pages.length)
    return 'Add at least two PDFs and include the pages you want to combine.';
  const ids = new Set(sources.map((source) => source.id));
  if (
    ids.size !== sources.length ||
    !plan.pages.length ||
    plan.pages.length > PDF_MERGE_LIMITS.pages ||
    new Set(plan.documents).size !== plan.documents.length ||
    plan.documents.some((id) => !ids.has(id)) ||
    new Set(plan.pages.map(mergePageId)).size !== plan.pages.length ||
    plan.pages.some(
      (page) =>
        !plan.documents.includes(page.document) ||
        !Number.isInteger(page.page) ||
        page.page < 0 ||
        !sources.find((source) => source.id === page.document)?.info.pages[
          page.page
        ],
    )
  )
    return 'Choose available pages without duplicates. Review the merge plan or undo the last change.';
  if (new Set(plan.pages.map((page) => page.document)).size < 2)
    return 'Include pages from at least two different PDFs to combine them.';
  return '';
}
export function moveMergeItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  )
    return items;
  const copy = [...items];
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}
export function moveMergeDocument(
  plan: PdfMergePlan,
  id: string,
  to: number,
): PdfMergePlan {
  const documents = moveMergeItem(
    plan.documents,
    plan.documents.indexOf(id),
    to,
  );
  if (documents === plan.documents) return plan;
  return {
    documents,
    pages: documents.flatMap((id) =>
      plan.pages.filter((page) => page.document === id),
    ),
  };
}
