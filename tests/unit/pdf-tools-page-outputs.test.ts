import { describe, expect, it } from 'vitest';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import {
  organizationFixture,
  annotatedOrganizationFixture,
} from '../helpers/pdf-tools-organization-fixtures';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import {
  emptyPdfEdits,
  type PdfEdits,
  type PdfElement,
} from '../../apps/web/src/lib/pdf-tools-model';
import {
  organizePages,
  organizedInfo,
  pagePlan,
} from '../../apps/web/src/lib/pdf-tools-organization';
import {
  pageSubsetEdits,
  pageOutputError,
  pageRangeLabel,
  parsePagePositions,
  planPageOutputs,
} from '../../apps/web/src/lib/pdf-tools-page-outputs';
import {
  exportLocalPdf,
  inspectLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';

const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const mark: PdfElement = {
  id: 'synthetic',
  kind: 'initials',
  page: 2,
  x: 40,
  y: 50,
  width: 90,
  height: 30,
  text: 'AS',
};
describe('independent PDF page plans', () => {
  it('parses bounded human ranges without changing document order or duplicating pages', () => {
    expect(parsePagePositions('5, 1–3, 2', 5)).toEqual([1, 2, 3, 5]);
    expect(pageRangeLabel([1, 2, 3, 5])).toBe('1–3, 5');
    for (const invalid of [
      '',
      '0',
      '6',
      '4-2',
      '1,,2',
      '1-50',
      '-1',
      '1.5',
      '9007199254740993',
      '1,'.repeat(151),
    ])
      expect(() => parsePagePositions(invalid, 5), invalid).toThrow();
  });
  it('plans noncontiguous extraction and a complete, disjoint split in current page order', async () => {
    const info = await inspectLocalPdf(await organizationFixture());
    const edits = organizePages(info, emptyPdfEdits(), {
      kind: 'move',
      source: 2,
      to: 0,
    });
    const pages = pagePlan(info, edits);
    const extract = planPageOutputs(
      'synthetic.pdf',
      pages,
      'extract',
      [4, 2, 1],
    );
    expect(extract[0]).toEqual({
      name: 'synthetic-pages-1_3_5.pdf',
      sources: [2, 1, 4],
      positions: [1, 3, 5],
    });
    const parts = planPageOutputs('synthetic.pdf', pages, 'split', [0, 3]);
    expect(parts.map((part) => part.positions)).toEqual([[1, 2], [3, 4], [5]]);
    expect(parts.flatMap((part) => part.sources)).toEqual(
      pages.map((page) => page.source),
    );
    expect(parts.map((part) => part.name)).toEqual([
      'synthetic-part-01-pages-1-2.pdf',
      'synthetic-part-02-pages-3-4.pdf',
      'synthetic-part-03-pages-5.pdf',
    ]);
    expect(planPageOutputs('one.pdf', pages.slice(0, 1), 'split', [])).toEqual(
      [],
    );
    expect(planPageOutputs('one.pdf', pages, 'extract', [])).toEqual([]);
    expect(
      planPageOutputs('../bad:name.pdf', pages, 'extract', [0])[0].name,
    ).not.toMatch(/[/:]/);
  });
  it('rejects empty, stale and duplicate source identities; subset selection does not change edits or history', async () => {
    const info = await inspectLocalPdf(await organizationFixture());
    const edits = { ...emptyPdfEdits(), elements: [mark] };
    const snapshot = JSON.stringify(edits);
    const subset = pageSubsetEdits(info, edits, [2, 0]);
    expect(subset.pages?.map((page) => page.source)).toEqual([0, 2]);
    expect(subset.elements).toEqual([mark]);
    expect(JSON.stringify(edits)).toBe(snapshot);
    for (const sources of [[], [0, 0], [-1], [50]])
      expect(() => pageSubsetEdits(info, edits, sources)).toThrow();
    expect(() =>
      planPageOutputs('bad.pdf', pagePlan(info, edits), 'extract', [50]),
    ).toThrow('changed');
    const removed = organizePages(info, edits, { kind: 'remove', source: 2 });
    expect(() => pageSubsetEdits(info, removed, [2])).toThrow('available');
  });
});

describe('independent output through the existing writer', () => {
  it('copies only chosen page objects, preserving edited geometry, native streams, metadata and marks', async () => {
    const original = await organizationFixture();
    const source = await pdfToolsLib.PDFDocument.load(original);
    source.catalog.set(
      pdfToolsLib.PDFName.of('Lang'),
      pdfToolsLib.PDFString.of('en-PH'),
    );
    source.catalog.getOrCreateViewerPreferences().setHideToolbar(true);
    const bytes = await source.save(),
      snapshot = bytes.slice();
    const info = await inspectLocalPdf(bytes);
    expect(pageOutputError(info)).toBe('');
    let edits: PdfEdits = {
      ...emptyPdfEdits(),
      elements: [mark, { ...mark, id: 'outside', page: 4 }],
    };
    edits = organizePages(info, edits, { kind: 'move', source: 2, to: 0 });
    edits = organizePages(info, edits, {
      kind: 'rotate',
      source: 2,
      clockwise: true,
    });
    const before = JSON.stringify(edits);
    const subset = pageSubsetEdits(info, edits, [0, 2]);
    const result = await exportLocalPdf(
      bytes,
      info,
      subset,
      subset.elements.map((element) => ({ element, png })),
      { preserveFields: true, independent: true },
    );
    const output = await pdfToolsLib.PDFDocument.load(result);
    expect(output.getPageCount()).toBe(2);
    expect(output.getTitle()).toBe(source.getTitle());
    expect(output.getAuthor()).toBe(source.getAuthor());
    expect(output.catalog.getOrCreateViewerPreferences().getHideToolbar()).toBe(
      true,
    );
    expect(
      output.catalog.lookup(pdfToolsLib.PDFName.of('Lang'))?.toString(),
    ).toBe('(en-PH)');
    const geometry = organizedInfo(info, edits);
    for (const [index, originalIndex] of [2, 0].entries()) {
      expect(output.getPage(index).getMediaBox()).toEqual(
        source.getPage(originalIndex).getMediaBox(),
      );
      expect(output.getPage(index).getCropBox()).toEqual(
        source.getPage(originalIndex).getCropBox(),
      );
      expect(output.getPage(index).getRotation().angle).toBe(
        geometry.pages[originalIndex].rotation,
      );
    }
    // Detached unselected pages from the loaded source must not be serialized
    // as hidden page objects in an extracted copy.
    const leaves = output.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof pdfToolsLib.PDFDict &&
          object.get(pdfToolsLib.PDFName.of('Type')) ===
            pdfToolsLib.PDFName.of('Page'),
      );
    expect(leaves).toHaveLength(2);
    expect(bytes).toEqual(snapshot);
    expect(JSON.stringify(edits)).toBe(before);
    await expect(
      exportLocalPdf(bytes, info, subset, [], {
        preserveFields: true,
        independent: true,
      }),
    ).rejects.toThrow('every added mark');
  });
  it('creates valid independent one-page and multi-section PDFs, including every orthogonal source rotation', async () => {
    const original = await organizationFixture(),
      info = await inspectLocalPdf(original);
    for (const sources of [
      [0],
      [1],
      [2],
      [3],
      [4],
      [0, 2, 4],
      [0, 1],
      [2, 3],
    ]) {
      const subset = pageSubsetEdits(info, emptyPdfEdits(), sources);
      const result = await exportLocalPdf(original, info, subset, [], {
        preserveFields: true,
        independent: true,
      });
      const checked = await inspectLocalPdf(result);
      expect(checked.pages).toEqual(
        sources.map((source) => info.pages[source]),
      );
      expect(checked.fields).toEqual([]);
      expect(pageOutputError(checked)).toBe('');
    }
  });
  it('blocks live form copies even when all pages are selected, without flattening or changing values', async () => {
    const original = await employmentEditingFixture(),
      info = await inspectLocalPdf(original);
    expect(pageOutputError(info)).toMatch(/interactive form/);
    await expect(
      exportLocalPdf(original, info, emptyPdfEdits(), [], {
        preserveFields: true,
        independent: true,
      }),
    ).rejects.toThrow('interactive form');
    expect(() => pageSubsetEdits(info, emptyPdfEdits(), [0])).toThrow(
      'interactive form',
    );
    expect(
      (await pdfToolsLib.PDFDocument.load(original)).getForm().getFields()
        .length,
    ).toBeGreaterThan(0);
  });
  it('rejects unsafe annotations, links, destinations, print ranges and document structures for independent copies', async () => {
    for (const kind of [
      'link',
      'unknown',
      'tagged',
      'outline',
      'labels',
      'printRange',
      'noRotate',
      'orphan',
    ] as const) {
      const original = await annotatedOrganizationFixture(kind),
        info = await inspectLocalPdf(original);
      expect(pageOutputError(info), kind).not.toBe('');
      await expect(
        exportLocalPdf(original, info, emptyPdfEdits(), [], {
          preserveFields: true,
          independent: true,
        }),
        kind,
      ).rejects.toThrow();
    }
  });
  it('blocks unreviewed catalog metadata and hidden cross-page or dangling references, while additive editing remains available', async () => {
    for (const kind of ['catalog', 'crossPage', 'dangling']) {
      const pdf = await pdfToolsLib.PDFDocument.load(
        await organizationFixture(2),
      );
      if (kind === 'catalog')
        pdf.catalog.set(
          pdfToolsLib.PDFName.of('Legal'),
          pdf.context.obj({ Private: 'Synthetic only' }),
        );
      else
        pdf
          .getPage(0)
          .node.set(
            pdfToolsLib.PDFName.of('PrivateData'),
            kind === 'crossPage'
              ? pdf.getPage(1).ref
              : pdfToolsLib.PDFRef.of(99999),
          );
      const bytes = await pdf.save(),
        info = await inspectLocalPdf(bytes);
      expect(info.organization?.blocked).toBeUndefined();
      expect(pageOutputError(info)).toMatch(/cross-page references/);
      await expect(
        exportLocalPdf(bytes, info, emptyPdfEdits(), [], {
          preserveFields: true,
          independent: true,
        }),
      ).rejects.toThrow('cross-page');
      await expect(
        exportLocalPdf(bytes, info, emptyPdfEdits(), [], {
          preserveFields: true,
        }),
      ).resolves.toBeInstanceOf(Uint8Array);
    }
  });
});
