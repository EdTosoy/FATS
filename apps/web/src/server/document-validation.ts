import { Worker } from 'node:worker_threads';
import { finishDocumentWorker, runDocumentWorker } from './document-worker';
import {
  MAX_DOCUMENT_BYTES,
  originalFilename,
  DocumentValidationError,
  type DocumentFormat,
} from '@fats/domain';

const invalid = () =>
  new DocumentValidationError(
    'This file is malformed or unsupported. Use an unencrypted PDF or a standard DOCX without macros or embedded files.',
  );
// PDF parsing runs with a time/memory limit. The worker never prints document content.
async function validatePdf(bytes: Uint8Array) {
  if (
    !/^%PDF-1\.[0-7]/.test(
      Buffer.from(bytes.subarray(0, 8)).toString('ascii'),
    ) ||
    !/%%EOF\s*$/.test(Buffer.from(bytes.subarray(-1024)).toString('latin1'))
  )
    throw invalid();
  const worker = new Worker(
    `
      const {parentPort, workerData} = require('node:worker_threads');
      const path = require('node:path');
      const nativeRequire = require('node:module').createRequire(path.join(workerData.moduleRoot, 'package.json'));
      const parserPath = nativeRequire.resolve('pdf-lib', {paths:[workerData.moduleRoot,path.join(workerData.moduleRoot,'apps/web')]});
      const {PDFDocument, PDFDict, PDFArray, PDFName} = nativeRequire(parserPath);
      (async () => {
        try {
          const pdf = await PDFDocument.load(workerData.bytes, {throwOnInvalidObject:true, updateMetadata:false});
          if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500) throw Error();
          let count=0;
          const seen=new Set();
          const forbidden = new Set(['JS','JavaScript','Launch','EmbeddedFiles','EmbeddedFile','RichMedia','XFA','OpenAction','AA']);
          function inspect(obj) {
            if (++count > 100000) throw Error();
            if (!obj || seen.has(obj)) return;
            seen.add(obj);
            if (obj instanceof PDFName && forbidden.has(obj.decodeText())) throw Error();
            if (obj instanceof PDFDict) for (const [key,value] of obj.entries()) { inspect(key); inspect(value); }
            if (obj instanceof PDFArray) for (const value of obj.asArray()) inspect(value);
            if (obj.dict) inspect(obj.dict);
          }
          for(const [,obj] of pdf.context.enumerateIndirectObjects()) inspect(obj);
          parentPort.postMessage(true);
        } catch { parentPort.postMessage(false); }
      })();`,
    {
      stdout: true,
      stderr: true,
      eval: true,
      workerData: { moduleRoot: process.cwd(), bytes },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    },
  );
  if (!(await finishDocumentWorker<boolean>(worker))) throw invalid();
}
export async function validateDocument(
  bytes: Uint8Array,
  filename: unknown,
): Promise<{ originalFilename: string; format: DocumentFormat }> {
  const name = originalFilename(filename);
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    throw new DocumentValidationError(
      'Choose a nonempty file of 10 MiB or less.',
    );
  const format = name.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : name.toLowerCase().endsWith('.docx')
      ? 'docx'
      : null;
  if (!format) throw new DocumentValidationError('Choose a PDF or DOCX file.');
  try {
    if (format === 'pdf') await validatePdf(bytes);
    else await runDocumentWorker(bytes, 'validate');
  } catch {
    throw invalid();
  }
  return { originalFilename: name, format };
}
