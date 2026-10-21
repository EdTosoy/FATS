import { deflateSync } from 'node:zlib';
import { organizationFixture } from './pdf-tools-organization-fixtures';
import { pdfToolsLib } from './pdf-tools-fixtures';

// Four opaque colored pixels, generated locally; no user document or image.
function syntheticPng() {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4),
      check = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk(
      'IDAT',
      deflateSync(
        Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0]),
      ),
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export async function mergeFixture(label: string, count = 2) {
  const { PDFDocument, StandardFonts, rgb } = pdfToolsLib;
  const pdf = await PDFDocument.load(
    await organizationFixture(Math.min(count, 5)),
  );
  while (pdf.getPageCount() < count) pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.CourierBold);
  const image = await pdf.embedPng(syntheticPng());
  pdf.setTitle(`Synthetic ${label}`);
  pdf.setAuthor(`Synthetic ${label} author`);
  pdf.getPages().forEach((page, index) => {
    page.drawText(`${label} SOURCE PAGE ${index + 1}`, {
      x: 80,
      y: 180,
      size: 16,
      font,
      color: rgb(0.05, 0.3, 0.5),
    });
    page.drawImage(image, { x: 80, y: 280, width: 64, height: 64 });
  });
  return Buffer.from(await pdf.save());
}
export function paddedMergeFixture(bytes: Buffer, size: number) {
  return Buffer.concat([
    bytes,
    Buffer.from('\n%'),
    Buffer.alloc(size - bytes.length - 9, 32),
    Buffer.from('\n%%EOF\n'),
  ]);
}
