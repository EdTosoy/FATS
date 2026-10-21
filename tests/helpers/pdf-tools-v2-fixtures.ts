import { pdfToolsLib, pdfToolsFixture } from './pdf-tools-fixtures';

export async function pdfWorkspaceFixture(single = false) {
  const { PDFDocument, StandardFonts, rgb } = pdfToolsLib;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const page = pdf.addPage([612, 792]);
  const ink = rgb(0.09, 0.17, 0.27),
    muted = rgb(0.34, 0.42, 0.5);
  const line = (y: number) =>
    page.drawLine({
      start: { x: 50, y },
      end: { x: 562, y },
      thickness: 0.6,
      color: rgb(0.82, 0.87, 0.9),
    });
  const text = (value: string, x: number, y: number, size = 11) =>
    page.drawText(value, { x, y, size, font: regular, color: ink });
  page.drawText('harborlight', {
    x: 50,
    y: 734,
    size: 22,
    font: bold,
    color: ink,
  });
  page.drawText('LABS / FICTIONAL COMPANY', {
    x: 50,
    y: 716,
    size: 8,
    font: regular,
    color: muted,
  });
  text('SYNTHETIC DEMO', 455, 738, 8);
  line(690);
  text('YOUR NEXT CHAPTER', 50, 658, 8);
  page.drawText('A place to begin.', {
    x: 50,
    y: 620,
    size: 29,
    font: serif,
    color: ink,
  });
  text('Employment offer / Junior Data Analyst', 50, 595, 11);
  text('20 October 2026', 50, 550);
  text('Dear Alex Rivera,', 50, 515);
  text('We are delighted to invite you to join Harborlight Labs.', 50, 480);
  text(
    'Bring your curiosity and help us turn questions into useful work.',
    50,
    461,
  );
  line(430);
  text('YOUR ROLE', 50, 406, 8);
  text('WORK ARRANGEMENT', 330, 406, 8);
  text('Junior Data Analyst', 50, 384);
  text('Hybrid / Manila', 330, 384);
  text('PROPOSED START', 50, 349, 8);
  text('DOCUMENT STATUS', 330, 349, 8);
  text('02 November 2026', 50, 327);
  text('Fictional - for testing only', 330, 327);
  line(304);
  text('This synthetic offer creates no employment relationship.', 50, 275);
  text(
    'Review every page. Signing and download are not part of Phase 1.',
    50,
    252,
  );
  text('Full name (existing PDF form field)', 50, 211, 9);
  const field = pdf.getForm().createTextField('Synthetic full name');
  field.setText('Alex Rivera');
  field.addToPage(page, {
    x: 50,
    y: 174,
    width: 260,
    height: 26,
    font: regular,
    borderWidth: 0.5,
  });
  text('Signature', 50, 116, 8);
  text('Date', 370, 116, 8);
  page.drawLine({
    start: { x: 50, y: 132 },
    end: { x: 310, y: 132 },
    thickness: 0.6,
    color: muted,
  });
  page.drawLine({
    start: { x: 370, y: 132 },
    end: { x: 562, y: 132 },
    thickness: 0.6,
    color: muted,
  });
  line(58);
  text('SYNTHETIC DOCUMENT / NO PERSONAL DATA', 50, 42, 7);
  if (!single) {
    const mixed = await PDFDocument.load(await pdfToolsFixture());
    const copies = await pdf.copyPages(mixed, [1, 2, 3]);
    for (const copy of copies) {
      pdf.addPage(copy);
      // Known PDF-space landmark, used to verify the actual rendered inverse.
      copy.drawRectangle({
        x: 120,
        y: 140,
        width: 12,
        height: 12,
        color: rgb(0.8, 0.1, 0.4),
      });
    }
  }
  return Buffer.from(await pdf.save());
}

export async function rejectedWorkspaceFixture(
  kind: 'encrypted' | 'active' | 'pages' | 'dimensions',
) {
  const { PDFDocument, PDFName } = pdfToolsLib;
  const pdf = await PDFDocument.create();
  pdf.addPage(kind === 'dimensions' ? [3000, 300] : [300, 400]);
  if (kind === 'pages') for (let i = 0; i < 50; i++) pdf.addPage();
  if (kind === 'encrypted')
    pdf.context.trailerInfo.Encrypt = pdf.context.register(
      pdf.context.obj({ Filter: 'Standard' }),
    );
  if (kind === 'active')
    pdf.catalog.set(
      PDFName.of('OpenAction'),
      pdf.context.obj({ S: 'JavaScript', JS: 'synthetic fixture' }),
    );
  return Buffer.from(await pdf.save());
}
