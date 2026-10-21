import type { PdfEdits, PdfInfo, PdfPageEdit } from './pdf-tools-model';
import { pagePlan, pagePlanError } from './pdf-tools-organization';

export const PDF_PAGE_OUTPUT_BYTES = 60 * 1024 * 1024;
export const PDF_FORM_OUTPUT_ERROR =
  'Extract and Split are unavailable for PDFs with interactive form fields. Use the source application to create separate copies without breaking field relationships. Your document stays editable here.';
export const pageOutputError = (info: PdfInfo) =>
  info.organization?.outputBlocked ||
  info.organization?.blocked ||
  (info.fields.length ? PDF_FORM_OUTPUT_ERROR : '');

// Range numbers are current one-based positions, never internal identities.
export function parsePagePositions(value: string, count: number): number[] {
  if (value.length > 300)
    throw new Error('Use a shorter page range, or select thumbnails.');
  if (!value.trim())
    throw new Error('Enter at least one page number or range.');
  const positions = new Set<number>();
  for (const token of value.split(',')) {
    const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?$/.exec(token);
    if (!match) throw new Error('Use page numbers and ranges, such as 1–3, 5.');
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end > count ||
      end < start
    )
      throw new Error(
        `Choose page numbers between 1 and ${count}, with ranges in ascending order.`,
      );
    for (let position = start; position <= end; position++)
      positions.add(position);
  }
  return [...positions].sort((a, b) => a - b);
}

export function pageRangeLabel(positions: number[]): string {
  const ranges: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    let end = start;
    while (positions[i + 1] === end + 1) end = positions[++i];
    ranges.push(start === end ? String(start) : `${start}–${end}`);
  }
  return ranges.join(', ');
}

export type PdfPageOutput = {
  name: string;
  sources: number[];
  positions: number[];
};
export function planPageOutputs(
  name: string,
  pages: PdfPageEdit[],
  mode: 'extract' | 'split',
  choices: number[],
): PdfPageOutput[] {
  const base =
    Array.from(
      name.replace(/\.pdf$/i, '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_'),
    )
      .slice(0, 60)
      .join('')
      .trim() || 'document';
  const choice = new Set(choices);
  if (choices.some((source) => !pages.some((page) => page.source === source)))
    throw new Error('The page choices changed. Choose pages again.');
  const groups: number[][] = [];
  if (mode === 'extract') {
    const selected = pages.flatMap((page, index) =>
      choice.has(page.source) ? [index + 1] : [],
    );
    if (!selected.length) return [];
    groups.push(selected);
  } else {
    let group: number[] = [];
    pages.forEach((page, index) => {
      group.push(index + 1);
      if (choice.has(page.source) || index === pages.length - 1) {
        groups.push(group);
        group = [];
      }
    });
    if (groups.length < 2) return [];
  }
  return groups.map((positions, index) => ({
    name: `${base}-${mode === 'split' ? `part-${String(index + 1).padStart(2, '0')}-` : ''}pages-${pageRangeLabel(positions).replaceAll('–', '-').replaceAll(', ', '_')}.pdf`,
    sources: positions.map((position) => pages[position - 1].source),
    positions,
  }));
}

export function pageSubsetEdits(
  info: PdfInfo,
  edits: PdfEdits,
  sources: number[],
): PdfEdits {
  const error = pageOutputError(info) || pagePlanError(info, edits);
  if (error) throw new Error(error);
  const active = pagePlan(info, edits);
  const chosen = new Set(sources);
  if (
    !sources.length ||
    chosen.size !== sources.length ||
    sources.some((source) => !active.some((page) => page.source === source))
  )
    throw new Error('Choose at least one available page, without duplicates.');
  return {
    fields: { ...edits.fields },
    pages: active
      .filter((page) => chosen.has(page.source))
      .map((page) => ({ ...page })),
    elements: edits.elements.filter((mark) => chosen.has(mark.page)),
  };
}
