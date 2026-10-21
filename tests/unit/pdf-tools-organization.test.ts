import { describe, it, expect } from 'vitest';
import {
  inspectLocalPdf,
  exportLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';
import {
  emptyPdfEdits,
  editHistory,
  stepHistory,
  type PdfElement,
  type PdfEdits,
} from '../../apps/web/src/lib/pdf-tools-model';
import {
  organizePages,
  organizedInfo,
  pagePlan,
  nativeMark,
} from '../../apps/web/src/lib/pdf-tools-organization';
import {
  organizationFixture,
  annotatedOrganizationFixture,
} from '../helpers/pdf-tools-organization-fixtures';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import { layoutPdfText } from '../../apps/web/src/lib/pdf-tools-editing';

const mark: PdfElement = {
  id: 'synthetic',
  page: 2,
  kind: 'text',
  text: 'Synthetic text',
  x: 50,
  y: 60,
  width: 140,
  height: 44,
  fontSize: 16,
};
describe('V2 page identity, transformations and shared history', () => {
  it('keeps immutable identities across repeated moves, restores removed edits and preserves mixed history', async () => {
    const info = await inspectLocalPdf(await organizationFixture());
    let history = {
      past: [],
      present: emptyPdfEdits(),
      future: [],
    } as import('../../apps/web/src/lib/pdf-tools-model').PdfHistory;
    history = editHistory(history, { ...history.present, elements: [mark] });
    const withMark = history.present;
    for (const to of [0, 4, 1, 3, 0])
      history = editHistory(
        history,
        organizePages(info, history.present, { kind: 'move', source: 2, to }),
      );
    const moved = history.present;
    expect(moved.elements).toEqual([mark]);
    expect(pagePlan(info, moved).map((page) => page.source)).toEqual([
      2, 0, 1, 3, 4,
    ]);
    expect(organizePages(info, moved, { kind: 'move', source: 2, to: 0 })).toBe(
      moved,
    );
    history = editHistory(
      history,
      organizePages(info, history.present, {
        kind: 'rotate',
        source: 2,
        clockwise: true,
      }),
    );
    const rotated = history.present;
    const page = info.pages[2];
    expect(rotated.elements[0]).toMatchObject({
      page: 2,
      x: page.viewHeight - 60 - 44,
      y: 50,
      width: 44,
      height: 140,
      contentRotation: 90,
    });
    expect(nativeMark(rotated.elements[0])).toMatchObject({
      width: 140,
      height: 44,
    });
    expect(layoutPdfText(rotated.elements[0], (s) => s.length * 8).error).toBe(
      '',
    );
    history = editHistory(
      history,
      organizePages(info, rotated, { kind: 'remove', source: 2 }),
    );
    expect(history.present.elements).toEqual([]);
    expect(
      pagePlan(info, history.present).some((page) => page.source === 2),
    ).toBe(false);
    history = stepHistory(history, 'undo');
    expect(history.present).toEqual(rotated);
    history = stepHistory(history, 'undo');
    expect(history.present).toEqual(moved);
    history = stepHistory(history, 'redo');
    expect(history.present).toEqual(rotated);
    history = editHistory(history, { ...history.present, fields: {} });
    expect(history.future).toEqual([]);
    expect(withMark.elements).toEqual([mark]);
  });
  it('cycles all rotations exactly across cropped/mixed pages, including marks added after rotation', async () => {
    const info = await inspectLocalPdf(await organizationFixture());
    for (let source = 0; source < info.pages.length; source++) {
      for (const clockwise of [true, false]) {
        let edits = {
          ...emptyPdfEdits(),
          elements: [{ ...mark, page: source }],
        };
        for (let turn = 0; turn < 4; turn++)
          edits = organizePages(info, edits, {
            kind: 'rotate',
            source,
            clockwise,
          });
        expect(edits.elements[0]).toMatchObject({
          ...mark,
          page: source,
          contentRotation: 0,
        });
        expect(organizedInfo(info, edits).pages[source]).toEqual(
          info.pages[source],
        );
      }
    }
  });
  it('rejects the final removal, invalid plans, duplicate identities and inactive marks at export', async () => {
    const bytes = await organizationFixture(1),
      info = await inspectLocalPdf(bytes);
    expect(() =>
      organizePages(info, emptyPdfEdits(), { kind: 'remove', source: 0 }),
    ).toThrow('at least one');
    for (const pages of [
      [],
      [{ source: 0, rotation: 45 }],
      [{ source: -1, rotation: 0 }],
      [
        { source: 0, rotation: 0 },
        { source: 0, rotation: 0 },
      ],
    ])
      await expect(
        exportLocalPdf(bytes, info, { ...emptyPdfEdits(), pages }, [], {
          preserveFields: true,
        }),
      ).rejects.toThrow('arrangement');
    const multi = await organizationFixture(),
      multiInfo = await inspectLocalPdf(multi);
    await expect(
      exportLocalPdf(
        multi,
        multiInfo,
        { fields: {}, elements: [mark], pages: [{ source: 0, rotation: 0 }] },
        [],
        { preserveFields: true },
      ),
    ).rejects.toThrow('arrangement');
  });
});

describe('same-document PDF export compatibility', () => {
  it('rejects organization that would change a position-based print range, retaining independent export settings', async () => {
    const pdf = await pdfToolsLib.PDFDocument.load(
      await organizationFixture(2),
    );
    pdf.catalog
      .getOrCreateViewerPreferences()
      .setPrintPageRange({ start: 1, end: 1 });
    const original = await pdf.save();
    const info = await inspectLocalPdf(original);
    expect(info.organization?.blocked).toMatch(/print range/);
    for (const pages of [
      [
        { source: 1, rotation: 0 },
        { source: 0, rotation: 0 },
      ],
      [{ source: 0, rotation: 0 }],
    ])
      await expect(
        exportLocalPdf(original, info, { ...emptyPdfEdits(), pages }, [], {
          preserveFields: true,
        }),
      ).rejects.toThrow('print range');
    const output = await pdfToolsLib.PDFDocument.load(
      await exportLocalPdf(original, info, emptyPdfEdits(), [], {
        preserveFields: true,
      }),
    );
    expect(
      output.catalog.getOrCreateViewerPreferences().getPrintPageRange(),
    ).toEqual([{ start: 1, end: 1 }]);
    expect(output.getPageCount()).toBe(2);
  });
  it('reorders and rotates original objects, retaining crop/media boxes, content streams and metadata', async () => {
    const bytes = await organizationFixture(),
      snapshot = bytes.slice(),
      info = await inspectLocalPdf(bytes);
    let edits = organizePages(info, emptyPdfEdits(), {
      kind: 'move',
      source: 2,
      to: 0,
    });
    edits = organizePages(info, edits, {
      kind: 'rotate',
      source: 2,
      clockwise: true,
    });
    edits = organizePages(info, edits, { kind: 'remove', source: 3 });
    const before = await pdfToolsLib.PDFDocument.load(bytes),
      after = await pdfToolsLib.PDFDocument.load(
        await exportLocalPdf(bytes, info, edits, [], { preserveFields: true }),
      );
    expect(bytes).toEqual(snapshot);
    expect(after.getTitle()).toBe(before.getTitle());
    expect(after.getAuthor()).toBe(before.getAuthor());
    expect(after.getPages()).toHaveLength(4);
    const plan = pagePlan(info, edits);
    after.getPages().forEach((page, index) => {
      const original = before.getPage(plan[index].source);
      expect(page.ref.toString()).toBe(original.ref.toString());
      expect(page.getCropBox()).toEqual(original.getCropBox());
      expect(page.getMediaBox()).toEqual(original.getMediaBox());
      expect(page.node.Contents()?.toString()).toBe(
        original.node.Contents()?.toString(),
      );
      const streams = (
        doc: typeof before,
        content: ReturnType<typeof original.node.Contents>,
      ) => {
        const values =
          content instanceof pdfToolsLib.PDFArray
            ? content.asArray()
            : [content];
        return values.map((value) => {
          const stream = doc.context.lookup(value);
          expect(stream).toBeInstanceOf(pdfToolsLib.PDFRawStream);
          if (!(stream instanceof pdfToolsLib.PDFRawStream))
            throw new Error('Expected a page content stream.');
          return Array.from(stream.getContents());
        });
      };
      expect(streams(after, page.node.Contents())).toEqual(
        streams(before, original.node.Contents()),
      );
      expect(page.getRotation().angle).toBe(
        organizedInfo(info, edits).pages[plan[index].source].rotation,
      );
    });
  });
  it('pins inherited resources, boxes and rotation before moving pages out of nested page trees', async () => {
    const { PDFDocument, PDFName } = pdfToolsLib;
    const pdf = await PDFDocument.load(await organizationFixture(2));
    const page = pdf.getPage(0),
      parent = page.node.Parent()!;
    for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
      const name = PDFName.of(key),
        value = page.node.getInheritableAttribute(name);
      if (value) {
        parent.set(name, value);
        page.node.delete(name);
      }
    }
    const original = await pdf.save(),
      info = await inspectLocalPdf(original);
    const edits = organizePages(info, emptyPdfEdits(), {
      kind: 'move',
      source: 0,
      to: 1,
    });
    const after = await PDFDocument.load(
      await exportLocalPdf(original, info, edits, [], { preserveFields: true }),
    );
    expect(after.getPage(1).getMediaBox()).toEqual(page.getMediaBox());
    expect(after.getPage(1).node.Resources()?.toString()).toBe(
      page.node.Resources()?.toString(),
    );
  });
  it('retains live form values and every widget reference across reorder/rotation; refuses form-page removal', async () => {
    const bytes = await employmentEditingFixture(),
      info = await inspectLocalPdf(bytes);
    expect(info.organization?.blocked).toBeUndefined();
    let edits: PdfEdits = {
      ...emptyPdfEdits(),
      fields: {
        'Full name': 'Alex Synthetic',
        'Onboarding contact': 'Contact',
      },
    };
    edits = organizePages(info, edits, { kind: 'move', source: 2, to: 0 });
    edits = organizePages(info, edits, {
      kind: 'rotate',
      source: 2,
      clockwise: false,
    });
    const original = await pdfToolsLib.PDFDocument.load(bytes),
      output = await pdfToolsLib.PDFDocument.load(
        await exportLocalPdf(bytes, info, edits, [], {
          preserveFields: true,
          editFields: true,
          requireFields: true,
        }),
      );
    expect(output.getForm().getTextField('Full name').getText()).toBe(
      'Alex Synthetic',
    );
    expect(output.getForm().getTextField('Onboarding contact').getText()).toBe(
      'Contact',
    );
    for (const field of original.getForm().getFields()) {
      const actual = output.getForm().getField(field.getName());
      expect(actual.ref.toString()).toBe(field.ref.toString());
      expect(
        actual.acroField
          .getWidgets()
          .map((w) => w.dict.get(pdfToolsLib.PDFName.of('P'))?.toString()),
      ).toEqual(
        field.acroField
          .getWidgets()
          .map((w) => w.dict.get(pdfToolsLib.PDFName.of('P'))?.toString()),
      );
    }
    expect(() =>
      organizePages(info, edits, { kind: 'remove', source: 0 }),
    ).toThrow('interactive form');
    await expect(
      exportLocalPdf(
        bytes,
        info,
        { ...edits, pages: edits.pages!.slice(0, -1) },
        [],
        { preserveFields: true },
      ),
    ).rejects.toThrow('interactive form');
  });
  it('refuses unsupported annotation/page-dependent operations without blocking independent additive editing', async () => {
    for (const kind of [
      'link',
      'unknown',
      'tagged',
      'outline',
      'labels',
      'noRotate',
      'orphan',
    ] as const) {
      const original = await annotatedOrganizationFixture(kind),
        info = await inspectLocalPdf(original);
      expect(info.organization?.blocked, kind).toMatch(/unavailable/);
      if (kind === 'noRotate')
        expect(info.organization?.blocked).toMatch(/rotation or zoom/);
      for (const operation of [
        { kind: 'move', source: 0, to: 1 },
        { kind: 'rotate', source: 0, clockwise: true },
        { kind: 'remove', source: 0 },
      ] as const)
        expect(
          () => organizePages(info, emptyPdfEdits(), operation),
          kind,
        ).toThrow('unavailable');
      await expect(
        exportLocalPdf(original, info, emptyPdfEdits(), [], {
          preserveFields: true,
        }),
      ).resolves.toBeInstanceOf(Uint8Array);
    }
  });
});
