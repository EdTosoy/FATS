import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { PDFDocument } =
  require('pdf-lib') as typeof import('../../apps/web/node_modules/pdf-lib');
const { zipSync, strToU8 } =
  require('fflate') as typeof import('../../apps/web/node_modules/fflate');
export async function pdfFixture(text = 'Synthetic resume') {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]).drawText(text, { x: 24, y: 350, size: 12 });
  return Buffer.from(await pdf.save());
}
export function docxFixture(extra: Record<string, string> = {}) {
  const entries = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic cover letter</w:t></w:r></w:p></w:body></w:document>',
    ...extra,
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([key, value]) => [key, strToU8(value)]),
      ),
    ),
  );
}
export async function activePdfFixture() {
  const { PDFName, PDFString } =
    require('pdf-lib') as typeof import('../../apps/web/node_modules/pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.catalog.set(
    PDFName.of('OpenAction'),
    pdf.context.obj({
      S: PDFName.of('JavaScript'),
      JS: PDFString.of('synthetic active action'),
    }),
  );
  return Buffer.from(await pdf.save());
}
