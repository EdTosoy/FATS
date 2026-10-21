import { pdfToolsFixture, pdfToolsLib } from './pdf-tools-fixtures';

export async function employmentEditingFixture() {
  const { PDFDocument, StandardFonts, rgb } = pdfToolsLib;
  const pdf = await PDFDocument.load(await pdfToolsFixture());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const offer = pdf.insertPage(0, [612, 792]);
  offer.drawText('HARBORLIGHT / SYNTHETIC OFFER', {
    x: 50,
    y: 735,
    size: 18,
    font: bold,
    color: rgb(0.09, 0.17, 0.27),
  });
  offer.drawText('Employment offer — Junior Data Analyst', {
    x: 50,
    y: 695,
    size: 14,
    font,
  });
  offer.drawText('Fictional graduate employment document. No personal data.', {
    x: 50,
    y: 660,
    size: 11,
    font,
  });
  offer.drawText('Acceptance notes', { x: 50, y: 610, size: 11, font });
  offer.drawText('Initials                                      Date', {
    x: 50,
    y: 160,
    size: 11,
    font,
  });
  offer.drawText('SYNTHETIC / NO LEGAL EFFECT', {
    x: 50,
    y: 40,
    size: 8,
    font,
  });
  const form = pdf.getForm();
  form.getTextField('Full name').enableRequired();
  form.getTextField('Full name').setMaxLength(100);
  const reference = form.createTextField('Document reference');
  reference.setText('DEMO-2026');
  reference.enableReadOnly();
  reference.addToPage(pdf.getPage(1), {
    x: 350,
    y: 730,
    width: 200,
    height: 24,
  });
  const repeated = form.createTextField('Onboarding contact');
  repeated.addToPage(pdf.getPage(1), { x: 35, y: 480, width: 260, height: 26 });
  repeated.addToPage(pdf.getPage(2), { x: 90, y: 450, width: 260, height: 26 });
  return Buffer.from(await pdf.save());
}
