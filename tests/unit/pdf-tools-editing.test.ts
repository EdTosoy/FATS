import { describe, expect, it } from 'vitest';
import {
  addedTextError,
  dateText,
  layoutPdfText,
  defaultMarkPoint,
} from '../../apps/web/src/lib/pdf-tools-editing';
import {
  inspectLocalPdf,
  exportLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';
import {
  emptyPdfEdits,
  pdfFieldsError,
  overlapsPdfFormField,
  type PdfElement,
} from '../../apps/web/src/lib/pdf-tools-model';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';

const mark: PdfElement = {
  id: 't',
  kind: 'text',
  text: '',
  page: 0,
  x: 20,
  y: 30,
  width: 100,
  height: 200,
  fontSize: 12,
};
describe('document editing layout and validation', () => {
  it('wraps multiword text, long tokens and explicit paragraphs without dropping characters', () => {
    for (const text of [
      'ordinary multiword text wraps',
      'abcdefghijklmnopqrstuvwxyz',
      'First line\n\nJosé ₱1,000 — accepted',
    ]) {
      const result = layoutPdfText(
        { ...mark, text },
        (value) => value.length * 6,
      );
      expect(result.error).toBe('');
      expect(result.lines.join('').replaceAll(' ', '')).toBe(
        text.replaceAll(' ', '').replaceAll('\n', ''),
      );
      expect(result.lines.every((line) => line.length * 6 <= 92)).toBe(true);
    }
  });
  it('reports overflow and unsupported glyphs, with no truncation', () => {
    expect(
      layoutPdfText(
        { ...mark, text: 'A'.repeat(100), height: 20 },
        (value) => value.length * 6,
      ).error,
    ).toMatch(/more room/);
    expect(addedTextError('Jose\u0301 € ₱ — “Yes”')).toBe('');
    expect(addedTextError('漢🙂')).toMatch(/unsupported/);
    expect(addedTextError('A'.repeat(501))).toMatch(/500/);
    expect(addedTextError('hidden\u200b')).toMatch(/unsupported/);
  });
  it('finds keyboard placement outside live widgets on rotated and cropped pages', async () => {
    const info = await inspectLocalPdf(await employmentEditingFixture());
    const point = defaultMarkPoint(
      { ...mark, width: 240, height: 40 },
      2,
      info,
    );
    expect(point).not.toBeNull();
    expect(
      overlapsPdfFormField(
        { ...mark, ...point!, page: 2, width: 240, height: 40 },
        info,
      ),
    ).toBe(false);
    expect(defaultMarkPoint({ ...mark, width: 3000 }, 0, info)).toBeNull();
  });
  it('only produces an explicitly selected valid date', () => {
    expect(dateText('', 'long')).toBe('');
    expect(dateText('2026-02-29', 'long')).toBe('');
    expect(dateText('2028-02-29', 'long')).toBe('29 Feb 2028');
    expect(dateText('2026-10-21', 'iso')).toBe('2026-10-21');
  });
});
describe('live AcroForm editing in the existing engine', () => {
  it('exports supported values, repeated widgets and read-only state without flattening', async () => {
    const original = await employmentEditingFixture(),
      info = await inspectLocalPdf(original);
    expect(info.fields.map((field) => field.control)).toEqual(
      expect.arrayContaining(['text', 'checkbox', 'radio', 'dropdown']),
    );
    expect(
      info.formWidgets?.filter(
        (widget) => widget.field === 'Onboarding contact',
      ),
    ).toHaveLength(2);
    const fields = {
      'Full name': 'María José Rivera',
      Available: true,
      'Preferred role': 'Trainee',
      'Work arrangement': 'Hybrid',
      'Onboarding contact': 'Alex',
    };
    const output = await exportLocalPdf(
      original,
      info,
      { fields, elements: [] },
      [],
      { preserveFields: true, editFields: true, requireFields: true },
    );
    const after = await inspectLocalPdf(output);
    for (const [name, value] of Object.entries(fields))
      expect(after.fields.find((field) => field.name === name)?.value).toBe(
        value,
      );
    expect(
      after.fields.find((field) => field.name === 'Document reference'),
    ).toMatchObject({ value: 'DEMO-2026', readOnly: true });
    expect(after.formWidgets).toEqual(info.formWidgets);
    const beforePdf = await pdfToolsLib.PDFDocument.load(original),
      afterPdf = await pdfToolsLib.PDFDocument.load(output);
    for (let index = 0; index < beforePdf.getPageCount(); index++) {
      const key = pdfToolsLib.PDFName.of('Contents');
      expect(afterPdf.getPage(index).node.lookup(key)?.toString()).toBe(
        beforePdf.getPage(index).node.lookup(key)?.toString(),
      );
    }
    const originalAP = beforePdf
      .getForm()
      .getTextField('Document reference')
      .acroField.getWidgets()[0]
      .getNormalAppearance();
    const outputAP = afterPdf
      .getForm()
      .getTextField('Document reference')
      .acroField.getWidgets()[0]
      .getNormalAppearance();
    expect(outputAP?.toString()).toBe(originalAP?.toString());
  });
  it('preserves raw invalid values and rejects required, unknown, read-only, oversized and unsupported values', async () => {
    const original = await employmentEditingFixture(),
      info = await inspectLocalPdf(original);
    expect(pdfFieldsError(info, {}, true)).toMatch(/required/);
    for (const fields of [
      { 'Document reference': 'changed' },
      { unknown: 'x' },
      { 'Full name': '漢' },
      { 'Full name': 'A'.repeat(101) },
    ] as Record<string, string | boolean>[]) {
      expect(pdfFieldsError(info, fields)).not.toBe('');
      await expect(
        exportLocalPdf(original, info, { fields, elements: [] }, [], {
          preserveFields: true,
          editFields: true,
        }),
      ).rejects.toThrow();
    }
    await expect(
      exportLocalPdf(
        original,
        info,
        { ...emptyPdfEdits(), fields: { 'Full name': 'W'.repeat(90) } },
        [],
        { preserveFields: true, editFields: true },
      ),
    ).rejects.toThrow(/does not fit legibly/);
  });
  it('rejects multiline, editable and multiselect form structures explicitly', async () => {
    for (const kind of ['multiline', 'editable', 'multiselect']) {
      const pdf = await pdfToolsLib.PDFDocument.create(),
        page = pdf.addPage();
      if (kind === 'multiline') {
        const field = pdf.getForm().createTextField('Unsupported');
        field.enableMultiline();
        field.addToPage(page);
      } else {
        const field = pdf.getForm().createDropdown('Unsupported');
        field.addOptions(['A', 'B']);
        if (kind === 'editable') field.enableEditing();
        else field.enableMultiselect();
        field.addToPage(page);
      }
      await expect(inspectLocalPdf(await pdf.save())).rejects.toThrow(
        /unsupported/,
      );
    }
  });
});
