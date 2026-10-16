// Internal bounded parser. Called only inside the cgroup/namespace process.
import { inflateRawSync, crc32 } from 'node:zlib';
import { SaxesParser } from 'saxes';
const invalid = () => new Error('Unsupported document');
class ExtractionLimit extends Error {}
const namespaces = {
  types: 'http://schemas.openxmlformats.org/package/2006/content-types',
  relationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
};
function xml(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw invalid();
  const nodes = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', () => {
    throw invalid();
  });
  let depth = 0;
  parser.on('closetag', () => {
    depth--;
  });
  parser.on('opentag', (node) => {
    if (++depth > 100) throw invalid();
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
function validatedDocxEntries(input) {
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
  const entries = new Map();
  let cursor = directory,
    total = 0;
  const spans = [];
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
      size > Math.max(1024, compressed * 200) ||
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
  const types = xml(entries.get('[Content_Types].xml'));
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
  const relationships = xml(entries.get('_rels/.rels'));
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
  const document = xml(entries.get('word/document.xml'));
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
  return entries;
}
function extractDocx(bytes) {
  try {
    const entries = validatedDocxEntries(bytes),
      lines = [];
    const parser = new SaxesParser({ xmlns: true });
    let paragraph = '',
      inText = false,
      depth = 0,
      paragraphNumber = 0;
    parser.on('error', () => {
      throw Error();
    });
    parser.on('opentag', (node) => {
      if (++depth > 100) throw new ExtractionLimit();
      if (
        node.uri ===
        'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
      ) {
        if (node.local === 't') inText = true;
        if (node.local === 'tab' || node.local === 'br') paragraph += ' ';
      }
    });
    parser.on('text', (text) => {
      if (inText) {
        paragraph += text;
        if (paragraph.length > 24000) throw new ExtractionLimit();
      }
    });
    parser.on('closetag', (node) => {
      depth--;
      if (
        node.uri ===
        'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
      ) {
        if (node.local === 't') inText = false;
        if (node.local === 'p') {
          paragraphNumber++;
          if (paragraph.trim())
            lines.push({
              text: paragraph,
              location: 'Paragraph ' + paragraphNumber,
            });
          paragraph = '';
          if (
            lines.length > 200 ||
            lines.reduce((n, l) => n + l.text.length, 0) > 24000
          )
            throw new ExtractionLimit();
        }
      }
    });
    parser
      .write(
        new TextDecoder('utf-8', { fatal: true }).decode(
          entries.get('word/document.xml'),
        ),
      )
      .close();
    if (!lines.length)
      return {
        status:
          entries.has('word/media/image1.png') ||
          [...entries.keys()].some((k) => k.startsWith('word/media/'))
            ? 'unsupported'
            : 'empty',
        message:
          'No readable body text was found. Image-only documents require a text-based resume; OCR is not included.',
      };
    return {
      status: 'success',
      lines,
      warnings: [
        'DOCX body text only. Headers, footers, drawings, and text boxes may be omitted. Review the extracted text before sharing.',
      ],
    };
  } catch (error) {
    return {
      status: error instanceof ExtractionLimit ? 'limit' : 'failed',
      message:
        'This DOCX could not be extracted safely within the processing limits. Use a simpler text-based resume.',
    };
  }
}
export { validatedDocxEntries, extractDocx };
