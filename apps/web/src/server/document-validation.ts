import { Worker } from 'node:worker_threads';
import { inflateRawSync, crc32 } from 'node:zlib';
import { SaxesParser } from 'saxes';
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
  await new Promise<void>((resolve, reject) => {
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
        eval: true,
        workerData: { moduleRoot: process.cwd(), bytes },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(invalid());
    }, 5000);
    worker.once('message', (valid) => {
      clearTimeout(timer);
      void worker.terminate();
      if (valid) resolve();
      else reject(invalid());
    });
    worker.once('error', () => {
      clearTimeout(timer);
      reject(invalid());
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(invalid());
    });
  });
}
const namespaces = {
  types: 'http://schemas.openxmlformats.org/package/2006/content-types',
  relationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
};
function xml(bytes: Uint8Array) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw invalid();
  const nodes: {
    local: string;
    uri: string;
    attributes: Record<string, string>;
  }[] = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', () => {
    throw invalid();
  });
  parser.on('opentag', (node) => {
    if (nodes.length > 100000) throw invalid();
    nodes.push({
      local: node.local,
      uri: node.uri,
      attributes: Object.fromEntries(
        Object.entries(node.attributes).map(([key, value]) => [
          key,
          value.value,
        ]),
      ),
    });
  });
  parser.write(text).close();
  return nodes;
}
// Deliberately supports classic ZIP/deflate only. Never extracts files to disk.
// Check directory sizes BEFORE inflating, bound actual output, and verify CRC.
function validateDocx(input: Uint8Array) {
  const bytes = Buffer.from(input);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  if (
    end < 0 ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)
  )
    throw invalid();
  const count = bytes.readUInt16LE(end + 10),
    directory = bytes.readUInt32LE(end + 16);
  if (!count || count > 500 || directory + bytes.readUInt32LE(end + 12) !== end)
    throw invalid();
  const entries = new Map<string, Buffer>();
  let cursor = directory,
    total = 0;
  const spans: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw invalid();
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      crc = bytes.readUInt32LE(cursor + 16),
      compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24),
      length = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32),
      offset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + length + extra + comment;
    if (
      next > end ||
      flags & ~0x808 ||
      ![0, 8].includes(method) ||
      size > 20 * 1024 * 1024 ||
      (total += size) > 40 * 1024 * 1024 ||
      bytes.readUInt16LE(cursor + 34)
    )
      throw invalid();
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + length),
    );
    if (
      !name ||
      /[\\\u0000-\u001f]/.test(name) ||
      name.startsWith('/') ||
      name.includes(':') ||
      name.split('/').some((part) => part === '..' || part === '.') ||
      entries.has(name) ||
      /vbaProject|embeddings\/|activeX\//i.test(name)
    )
      throw invalid();
    if (
      offset + 30 > directory ||
      bytes.readUInt32LE(offset) !== 0x04034b50 ||
      bytes.readUInt16LE(offset + 6) !== flags ||
      bytes.readUInt16LE(offset + 8) !== method ||
      bytes.readUInt16LE(offset + 26) !== length ||
      !bytes
        .subarray(offset + 30, offset + 30 + length)
        .equals(bytes.subarray(cursor + 46, cursor + 46 + length))
    )
      throw invalid();
    const start = offset + 30 + length + bytes.readUInt16LE(offset + 28),
      finish = start + compressed;
    if (finish > directory || spans.some(([a, b]) => offset < b && finish > a))
      throw invalid();
    spans.push([offset, finish]);
    const content =
      method === 0
        ? bytes.subarray(start, finish)
        : inflateRawSync(bytes.subarray(start, finish), {
            maxOutputLength: Math.max(1, size),
          });
    if (content.length !== size || crc32(content) !== crc) throw invalid();
    entries.set(name, content);
    cursor = next;
  }
  if (cursor !== end) throw invalid();
  for (const required of [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
  ])
    if (!entries.has(required)) throw invalid();
  const types = xml(entries.get('[Content_Types].xml')!);
  if (
    types[0]?.local !== 'Types' ||
    types[0]?.uri !== namespaces.types ||
    !types.some(
      (n) =>
        n.local === 'Override' &&
        n.attributes.PartName === '/word/document.xml' &&
        n.attributes.ContentType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    ) ||
    types.some((n) =>
      /macroEnabled|vba|oleObject|activeX/i.test(
        n.attributes.ContentType ?? '',
      ),
    )
  )
    throw invalid();
  const relationships = xml(entries.get('_rels/.rels')!);
  if (
    relationships[0]?.local !== 'Relationships' ||
    relationships[0]?.uri !== namespaces.relationships ||
    !relationships.some(
      (n) =>
        n.local === 'Relationship' &&
        n.attributes.Type ===
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' &&
        ['word/document.xml', '/word/document.xml'].includes(
          n.attributes.Target,
        ) &&
        n.attributes.TargetMode !== 'External',
    )
  )
    throw invalid();
  const document = xml(entries.get('word/document.xml')!);
  if (
    document[0]?.local !== 'document' ||
    document[0]?.uri !== namespaces.word ||
    !document.some((n) => n.local === 'body' && n.uri === namespaces.word)
  )
    throw invalid();
  for (const [name, content] of entries)
    if (
      (name.endsWith('.xml') || name.endsWith('.rels')) &&
      !['[Content_Types].xml', '_rels/.rels', 'word/document.xml'].includes(
        name,
      )
    )
      xml(content);
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
    else validateDocx(bytes);
  } catch {
    throw invalid();
  }
  return { originalFilename: name, format };
}
