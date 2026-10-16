import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
export const pdfToolsLib =
  require('pdf-lib') as typeof import('../../apps/web/node_modules/pdf-lib');
export async function pdfToolsFixture() {
  const { PDFDocument, degrees } = pdfToolsLib;
  const pdf = await PDFDocument.create();
  const letter = pdf.addPage([612, 792]);
  letter.drawText('SYNTHETIC EMPLOYMENT FORM', { x: 35, y: 750, size: 18 });
  letter.drawText('Name', { x: 35, y: 690, size: 12 });
  letter.drawText('Available for work', { x: 65, y: 650, size: 12 });
  const form = pdf.getForm();
  form
    .createTextField('Full name')
    .addToPage(letter, { x: 100, y: 680, width: 240, height: 26 });
  form
    .createCheckBox('Available')
    .addToPage(letter, { x: 35, y: 647, width: 18, height: 18 });
  const role = form.createDropdown('Preferred role');
  role.addOptions(['Trainee', 'Assistant']);
  role.addToPage(letter, { x: 35, y: 590, width: 220, height: 25 });
  const radio = form.createRadioGroup('Work arrangement');
  radio.addOptionToPage('Onsite', letter, {
    x: 35,
    y: 550,
    width: 18,
    height: 18,
  });
  radio.addOptionToPage('Hybrid', letter, {
    x: 150,
    y: 550,
    width: 18,
    height: 18,
  });
  const a4 = pdf.addPage([595.28, 841.89]);
  a4.setCropBox(20, 30, 550, 780);
  a4.setRotation(degrees(90));
  a4.drawText('SYNTHETIC ROTATED PAGE', { x: 60, y: 750, size: 16 });
  const third = pdf.addPage([792, 612]);
  third.setRotation(degrees(180));
  third.drawText('SYNTHETIC LANDSCAPE PAGE', { x: 50, y: 550, size: 16 });
  const fourth = pdf.addPage([400, 600]);
  fourth.setRotation(degrees(270));
  fourth.drawText('SYNTHETIC 270 PAGE', { x: 40, y: 500, size: 14 });
  return Buffer.from(await pdf.save());
}
export async function imageOnlyPdfFixture() {
  const pdf = await pdfToolsLib.PDFDocument.create();
  const png = await pdf.embedPng(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  pdf
    .addPage([300, 400])
    .drawImage(png, { x: 10, y: 10, width: 280, height: 380 });
  return Buffer.from(await pdf.save());
}
