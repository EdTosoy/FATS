import { describe, expect, it } from 'vitest';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { mergeFixture } from '../helpers/pdf-tools-merge-fixtures';
import { annotatedOrganizationFixture } from '../helpers/pdf-tools-organization-fixtures';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import {
  encryptedPdfFixture,
  signedPdfFixture,
} from '../helpers/pdf-tools-security-fixtures';
import {
  inspectLocalPdf,
  mergeLocalPdfs,
} from '../../apps/web/src/lib/pdf-tools-engine';
import {
  emptyMergePlan,
  mergePageId,
  mergePlanError,
  mergeResourceError,
  mergeSourceError,
  moveMergeDocument,
  moveMergeItem,
  pdfFingerprint,
  type PdfMergeSource,
} from '../../apps/web/src/lib/pdf-tools-merge';

async function source(id: string, count = 2): Promise<PdfMergeSource> {
  const bytes = await mergeFixture(id, count);
  return {
    id,
    name: `${id}.pdf`,
    size: bytes.length,
    fingerprint: await pdfFingerprint(bytes),
    info: await inspectLocalPdf(bytes),
  };
}
describe('isolated merge plans and resource limits', () => {
  it('keeps document-aware identities through individual moves and explicit document regrouping', async () => {
    const sources = [await source('a'), await source('b')];
    const plan = {
      documents: ['a', 'b'],
      pages: [
        { document: 'a', page: 0 },
        { document: 'b', page: 1 },
        { document: 'a', page: 1 },
        { document: 'b', page: 0 },
      ],
    };
    const before = JSON.stringify(plan);
    expect(new Set(plan.pages.map(mergePageId)).size).toBe(4);
    expect(mergePlanError(sources, plan)).toBe('');
    expect(moveMergeDocument(plan, 'b', 0).pages.map(mergePageId)).toEqual([
      'b:1',
      'b:0',
      'a:0',
      'a:1',
    ]);
    expect(moveMergeItem(plan.pages, 0, 3).map(mergePageId)).toEqual([
      'b:1',
      'a:1',
      'b:0',
      'a:0',
    ]);
    expect(JSON.stringify(plan)).toBe(before);
    for (const invalid of [
      emptyMergePlan(),
      { ...plan, documents: ['a', 'a'] },
      { ...plan, pages: [plan.pages[0], plan.pages[0]] },
      { ...plan, pages: [{ document: 'missing', page: 0 }] },
      { ...plan, pages: [{ document: 'a', page: -1 }] },
      { ...plan, pages: [{ document: 'a', page: 90 }] },
    ])
      expect(mergePlanError(sources, invalid)).not.toBe('');
  });
  it('counts all retained inputs, including removed pages kept for undo, at aggregate boundaries', async () => {
    const a = await source('a', 5);
    expect(mergeResourceError(Array.from({ length: 8 }, () => a))).toBe('');
    expect(mergeResourceError(Array.from({ length: 9 }, () => a))).toMatch(
      /8 PDFs/,
    );
    expect(
      mergeResourceError([
        { ...a, size: 10 * 1024 * 1024 },
        { ...a, size: 10 * 1024 * 1024 },
      ]),
    ).toBe('');
    expect(mergeResourceError([{ ...a, size: 20 * 1024 * 1024 + 1 }])).toMatch(
      /20 MiB/,
    );
    expect(
      mergeResourceError([
        { ...a, info: { ...a.info, pages: Array(51).fill(a.info.pages[0]) } },
      ]),
    ).toMatch(/50 source pages/);
  });
});
describe('real merge through the existing worker engine', () => {
  it('combines three documents with same filenames, exact native streams/resources, crops/rotations and new metadata', async () => {
    const sources = await Promise.all(
      ['ALPHA', 'BETA', 'GAMMA'].map(async (id) => ({
        id,
        name: 'same-name.pdf',
        bytes: await mergeFixture(id, 5),
      })),
    );
    const before = sources.map((source) => Buffer.from(source.bytes));
    const pages = [
      { document: 'GAMMA', page: 4 },
      { document: 'ALPHA', page: 2 },
      { document: 'BETA', page: 3 },
      { document: 'ALPHA', page: 0 },
      { document: 'BETA', page: 1 },
    ];
    const snapshot = JSON.stringify(pages);
    const result = await mergeLocalPdfs({
      sources,
      plan: { documents: ['GAMMA', 'ALPHA', 'BETA'], pages },
    });
    const pdf = await pdfToolsLib.PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(pages.length);
    expect(pdf.getTitle()).toBe('Combined PDF');
    expect(pdf.getAuthor()).toBeUndefined();
    expect(pdf.getForm().getFields()).toEqual([]);
    for (const [index, page] of pages.entries()) {
      const donor = await pdfToolsLib.PDFDocument.load(
        sources.find((source) => source.id === page.document)!.bytes,
      );
      const original = donor.getPage(page.page),
        actual = pdf.getPage(index);
      expect(actual.getMediaBox()).toEqual(original.getMediaBox());
      expect(actual.getCropBox()).toEqual(original.getCropBox());
      expect(actual.getRotation()).toEqual(original.getRotation());
      const streams = (
        doc: typeof pdf,
        value: ReturnType<typeof original.node.Contents>,
      ) =>
        (value instanceof pdfToolsLib.PDFArray ? value.asArray() : [value]).map(
          (ref) => {
            const stream = doc.context.lookup(ref);
            if (!(stream instanceof pdfToolsLib.PDFRawStream))
              throw new Error('Expected native stream.');
            return Array.from(stream.getContents());
          },
        );
      expect(streams(pdf, actual.node.Contents())).toEqual(
        streams(donor, original.node.Contents()),
      );
      const images = actual.node
        .Resources()
        ?.lookup(pdfToolsLib.PDFName.of('XObject'), pdfToolsLib.PDFDict);
      expect(images?.keys().length).toBeGreaterThan(0);
    }
    expect(sources.map((source) => Buffer.from(source.bytes))).toEqual(before);
    expect(JSON.stringify(pages)).toBe(snapshot);
  });
  it('pins inherited geometry and resources when independent pages leave a donor tree', async () => {
    const pdf = await pdfToolsLib.PDFDocument.load(
      await mergeFixture('INHERITED'),
    );
    const page = pdf.getPage(0),
      parent = page.node.Parent()!;
    for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
      const name = pdfToolsLib.PDFName.of(key),
        value = page.node.getInheritableAttribute(name);
      if (value) {
        parent.set(name, value);
        page.node.delete(name);
      }
    }
    const input = [
      { id: 'a', name: 'inherited.pdf', bytes: await pdf.save() },
      { id: 'b', name: 'other.pdf', bytes: await mergeFixture('OTHER') },
    ];
    const result = await mergeLocalPdfs({
      sources: input,
      plan: {
        documents: ['a', 'b'],
        pages: [
          { document: 'a', page: 0 },
          { document: 'b', page: 0 },
        ],
      },
    });
    const after = await pdfToolsLib.PDFDocument.load(result.bytes);
    expect(after.getPage(0).getMediaBox()).toEqual(page.getMediaBox());
    expect(after.getPage(0).getCropBox()).toEqual(page.getCropBox());
    expect(after.getPage(0).node.Resources()?.keys().length).toBeGreaterThan(0);
  });
  it('rejects duplicate bytes, stale identities and invalid plans at the export boundary', async () => {
    const a = { id: 'a', name: 'a.pdf', bytes: await mergeFixture('ALPHA') };
    const b = { id: 'b', name: 'b.pdf', bytes: await mergeFixture('BETA') };
    const plan = {
      documents: ['a', 'b'],
      pages: [
        { document: 'a', page: 0 },
        { document: 'b', page: 0 },
      ],
    };
    await expect(
      mergeLocalPdfs({
        sources: [a, { ...a, id: 'b', name: 'renamed.pdf' }],
        plan,
      }),
    ).rejects.toThrow('already');
    await expect(
      mergeLocalPdfs({
        sources: [a, b],
        plan: { ...plan, pages: [plan.pages[0], plan.pages[0]] },
      }),
    ).rejects.toThrow('duplicates');
    await expect(
      mergeLocalPdfs({ sources: [a, { ...b, id: 'a' }], plan }),
    ).rejects.toThrow('duplicates');
  });
  it('rejects unsafe forms, annotations, page references, signatures, encryption and color settings without changing sources', async () => {
    const a = { id: 'a', name: 'safe.pdf', bytes: await mergeFixture('SAFE') };
    const signed = await signedPdfFixture();
    const inputs = [
      await employmentEditingFixture(),
      await annotatedOrganizationFixture('link'),
      await annotatedOrganizationFixture('unknown'),
      await annotatedOrganizationFixture('tagged'),
      await annotatedOrganizationFixture('printRange'),
      encryptedPdfFixture(),
      signed,
    ];
    for (const kind of [
      'OutputIntents',
      'Version',
      'crossPage',
      'externalFile',
      'referenceXObject',
    ]) {
      const pdf = await pdfToolsLib.PDFDocument.load(await mergeFixture(kind));
      if (kind === 'crossPage')
        pdf
          .getPage(0)
          .node.set(pdfToolsLib.PDFName.of('PrivateData'), pdf.getPage(1).ref);
      else if (kind === 'externalFile')
        pdf.getPage(0).node.set(
          pdfToolsLib.PDFName.of('PrivateData'),
          pdf.context.obj({
            Type: 'Filespec',
            F: pdfToolsLib.PDFString.of('another.pdf'),
          }),
        );
      else if (kind === 'referenceXObject') {
        const ref = pdf.context.register(
          pdf.context.flateStream('', {
            Type: 'XObject',
            Subtype: 'Form',
            BBox: [0, 0, 20, 20],
            Ref: { F: pdfToolsLib.PDFString.of('another.pdf'), Page: 0 },
          }),
        );
        pdf.getPage(0).node.newXObject('External', ref);
      } else
        pdf.catalog.set(
          pdfToolsLib.PDFName.of(kind),
          kind === 'Version'
            ? pdfToolsLib.PDFName.of('1.7')
            : pdf.context.obj([]),
        );
      inputs.push(Buffer.from(await pdf.save()));
    }
    for (const bytes of inputs) {
      const before = Buffer.from(bytes);
      await expect(
        mergeLocalPdfs({
          sources: [a, { id: 'b', name: 'blocked.pdf', bytes }],
          plan: {
            documents: ['a', 'b'],
            pages: [
              { document: 'a', page: 0 },
              { document: 'b', page: 0 },
            ],
          },
        }),
      ).rejects.toThrow(/blocked.pdf:/);
      expect(bytes).toEqual(before);
    }
    expect(mergeSourceError((await source('safe')).info)).toBe('');
  });
});
