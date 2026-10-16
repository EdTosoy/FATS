import { describe, it, expect } from 'vitest';
import {
  inspectLocalPdf,
  exportLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';
import {
  viewToPdf,
  fitElement,
  emptyPdfEdits,
  editHistory,
  stepHistory,
  validateLocalPdfFile,
  PDF_TOOLS_LIMITS,
  type PdfElement,
} from '../../apps/web/src/lib/pdf-tools-model';
import { pdfToolsFixture, pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { activePdfFixture } from '../helpers/document-fixtures';

const mark: PdfElement = {
  id: 'synthetic',
  page: 0,
  kind: 'text',
  text: 'Graduate',
  x: 30,
  y: 200,
  width: 180,
  height: 30,
};
const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64',
  ),
);
describe('local PDF Tools', () => {
  it('loads mixed sizes, crops, all orthogonal rotations and real AcroForm fields', async () => {
    const info = await inspectLocalPdf(await pdfToolsFixture());
    expect(info.pages).toHaveLength(4);
    expect(info.pages[1]).toMatchObject({
      x: 20,
      y: 30,
      width: 550,
      height: 780,
      viewWidth: 780,
      viewHeight: 550,
      rotation: 90,
    });
    expect(
      info.fields.map((field) => [field.name, field.kind, field.pages]),
    ).toEqual([
      ['Full name', 'text', [0]],
      ['Available', 'checkbox', [0]],
      ['Preferred role', 'choice', [0]],
      ['Work arrangement', 'choice', [0]],
    ]);
  });
  it('fills text, checkboxes, dropdowns and radios, flattens appearances, and preserves original bytes', async () => {
    const original = await pdfToolsFixture(),
      before = original.slice();
    const info = await inspectLocalPdf(original);
    const output = await exportLocalPdf(
      original,
      info,
      {
        elements: [],
        fields: {
          'Full name': 'Synthetic Graduate',
          Available: true,
          'Preferred role': 'Trainee',
          'Work arrangement': 'Hybrid',
        },
      },
      [],
    );
    expect(original).toEqual(before);
    const complete = await pdfToolsLib.PDFDocument.load(output);
    expect(complete.getPageCount()).toBe(4);
    expect(complete.getForm().getFields()).toHaveLength(0);
    expect(complete.getPage(1).getCropBox()).toEqual({
      x: 20,
      y: 30,
      width: 550,
      height: 780,
    });
    const untouched = await pdfToolsLib.PDFDocument.load(original);
    expect(
      untouched.getForm().getTextField('Full name').getText(),
    ).toBeUndefined();
    expect(untouched.getForm().getCheckBox('Available').isChecked()).toBe(
      false,
    );
  });
  it('places mark images inside rotated page content, with independent repeat exports', async () => {
    const original = await pdfToolsFixture(),
      info = await inspectLocalPdf(original);
    const elements = info.pages.map((_, page) => ({ ...mark, page }));
    const output = await exportLocalPdf(
      original,
      info,
      { fields: {}, elements },
      elements.map((element) => ({ element, png })),
    );
    const second = await exportLocalPdf(original, info, emptyPdfEdits(), []);
    const pdf = await pdfToolsLib.PDFDocument.load(output),
      clean = await pdfToolsLib.PDFDocument.load(second);
    for (const page of pdf.getPages())
      expect(
        page.node
          .Resources()
          ?.lookup(pdfToolsLib.PDFName.of('XObject'))
          ?.toString(),
      ).toContain('Image');
    for (const page of clean.getPages())
      expect(
        page.node
          .Resources()
          ?.lookup(pdfToolsLib.PDFName.of('XObject'))
          ?.toString() ?? '',
      ).not.toContain('Image');
  });
  it('maps displayed top-left points to PDF crop coordinates at 0/90/180/270 degrees', () => {
    const base = {
      x: 20,
      y: 30,
      width: 550,
      height: 780,
      viewWidth: 550,
      viewHeight: 780,
    };
    const expected = [
      { x: 60, y: 750 },
      { x: 80, y: 70 },
      { x: 530, y: 90 },
      { x: 510, y: 770 },
    ];
    [0, 90, 180, 270].forEach((rotation, index) =>
      expect(viewToPdf({ ...base, rotation }, { x: 40, y: 60 })).toEqual(
        expected[index],
      ),
    );
  });
  it('bounds positions/resizing and provides undo, redo and bounded history', () => {
    const page = {
      x: 0,
      y: 0,
      width: 300,
      height: 400,
      viewWidth: 300,
      viewHeight: 400,
      rotation: 0,
    };
    expect(
      fitElement({ ...mark, x: -10, y: 600, width: 500, height: 10 }, page),
    ).toMatchObject({ x: 0, y: 388, width: 300, height: 12 });
    const first = { past: [], present: emptyPdfEdits(), future: [] };
    const changed = editHistory(first, {
      ...emptyPdfEdits(),
      elements: [mark],
    });
    expect(stepHistory(changed, 'undo').present).toEqual(first.present);
    expect(
      stepHistory(stepHistory(changed, 'undo'), 'redo').present.elements,
    ).toEqual([mark]);
    let history = changed;
    for (let i = 0; i < 80; i++)
      history = editHistory(history, {
        ...emptyPdfEdits(),
        fields: { name: String(i) },
      });
    expect(history.past).toHaveLength(PDF_TOOLS_LIMITS.history);
    expect(
      editHistory(stepHistory(history, 'undo'), emptyPdfEdits()).future,
    ).toHaveLength(0);
  });
  it('rejects malformed, encrypted, active, signed and unsupported forms', async () => {
    await expect(
      inspectLocalPdf(new TextEncoder().encode('%PDF-1.7\ninvalid\n%%EOF')),
    ).rejects.toThrow('malformed');
    await expect(inspectLocalPdf(await activePdfFixture())).rejects.toThrow(
      'scripts',
    );
    for (const kind of ['encrypted', 'signature', 'multiline', 'xfa']) {
      const pdf = await pdfToolsLib.PDFDocument.create();
      pdf.addPage();
      if (kind === 'encrypted')
        pdf.context.trailerInfo.Encrypt = pdf.context.register(
          pdf.context.obj({ Filter: 'Standard' }),
        );
      if (kind === 'signature')
        pdf.catalog.set(pdfToolsLib.PDFName.of('Perms'), pdf.context.obj({}));
      if (kind === 'multiline') {
        const field = pdf.getForm().createTextField('Multiline');
        field.enableMultiline();
        field.addToPage(pdf.getPage(0));
      }
      if (kind === 'xfa')
        pdf.catalog.set(pdfToolsLib.PDFName.of('XFA'), pdf.context.obj({}));
      await expect(inspectLocalPdf(await pdf.save())).rejects.toThrow(
        kind === 'encrypted' ? 'encrypted' : 'unsupported',
      );
    }
  });
  it('enforces bytes, page count, dimensions, field count and element limits', async () => {
    expect(() =>
      validateLocalPdfFile({ name: 'image.png', size: 100 }),
    ).toThrow('PDF');
    for (const size of [0, PDF_TOOLS_LIMITS.bytes + 1])
      expect(() => validateLocalPdfFile({ name: 'file.pdf', size })).toThrow(
        '10 MiB',
      );
    for (const variant of ['pages', 'dimensions', 'fields']) {
      const pdf = await pdfToolsLib.PDFDocument.create();
      pdf.addPage(variant === 'dimensions' ? [3000, 300] : undefined);
      if (variant === 'pages') for (let i = 0; i < 50; i++) pdf.addPage();
      if (variant === 'fields')
        for (let i = 0; i < 151; i++)
          pdf
            .getForm()
            .createTextField('Field' + i)
            .addToPage(pdf.getPage(0));
      await expect(inspectLocalPdf(await pdf.save())).rejects.toThrow(
        variant === 'pages'
          ? '1–50'
          : variant === 'dimensions'
            ? 'dimensions'
            : '150',
      );
    }
    const original = await pdfToolsFixture(),
      info = await inspectLocalPdf(original);
    await expect(
      exportLocalPdf(
        original,
        info,
        { fields: {}, elements: Array(101).fill(mark) },
        [],
      ),
    ).rejects.toThrow('100');
    await expect(
      exportLocalPdf(original, info, { fields: {}, elements: [mark] }, [
        { element: { ...mark, x: 600 }, png },
      ]),
    ).rejects.toThrow('outside');
    await expect(
      exportLocalPdf(
        original,
        info,
        { fields: { 'Full name': 'x'.repeat(501) }, elements: [] },
        [],
      ),
    ).rejects.toThrow('too long');
    await expect(
      exportLocalPdf(
        original,
        info,
        { fields: { 'Full name': 'Graduate 漢' }, elements: [] },
        [],
      ),
    ).rejects.toThrow('Western European');
  });
  it('refuses oversized images before the renderer can silently omit them', async () => {
    const pdf = await pdfToolsLib.PDFDocument.create();
    const page = pdf.addPage();
    const image = pdf.context.stream(new Uint8Array([0]), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 4000,
      Height: 4000,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
    });
    page.node.newXObject('LargeImage', pdf.context.register(image));
    await expect(inspectLocalPdf(await pdf.save())).rejects.toThrow(
      'image larger',
    );
  });
  it('preserves read-only fields and rejects attempts to change them', async () => {
    const pdf = await pdfToolsLib.PDFDocument.create();
    const page = pdf.addPage();
    const field = pdf.getForm().createTextField('Read-only value');
    field.setText('Synthetic fixed value');
    field.enableReadOnly();
    field.addToPage(page);
    const original = await pdf.save(),
      info = await inspectLocalPdf(original);
    expect(info.fields[0].readOnly).toBe(true);
    await expect(
      exportLocalPdf(
        original,
        info,
        { elements: [], fields: { 'Read-only value': 'Changed' } },
        [],
      ),
    ).rejects.toThrow('read-only');
    expect(
      (
        await pdfToolsLib.PDFDocument.load(
          await exportLocalPdf(original, info, emptyPdfEdits(), []),
        )
      )
        .getForm()
        .getFields(),
    ).toHaveLength(0);
  });
});
