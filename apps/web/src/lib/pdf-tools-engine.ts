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
  PDFRef,
  PDFObjectCopier,
  degrees,
  StandardFonts,
} from 'pdf-lib';
import {
  PDF_TOOLS_LIMITS,
  viewToPdf,
  overlapsPdfFormField,
  PDF_FORM_OVERLAP_ERROR,
  pdfFieldsError,
  type PdfInfo,
  type PdfEdits,
  type PdfElement,
  type PdfPageInfo,
  type PdfFieldInfo,
} from './pdf-tools-model';
import {
  organizedInfo,
  pagePlan,
  pagePlanError,
} from './pdf-tools-organization';
import {
  PDF_FORM_OUTPUT_ERROR,
  pageOutputError,
} from './pdf-tools-page-outputs';
import {
  mergePlanError,
  mergeResourceError,
  mergeSourceError,
  pdfFingerprint,
  type PdfMergeInput,
  type PdfMergeSource,
} from './pdf-tools-merge';

// These catalog entries can be copied unchanged. Other catalog structures need
// explicit reconciliation before pages can belong to independent documents.
const outputCatalogKeys = [
  'Metadata',
  'Lang',
  'ViewerPreferences',
  'PageLayout',
  'PageMode',
  'OutputIntents',
  'Version',
];
function independentCopyError(pdf: PDFDocument): string {
  const unsupportedCopy =
    'Extract and Split cannot safely preserve this PDF’s document structures or cross-page references. Use its source application to create separate PDFs. Your document stays editable here.';
  const allowed = new Set(['Type', 'Pages', 'AcroForm', ...outputCatalogKeys]);
  if (pdf.catalog.keys().some((key) => !allowed.has(key.decodeText())))
    return unsupportedCopy;
  const pending: unknown[] = [pdf.context.trailerInfo.Info];
  for (const key of outputCatalogKeys)
    pending.push(pdf.catalog.get(PDFName.of(key)));
  for (const page of pdf.getPages()) {
    for (const [key, value] of page.node.entries())
      if (key !== PDFName.of('Parent')) pending.push(value);
    for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate'])
      pending.push(page.node.getInheritableAttribute(PDFName.of(key)));
  }
  const seen = new Set<unknown>();
  let visits = 0;
  while (pending.length) {
    if (++visits > 100000) return unsupportedCopy;
    const object = pending.pop();
    if (!object || seen.has(object)) continue;
    seen.add(object);
    if (object instanceof PDFRef) {
      const target = pdf.context.lookup(object);
      if (!target) return unsupportedCopy;
      pending.push(target);
    } else if (object instanceof PDFDict) {
      const type = object.lookup(PDFName.of('Type'));
      if (
        ['Page', 'Pages', 'Catalog'].some((name) => type === PDFName.of(name))
      )
        return unsupportedCopy;
      pending.push(...object.values());
    } else if (object instanceof PDFArray) pending.push(...object.asArray());
    else if (typeof object === 'object' && 'dict' in object)
      pending.push(object.dict);
  }
  return '';
}

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
      'ByteRange',
      'DocMDP',
      'FieldMDP',
      'DocTimeStamp',
    ]);
  const organizationKeys = new Set([
    'StructTreeRoot',
    'StructParents',
    'Outlines',
    'PageLabels',
    // Positional print presets would target different/missing pages after a
    // move/removal. Preserve the preset and refuse organization rather than
    // silently clearing it or guessing which pages should be printed.
    'PrintPageRange',
    'Dests',
    'Names',
    'Threads',
    'B',
    'PieceInfo',
    'Collection',
    'CO',
    'Dest',
    'A',
  ]);
  let pageDependent = false;
  let externalMergeReference = false;
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
      if (
        object.get(PDFName.of('Type')) === PDFName.of('Filespec') ||
        (object.get(PDFName.of('Subtype')) === PDFName.of('Form') &&
          object.has(PDFName.of('Ref')))
      )
        externalMergeReference = true;
      if (object.keys().some((key) => organizationKeys.has(key.decodeText())))
        pageDependent = true;
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
    if (typeof object === 'object' && 'dict' in object) {
      if (object.dict instanceof PDFDict && object.dict.has(PDFName.of('F')))
        externalMergeReference = true;
      inspect(object.dict);
    }
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
  const formWidgets: NonNullable<PdfInfo['formWidgets']> = [];
  const result = fields.map((field): PdfFieldInfo => {
    const name = field.getName();
    if (!name || name.length > 200 || names.has(name)) throw unsupported();
    names.add(name);
    const allWidgets = field.acroField.getWidgets();
    const fieldPages = pages.flatMap((page, i) => {
      const widgets = allWidgets.filter((widget) =>
        page.node
          .Annots()
          ?.asArray()
          .some((ref) => pdf.context.lookup(ref) === widget.dict),
      );
      for (const widget of widgets) {
        const rect = widget.getRectangle();
        if (
          !Object.values(rect).every(Number.isFinite) ||
          rect.width <= 0 ||
          rect.height <= 0
        )
          throw unsupported();
        formWidgets.push({
          page: i,
          field: name,
          ...(field instanceof PDFRadioGroup
            ? { option: field.getOptions()[allWidgets.indexOf(widget)] }
            : {}),
          ...rect,
        });
      }
      return widgets.length ? [i] : [];
    });
    if (!fieldPages.length) throw unsupported();
    const base = {
      name,
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
      pages: fieldPages,
    };
    if (
      field instanceof PDFTextField &&
      !field.isMultiline() &&
      !field.isPassword() &&
      !field.isFileSelector()
    )
      return {
        ...base,
        kind: 'text',
        control: 'text',
        value: field.getText() ?? '',
        maxLength: Math.min(field.getMaxLength() ?? 500, 500),
      };
    if (field instanceof PDFCheckBox)
      return {
        ...base,
        kind: 'checkbox',
        control: 'checkbox',
        value: field.isChecked(),
      };
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
        control: field instanceof PDFRadioGroup ? 'radio' : 'dropdown',
        value: Array.isArray(selected) ? (selected[0] ?? '') : (selected ?? ''),
        options,
      };
    }
    throw unsupported();
  });
  // Organization has a narrower compatibility boundary than additive editing.
  // Unknown annotations and page-dependent structures stay intact in the source;
  // we refuse to rearrange them rather than attempting lossy reconstruction.
  let blocked = pageDependent
    ? 'Page organization is unavailable for this PDF because it contains bookmarks, links, tags, default print ranges or other page-dependent structures. Its content is kept; use its source application to organize pages.'
    : '';
  const knownWidgets = fields.flatMap((field) => field.acroField.getWidgets());
  const usedWidgets = new Set<PDFDict>();
  for (const page of pages) {
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const annotation = pdf.context.lookup(ref);
      const widget = knownWidgets.find((widget) => widget.dict === annotation);
      if (
        !(annotation instanceof PDFDict) ||
        !widget ||
        usedWidgets.has(annotation) ||
        annotation.get(PDFName.of('Subtype')) !== PDFName.of('Widget') ||
        (widget.P() && widget.P() !== page.ref)
      ) {
        blocked =
          'Page organization is unavailable for this PDF because it contains unsupported annotations or widget references. Its content is kept; use its source application to organize pages.';
        continue;
      }
      usedWidgets.add(annotation);
      const flags = annotation.lookup(PDFName.of('F'));
      if (
        (flags && !(flags instanceof PDFNumber)) ||
        (flags instanceof PDFNumber && flags.asNumber() & 24)
      )
        blocked =
          'Page organization is unavailable for this PDF because an annotation has special rotation or zoom behavior. Its content is kept; use its source application to organize pages.';
    }
  }
  if (usedWidgets.size !== knownWidgets.length)
    blocked =
      'Page organization is unavailable for this PDF because some form widgets cannot be safely associated with one page. Its content is kept; use its source application to organize pages.';
  const outputBlocked =
    blocked ||
    (fields.length ? PDF_FORM_OUTPUT_ERROR : independentCopyError(pdf));
  return {
    pages: pages.map(pageInfo),
    fields: result,
    formWidgets,
    organization: {
      ...(blocked ? { blocked } : {}),
      ...(outputBlocked ? { outputBlocked } : {}),
      ...(externalMergeReference
        ? {
            mergeBlocked:
              'This PDF references another file or external page content. Create a self-contained copy in its source application before merging.',
          }
        : pdf.catalog.has(PDFName.of('OutputIntents')) ||
            pdf.catalog.has(PDFName.of('Version'))
          ? {
              mergeBlocked:
                'This PDF has document-wide color settings or a version override that cannot be safely combined. Export a plain PDF 1.7 copy in its source application.',
            }
          : {}),
      ...(fields.length
        ? {
            removalBlocked:
              'Pages cannot be removed from a PDF with interactive form fields in this version. Reorder or rotate them, or use the source application to remove pages without losing field data.',
          }
        : {}),
    },
  };
}
export type PdfOverlayImage = { element: PdfElement; png: Uint8Array };
export async function exportLocalPdf(
  original: Uint8Array,
  info: PdfInfo,
  edits: PdfEdits,
  images: PdfOverlayImage[],
  options: {
    preserveFields?: boolean;
    editFields?: boolean;
    requireFields?: boolean;
    independent?: boolean;
  } = {},
): Promise<Uint8Array> {
  if (options.independent) {
    const error = pageOutputError(info);
    if (error) throw new PdfToolsError(error);
  }
  const arrangementError = pagePlanError(info, edits);
  if (arrangementError) throw new PdfToolsError(arrangementError);
  const geometryInfo = organizedInfo(info, edits);
  if (
    options.independent &&
    (images.length !== edits.elements.length ||
      images.some(
        ({ element }, index) =>
          JSON.stringify(element) !== JSON.stringify(edits.elements[index]),
      ))
  )
    throw new PdfToolsError(
      'Extract and Split could not preserve every added mark. Retry preparing the copy; your edits are unchanged.',
    );
  if (
    edits.elements.length > PDF_TOOLS_LIMITS.elements ||
    images.length > PDF_TOOLS_LIMITS.elements
  )
    throw new PdfToolsError('Use at most 100 added elements.');
  const pdf = await load(original),
    form = pdf.getForm();
  const sourcePages = pdf.getPages();
  for (const { source } of pagePlan(info, edits))
    sourcePages[source].setRotation(
      degrees(geometryInfo.pages[source].rotation),
    );
  if (options.editFields || options.requireFields) {
    const error = pdfFieldsError(info, edits.fields, options.requireFields);
    if (error) throw new PdfToolsError(error);
  }
  const changedFields = [];
  for (const spec of info.fields) {
    const value = Object.hasOwn(edits.fields, spec.name)
      ? edits.fields[spec.name]
      : undefined;
    if (value === undefined) continue;
    if (options.editFields && value === spec.value) continue;
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
    changedFields.push(field);
  }
  if (
    options.preserveFields &&
    !options.editFields &&
    Object.keys(edits.fields).length
  )
    throw new PdfToolsError('Quick Sign cannot change existing form values.');
  try {
    if (!options.preserveFields) {
      form.updateFieldAppearances();
      form.flatten({ updateFieldAppearances: false });
    } else if (options.editFields && changedFields.length) {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const field of changedFields) {
        if (field instanceof PDFTextField || field instanceof PDFDropdown) {
          const value =
            field instanceof PDFTextField
              ? (field.getText() ?? '')
              : (field.getSelected()[0] ?? '');
          const widgets = field.acroField.getWidgets();
          const width = Math.min(
            ...widgets.map((widget) => widget.getRectangle().width - 8),
          );
          const height = Math.min(
            ...widgets.map((widget) => widget.getRectangle().height - 6),
          );
          const size = Math.min(
            12,
            height,
            value ? width / font.widthOfTextAtSize(value, 1) : 12,
          );
          if (size < 8)
            throw new PdfToolsError(
              'A form value does not fit legibly in its field. Shorten it, or use a larger added text box. Your value has been kept.',
            );
          field.setFontSize(size);
          field.updateAppearances(font);
        } else if (
          field instanceof PDFCheckBox ||
          field instanceof PDFRadioGroup
        )
          field.updateAppearances();
      }
    }
  } catch (error) {
    if (error instanceof PdfToolsError) throw error;
    throw new PdfToolsError(
      'These form values or appearances are unsupported. Standard fields support Western European text; use Add text for other characters, or choose a simpler PDF.',
    );
  }
  let imageBytes = 0;
  for (const { element, png } of images) {
    const page = geometryInfo.pages[element.page];
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
    // Live widget appearances paint above page content in independent viewers.
    // The legacy editor flattens fields; signature-only exports preserve them.
    if (options.preserveFields && overlapsPdfFormField(element, geometryInfo))
      throw new PdfToolsError(PDF_FORM_OVERLAP_ERROR);
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
  if (edits.pages) {
    // Same document, same leaf/widget references, no copyPages and no flattening.
    // Pin inherited attributes before detaching leaves from their original tree.
    for (const page of sourcePages) {
      for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
        const name = PDFName.of(key);
        const value = page.node.getInheritableAttribute(name);
        if (value) page.node.set(name, value);
      }
    }
    for (let index = sourcePages.length - 1; index >= 0; index--)
      pdf.removePage(index);
    for (const { source } of edits.pages) pdf.addPage(sourcePages[source]);
  }
  let output = pdf;
  if (options.independent) {
    // Extend the existing writer: the reviewed selected pages already contain
    // the same rotations/marks as a normal export. Copy only their graph into
    // a fresh context, instead of serializing detached, unselected page objects.
    output = await PDFDocument.create({ updateMetadata: false });
    for (const page of await output.copyPages(pdf, pdf.getPageIndices()))
      output.addPage(page);
    const copier = PDFObjectCopier.for(pdf.context, output.context);
    const infoRef = pdf.context.trailerInfo.Info;
    if (infoRef) output.context.trailerInfo.Info = copier.copy(infoRef);
    for (const key of outputCatalogKeys) {
      const name = PDFName.of(key),
        value = pdf.catalog.get(name);
      if (value) output.catalog.set(name, copier.copy(value));
    }
  }
  const bytes = await output.save({
    updateFieldAppearances: !options.preserveFields,
  });
  if (bytes.length > PDF_TOOLS_LIMITS.outputBytes)
    throw new PdfToolsError(
      'The completed PDF exceeds the 30 MiB download limit. Remove some marks or use a smaller original.',
    );
  return bytes;
}

export async function mergeLocalPdfs(
  input: PdfMergeInput,
): Promise<{ bytes: Uint8Array; info: PdfInfo }> {
  const initialError = mergeResourceError(
    input.sources.map((source) => ({
      size: source.bytes.length,
      info: { pages: [], fields: [] },
    })),
  );
  if (initialError) throw new PdfToolsError(initialError);
  const sources: PdfMergeSource[] = [];
  const output = await PDFDocument.create({ updateMetadata: false });
  const copied = new Map<
    string,
    Awaited<ReturnType<PDFDocument['copyPages']>>[number]
  >();
  for (const source of input.sources) {
    try {
      const info = await inspectLocalPdf(source.bytes);
      const blocked = mergeSourceError(info);
      if (blocked) throw new PdfToolsError(blocked);
      const fingerprint = await pdfFingerprint(source.bytes);
      if (sources.some((previous) => previous.fingerprint === fingerprint))
        throw new PdfToolsError(
          'This exact PDF is already in the merge. Choose a different file.',
        );
      sources.push({
        id: source.id,
        name: source.name,
        size: source.bytes.length,
        fingerprint,
        info,
      });
      const error = mergeResourceError(sources);
      if (error) throw new PdfToolsError(error);
    } catch (error) {
      throw new PdfToolsError(
        `${source.name.slice(0, 120)}: ${error instanceof PdfToolsError ? error.message : 'This PDF could not be safely inspected. Choose a simpler, complete file.'}`,
      );
    }
  }
  const planError = mergePlanError(sources, input.plan);
  if (planError) throw new PdfToolsError(planError);
  // One copier per donor preserves shared fonts/images within that donor. Never
  // copy a form/catalog tree or reuse source indices across document identities.
  for (const source of input.sources) {
    const chosen = input.plan.pages.filter(
      (page) => page.document === source.id,
    );
    if (!chosen.length) continue;
    const pdf = await load(source.bytes);
    const pages = await output.copyPages(
      pdf,
      chosen.map((page) => page.page),
    );
    chosen.forEach((page, index) =>
      copied.set(`${page.document}:${page.page}`, pages[index]),
    );
  }
  for (const page of input.plan.pages)
    output.addPage(copied.get(`${page.document}:${page.page}`)!);
  // A combined document gets new neutral metadata, rather than falsely claiming
  // one donor's author, language, title, XMP conformance or print configuration.
  output.setTitle('Combined PDF');
  output.setCreator('FATS PDF Tools (local)');
  const bytes = await output.save({ updateFieldAppearances: false });
  if (bytes.length > PDF_TOOLS_LIMITS.outputBytes)
    throw new PdfToolsError(
      'The combined PDF exceeds the 30 MiB output limit. Remove pages or use smaller files.',
    );
  return {
    bytes,
    info: {
      pages: input.plan.pages.map(
        (page) =>
          sources.find((source) => source.id === page.document)!.info.pages[
            page.page
          ],
      ),
      fields: [],
      formWidgets: [],
    },
  };
}
