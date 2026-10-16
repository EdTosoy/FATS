// Loaded in a dedicated browser worker. No server, storage, network or DOM APIs.
import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFNumber,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  degrees,
} from 'pdf-lib';
import {
  PDF_TOOLS_LIMITS,
  viewToPdf,
  type PdfInfo,
  type PdfEdits,
  type PdfElement,
  type PdfPageInfo,
  type PdfFieldInfo,
} from './pdf-tools-model';

export class PdfToolsError extends Error {}
const unsupported = () =>
  new PdfToolsError(
    'This PDF uses unsupported forms, signatures, scripts or attachments. Use a plain, unsigned PDF with standard form fields.',
  );
async function load(bytes: Uint8Array) {
  try {
    const pdf = await PDFDocument.load(bytes.slice(), {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    pdf.getPageCount();
    return pdf;
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message))
      throw new PdfToolsError(
        'Password-protected or encrypted PDFs are not supported. Choose an unencrypted copy.',
      );
    throw new PdfToolsError(
      'This PDF is malformed or cannot be opened. Choose another PDF or export a new copy from its source.',
    );
  }
}
function pageInfo(page: ReturnType<PDFDocument['getPage']>): PdfPageInfo {
  const crop = page.getCropBox(),
    media = page.getMediaBox();
  const x = Math.max(crop.x, media.x),
    y = Math.max(crop.y, media.y);
  const width = Math.min(crop.x + crop.width, media.x + media.width) - x;
  const height = Math.min(crop.y + crop.height, media.y + media.height) - y;
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const unit = page.node.lookup(PDFName.of('UserUnit'));
  if (unit && (!(unit instanceof PDFNumber) || unit.asNumber() !== 1))
    throw unsupported();
  if (
    ![0, 90, 180, 270].includes(rotation) ||
    ![x, y, width, height].every(Number.isFinite) ||
    width < 72 ||
    height < 72 ||
    Math.max(width, height) > PDF_TOOLS_LIMITS.pageSide
  )
    throw new PdfToolsError(
      'This PDF has unsupported page dimensions. Use pages between 1 inch and 33 inches on each side.',
    );
  return {
    x,
    y,
    width,
    height,
    rotation,
    viewWidth: rotation % 180 ? height : width,
    viewHeight: rotation % 180 ? width : height,
  };
}
export async function inspectLocalPdf(bytes: Uint8Array): Promise<PdfInfo> {
  if (!bytes.length || bytes.length > PDF_TOOLS_LIMITS.bytes)
    throw new PdfToolsError('Choose a nonempty PDF no larger than 10 MiB.');
  const decoder = new TextDecoder('latin1');
  if (
    !/^%PDF-1\.[0-7]/.test(decoder.decode(bytes.subarray(0, 8))) ||
    !/%%EOF\s*$/.test(decoder.decode(bytes.subarray(-1024)))
  )
    throw new PdfToolsError(
      'Choose a complete PDF version 1.0–1.7. This file is unsupported or malformed.',
    );
  const pdf = await load(bytes);
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > PDF_TOOLS_LIMITS.pages)
    throw new PdfToolsError('Choose a PDF with 1–50 pages.');
  let visits = 0;
  const seen = new Set<unknown>(),
    forbidden = new Set([
      'JS',
      'JavaScript',
      'Launch',
      'EmbeddedFiles',
      'EmbeddedFile',
      'RichMedia',
      'XFA',
      'OpenAction',
      'AA',
      'Sig',
      'Perms',
    ]);
  function inspect(object: unknown) {
    if (++visits > 100000)
      throw new PdfToolsError(
        'This PDF is too complex for the local editor. Choose a simpler copy.',
      );
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFName && forbidden.has(object.decodeText()))
      throw unsupported();
    if (object instanceof PDFDict) {
      if (object.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
        const width = object.lookup(PDFName.of('Width'));
        const height = object.lookup(PDFName.of('Height'));
        if (
          !(width instanceof PDFNumber) ||
          !(height instanceof PDFNumber) ||
          width.asNumber() * height.asNumber() > PDF_TOOLS_LIMITS.pixels
        )
          throw new PdfToolsError(
            'This PDF contains an image larger than the browser rendering limit. Use a smaller image or a text-based PDF.',
          );
      }
      for (const [key, value] of object.entries()) {
        inspect(key);
        inspect(value);
      }
    }
    if (object instanceof PDFArray)
      for (const item of object.asArray()) inspect(item);
    if (typeof object === 'object' && 'dict' in object) inspect(object.dict);
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects())
    inspect(object);
  const pages = pdf.getPages();
  const fields = pdf.getForm().getFields();
  if (fields.length > PDF_TOOLS_LIMITS.fields)
    throw new PdfToolsError(
      'This PDF has too many form fields. Use a PDF with at most 150 fields.',
    );
  const names = new Set<string>();
  const result = fields.map((field): PdfFieldInfo => {
    const name = field.getName();
    if (!name || name.length > 200 || names.has(name)) throw unsupported();
    names.add(name);
    const fieldPages = pages.flatMap((page, i) =>
      field.acroField.getWidgets().some((widget) =>
        page.node
          .Annots()
          ?.asArray()
          .some((ref) => pdf.context.lookup(ref) === widget.dict),
      )
        ? [i]
        : [],
    );
    if (!fieldPages.length) throw unsupported();
    const base = { name, readOnly: field.isReadOnly(), pages: fieldPages };
    if (
      field instanceof PDFTextField &&
      !field.isMultiline() &&
      !field.isPassword() &&
      !field.isFileSelector()
    )
      return {
        ...base,
        kind: 'text',
        value: field.getText() ?? '',
        maxLength: Math.min(field.getMaxLength() ?? 500, 500),
      };
    if (field instanceof PDFCheckBox)
      return { ...base, kind: 'checkbox', value: field.isChecked() };
    if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
      if (
        field instanceof PDFDropdown &&
        (field.isMultiselect() || field.isEditable())
      )
        throw unsupported();
      const options = field.getOptions();
      if (options.length > 100 || options.some((value) => value.length > 200))
        throw unsupported();
      const selected = field.getSelected();
      return {
        ...base,
        kind: 'choice',
        value: Array.isArray(selected) ? (selected[0] ?? '') : (selected ?? ''),
        options,
      };
    }
    throw unsupported();
  });
  return { pages: pages.map(pageInfo), fields: result };
}
export type PdfOverlayImage = { element: PdfElement; png: Uint8Array };
export async function exportLocalPdf(
  original: Uint8Array,
  info: PdfInfo,
  edits: PdfEdits,
  images: PdfOverlayImage[],
): Promise<Uint8Array> {
  if (
    edits.elements.length > PDF_TOOLS_LIMITS.elements ||
    images.length > PDF_TOOLS_LIMITS.elements
  )
    throw new PdfToolsError('Use at most 100 added elements.');
  const pdf = await load(original),
    form = pdf.getForm();
  for (const spec of info.fields) {
    const value = Object.hasOwn(edits.fields, spec.name)
      ? edits.fields[spec.name]
      : undefined;
    if (value === undefined) continue;
    if (spec.readOnly) throw new PdfToolsError('This form field is read-only.');
    const field = form.getField(spec.name);
    if (
      field instanceof PDFTextField &&
      typeof value === 'string' &&
      value.length <= (spec.maxLength ?? 500)
    )
      field.setText(value);
    else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
      if (value) field.check();
      else field.uncheck();
    } else if (
      (field instanceof PDFDropdown || field instanceof PDFRadioGroup) &&
      typeof value === 'string'
    ) {
      if (!value) field.clear();
      else if (spec.options?.includes(value)) field.select(value);
      else throw unsupported();
    } else
      throw new PdfToolsError(
        'A form value is too long or unsupported. Check the form fields.',
      );
  }
  try {
    form.updateFieldAppearances();
    form.flatten({ updateFieldAppearances: false });
  } catch {
    throw new PdfToolsError(
      'These form values or appearances are unsupported. Standard fields support Western European text; use Add text for other characters, or choose a simpler PDF.',
    );
  }
  let imageBytes = 0;
  for (const { element, png } of images) {
    const page = info.pages[element.page];
    if (
      !page ||
      ![element.x, element.y, element.width, element.height].every(
        Number.isFinite,
      ) ||
      element.x < 0 ||
      element.y < 0 ||
      element.width <= 0 ||
      element.height <= 0 ||
      element.x + element.width > page.viewWidth + 0.01 ||
      element.y + element.height > page.viewHeight + 0.01
    )
      throw new PdfToolsError(
        'An added element is outside the page. Move it inside and retry.',
      );
    imageBytes += png.byteLength;
    if (imageBytes > 16 * 1024 * 1024)
      throw new PdfToolsError(
        'Added marks are too large. Remove some elements and retry.',
      );
    const image = await pdf.embedPng(png);
    const origin = viewToPdf(page, {
      x: element.x,
      y: element.y + element.height,
    });
    pdf.getPage(element.page).drawImage(image, {
      ...origin,
      width: element.width,
      height: element.height,
      rotate: degrees(page.rotation),
    });
  }
  const bytes = await pdf.save();
  if (bytes.length > PDF_TOOLS_LIMITS.outputBytes)
    throw new PdfToolsError(
      'The completed PDF exceeds the 30 MiB download limit. Remove some marks or use a smaller original.',
    );
  return bytes;
}
