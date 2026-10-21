import { describe, it, expect } from 'vitest';
import {
  signatureNameError,
  resizeSignature,
  moveSignature,
} from '../../apps/web/src/lib/pdf-tools-signature';
import {
  exportLocalPdf,
  inspectLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';
import {
  emptyPdfEdits,
  overlapsPdfFormField,
  PDF_FORM_OVERLAP_ERROR,
  type PdfElement,
  type PdfPageInfo,
} from '../../apps/web/src/lib/pdf-tools-model';
import { pdfWorkspaceFixture } from '../helpers/pdf-tools-v2-fixtures';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';

const page: PdfPageInfo = {
  x: 20,
  y: 30,
  width: 550,
  height: 780,
  viewWidth: 780,
  viewHeight: 550,
  rotation: 90,
};
const mark: PdfElement = {
  id: 'test',
  kind: 'signature',
  text: 'María José',
  signatureStyle: 'classic',
  signatureFontSize: 32,
  page: 0,
  x: 30,
  y: 40,
  width: 240,
  height: 60,
};
describe('Quick Sign typography and proportional editing', () => {
  it('checks live form-widget intersections in PDF coordinates across every rotation and crop origin', () => {
    for (const [rotation, x, y, width, height] of [
      [0, 70, 685, 50, 20],
      [90, 75, 65, 20, 50],
      [180, 300, 75, 50, 20],
      [270, 685, 300, 20, 50],
    ]) {
      const geometry = {
        ...page,
        rotation,
        viewWidth: rotation % 180 ? 780 : 550,
        viewHeight: rotation % 180 ? 550 : 780,
      };
      const info = {
        pages: [geometry],
        fields: [],
        formWidgets: [{ page: 0, x: 80, y: 100, width: 200, height: 30 }],
      };
      expect(overlapsPdfFormField({ ...mark, x, y, width, height }, info)).toBe(
        true,
      );
      expect(
        overlapsPdfFormField(
          { ...mark, x: 0, y: 0, width: 24, height: 18 },
          info,
        ),
      ).toBe(false);
      expect(
        overlapsPdfFormField({ ...mark, page: 1, x, y, width, height }, info),
      ).toBe(false);
    }
  });
  it('accepts the declared accented repertoire and rejects unsupported/hidden glyphs without truncation', () => {
    for (const text of [
      'Li',
      'Alex Rivera',
      'María José de la Cruz',
      'Jose\u0301',
      'Renée Noël',
    ])
      expect(signatureNameError(text)).toBe('');
    for (const text of [
      'Alex 漢',
      'Alex🙂',
      'Alex\u200b',
      'Alex\nRivera',
      'Łukasz',
    ])
      expect(signatureNameError(text)).toContain('Use Draw');
    expect(signatureNameError('a'.repeat(101))).toContain(
      'full name has been kept',
    );
  });
  it('keeps aspect ratio and readable type, including movement and page edges', () => {
    const enlarged = resizeSignature(mark, 480, page);
    expect(enlarged.width / enlarged.height).toBe(4);
    expect(enlarged.signatureFontSize).toBe(64);
    expect(() => resizeSignature(mark, 100, page)).toThrow('large enough');
    const edge = resizeSignature({ ...mark, x: 600, y: 400 }, 500, page);
    expect(edge.width).toBe(180);
    expect(edge.height).toBe(45);
    expect(edge.signatureFontSize).toBe(24);
    const moved = moveSignature(mark, -20, 999, page);
    expect(moved).toMatchObject({ x: 0, y: 490, width: 240, height: 60 });
    expect(mark).toMatchObject({ x: 30, y: 40, width: 240, height: 60 });
  });
  it('preserves existing form fields/values and page content in signature-only export', async () => {
    const original = await pdfWorkspaceFixture();
    const before = original.slice();
    const info = await inspectLocalPdf(original);
    const png = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const source = await pdfToolsLib.PDFDocument.load(original);
    const bytes = await exportLocalPdf(
      original,
      info,
      { elements: [mark], fields: {} },
      [{ element: mark, png }],
      { preserveFields: true },
    );
    const output = await pdfToolsLib.PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(source.getPageCount());
    expect(output.getForm().getTextField('Synthetic full name').getText()).toBe(
      'Alex Rivera',
    );
    for (let index = 0; index < 4; index++) {
      expect(output.getPage(index).getCropBox()).toEqual(
        source.getPage(index).getCropBox(),
      );
      expect(output.getPage(index).getRotation()).toEqual(
        source.getPage(index).getRotation(),
      );
      // Original content streams are retained verbatim, with added marks in
      // appended streams rather than a destructive page raster replacement.
      const content = source.getPage(index).node.Contents();
      const refs =
        content instanceof pdfToolsLib.PDFArray ? content.asArray() : [content];
      const originalStreams = refs
        .map((ref) => source.context.lookup(ref))
        .filter((value) => value instanceof pdfToolsLib.PDFRawStream)
        .map((stream) => Buffer.from(stream.contents).toString('base64'));
      const result = output.getPage(index).node.Contents();
      const resultRefs =
        result instanceof pdfToolsLib.PDFArray ? result.asArray() : [result];
      const outputStreams = resultRefs
        .map((ref) => output.context.lookup(ref))
        .filter((value) => value instanceof pdfToolsLib.PDFRawStream)
        .map((stream) => Buffer.from(stream.contents).toString('base64'));
      for (const stream of originalStreams)
        expect(outputStreams).toContain(stream);
    }
    expect(original).toEqual(before);
    await expect(
      exportLocalPdf(
        original,
        info,
        { ...emptyPdfEdits(), fields: { 'Synthetic full name': 'Changed' } },
        [],
        { preserveFields: true },
      ),
    ).rejects.toThrow('cannot change');
    const overlapping = { ...mark, x: 70, y: 575, width: 190, height: 60 };
    expect(info.formWidgets?.some((widget) => widget.page === 0)).toBe(true);
    await expect(
      exportLocalPdf(
        original,
        info,
        { fields: {}, elements: [overlapping] },
        [{ element: overlapping, png }],
        { preserveFields: true },
      ),
    ).rejects.toThrow(PDF_FORM_OVERLAP_ERROR);
    expect(original).toEqual(before);
    // The production editor flattens field appearances before painting marks,
    // so it keeps its existing ability to cover a field without losing ink.
    const legacy = await exportLocalPdf(
      original,
      info,
      { fields: {}, elements: [overlapping] },
      [{ element: overlapping, png }],
    );
    expect(
      (await pdfToolsLib.PDFDocument.load(legacy)).getForm().getFields(),
    ).toHaveLength(0);
  });
});
