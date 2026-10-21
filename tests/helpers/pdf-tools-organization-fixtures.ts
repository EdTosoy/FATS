import { employmentEditingFixture } from './pdf-tools-editing-fixtures';
import { pdfToolsLib } from './pdf-tools-fixtures';

export async function organizationFixture(count = 5, forms = false) {
  const { PDFDocument, StandardFonts, rgb } = pdfToolsLib;
  const pdf = await PDFDocument.load(await employmentEditingFixture());
  // Fixture generation only: production V2 never flattens interactive fields.
  if (!forms) {
    pdf.getForm().flatten();
    // pdf-lib's fixture flatten can leave repeated-widget annotation entries;
    // this deliberately static fixture contains page artwork only.
    for (const page of pdf.getPages())
      page.node.delete(pdfToolsLib.PDFName.of('Annots'));
  }
  while (pdf.getPageCount() > count) pdf.removePage(pdf.getPageCount() - 1);
  const font = await pdf.embedFont(StandardFonts.CourierBold);
  pdf.setTitle('Synthetic page organization');
  pdf.setAuthor('FATS synthetic fixtures');
  pdf.getPages().forEach((page, index) => {
    page.drawText(`ORIGINAL PAGE ${index + 1}`, {
      x: 80,
      y: 100,
      size: 18,
      font,
      color: rgb(0.1, 0.3, 0.5),
    });
    // Existing visual signature as native page artwork, no cryptographic claim.
    if (index === 0) {
      page.drawLine({
        start: { x: 60, y: 230 },
        end: { x: 130, y: 255 },
        thickness: 2,
      });
      page.drawLine({
        start: { x: 130, y: 255 },
        end: { x: 100, y: 220 },
        thickness: 2,
      });
    }
  });
  return Buffer.from(await pdf.save());
}

export async function annotatedOrganizationFixture(
  kind:
    | 'link'
    | 'unknown'
    | 'tagged'
    | 'outline'
    | 'labels'
    | 'printRange'
    | 'noRotate'
    | 'orphan',
) {
  const { PDFDocument, PDFName } = pdfToolsLib;
  const pdf = await PDFDocument.load(
    await organizationFixture(
      kind === 'noRotate' || kind === 'orphan' ? 5 : 2,
      kind === 'noRotate' || kind === 'orphan',
    ),
  );
  const page = pdf.getPage(0);
  if (kind === 'link' || kind === 'unknown') {
    const ref = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: kind === 'link' ? 'Link' : 'Text',
        Rect: [20, 20, 100, 40],
        ...(kind === 'link'
          ? { Dest: [pdf.getPage(1).ref, PDFName.of('Fit')] }
          : {}),
      }),
    );
    page.node.addAnnot(ref);
  } else if (kind === 'noRotate') {
    const widget = pdf.getForm().getFields()[0].acroField.getWidgets()[0];
    widget.dict.set(PDFName.of('F'), pdf.context.obj(16));
  } else if (kind === 'orphan') {
    pdf
      .getForm()
      .getFields()[0]
      .acroField.getWidgets()[0]
      .dict.set(PDFName.of('P'), page.ref);
  } else if (kind === 'printRange') {
    pdf.catalog
      .getOrCreateViewerPreferences()
      .setPrintPageRange({ start: 1, end: 1 });
  } else {
    pdf.catalog.set(
      PDFName.of(
        kind === 'tagged'
          ? 'StructTreeRoot'
          : kind === 'outline'
            ? 'Outlines'
            : 'PageLabels',
      ),
      pdf.context.register(pdf.context.obj({})),
    );
  }
  return Buffer.from(await pdf.save());
}
