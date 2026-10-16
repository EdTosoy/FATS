// This module runs only inside the cgroup/namespace boundary. No host credentials.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { validatedDocxEntries, extractDocx } from './docx-parser.mjs';
const nativeRequire = createRequire('/app/apps/web/package.json');
const path = await import('node:path');
async function validatePdf(bytes) {
  if (
    !/^%PDF-1\.[0-7]/.test(
      Buffer.from(bytes.subarray(0, 8)).toString('ascii'),
    ) ||
    !/%%EOF\s*$/.test(Buffer.from(bytes.subarray(-1024)).toString('latin1'))
  )
    return false;
  const { PDFDocument, PDFDict, PDFArray, PDFName } = nativeRequire('pdf-lib');

  try {
    const pdf = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500)
      throw Error();
    let count = 0;
    const seen = new Set();
    const forbidden = new Set([
      'JS',
      'JavaScript',
      'Launch',
      'EmbeddedFiles',
      'EmbeddedFile',
      'RichMedia',
      'XFA',
      'OpenAction',
      'AA',
    ]);
    function inspect(obj) {
      if (++count > 100000) throw Error();
      if (!obj || seen.has(obj)) return;
      seen.add(obj);
      if (obj instanceof PDFName && forbidden.has(obj.decodeText()))
        throw Error();
      if (obj instanceof PDFDict)
        for (const [key, value] of obj.entries()) {
          inspect(key);
          inspect(value);
        }
      if (obj instanceof PDFArray)
        for (const value of obj.asArray()) inspect(value);
      if (obj.dict) inspect(obj.dict);
    }
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) inspect(obj);
    return true;
  } catch {
    return false;
  }
}
async function extractPdf(bytes) {
  try {
    const modulePath = nativeRequire.resolve(
      'pdfjs-dist/legacy/build/pdf.mjs',
      { paths: ['/app/apps/web', path.join('/app/apps/web', 'apps/web')] },
    );
    const { getDocument, OPS } = await import(pathToFileURL(modulePath).href);
    const task = getDocument({
      data: new Uint8Array(bytes),
      enableXfa: false,
      useSystemFonts: true,
      disableFontFace: true,
      useWasm: false,
      useWorkerFetch: false,
      stopAtErrors: true,
      verbosity: 0,
      maxImageSize: 1000000,
    });
    const pdf = await task.promise;
    if (pdf.numPages > 30) {
      return {
        status: 'limit',
        message: 'Compare a resume of at most 30 pages.',
      };
    }
    const lines = [];
    let total = 0,
      images = false;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number),
        content = await page.getTextContent(),
        previousLines = lines.length;
      let line = '',
        lineNumber = 1;
      for (const item of content.items)
        if ('str' in item) {
          line += item.str + ' ';
          if (item.hasEOL) {
            if (line.trim())
              lines.push({
                text: line,
                location: 'Page ' + number + ', line ' + lineNumber,
              });
            line = '';
            lineNumber++;
          }
          total += item.str.length;
          if (total > 24000 || lines.length > 200) {
            return {
              status: 'limit',
              message:
                'The extracted resume exceeds 24,000 characters or 200 text segments. Use a shorter resume.',
            };
          }
        }
      if (line.trim())
        lines.push({
          text: line,
          location: 'Page ' + number + ', line ' + lineNumber,
        });
      if (lines.length === previousLines) {
        const ops = await page.getOperatorList();
        images ||= ops.fnArray.some((op) =>
          [
            OPS.paintImageXObject,
            OPS.paintInlineImageXObject,
            OPS.paintImageMaskXObject,
          ].includes(op),
        );
      }
      page.cleanup();
    }
    await task.destroy();
    if (images) {
      return {
        status: 'unsupported',
        message:
          'This PDF contains an image-only page that cannot be read reliably. Use a fully text-based PDF or DOCX; OCR is not included.',
      };
    }
    return lines.length
      ? {
          status: 'success',
          lines,
          warnings: [
            'PDF reading order may differ from the page layout. Image text and scanned pages are not read; OCR is not included. Review every extracted segment.',
          ],
        }
      : {
          status: images ? 'unsupported' : 'empty',
          message: images
            ? 'This PDF appears to be image-only. Use a text-based PDF or DOCX; OCR is not included.'
            : 'This PDF contains no readable text.',
        };
  } catch {
    return {
      status: 'failed',
      message:
        'This PDF could not be extracted safely. Try a text-based PDF or DOCX.',
    };
  }
}
try {
  const [format, action, probe] = process.argv.slice(2);
  if (action === 'probe') {
    for await (const chunk of process.stdin) {
      if (chunk.length > 64) throw Error();
    }
    if (probe === 'memory') {
      const buffers = [];
      while (true) buffers.push(Buffer.alloc(16 * 1024 * 1024, 1));
    }
    if (probe === 'cpu') {
      while (true) {
        Math.sqrt(Math.random());
      }
    }
    if (probe === 'output') {
      process.stdout.write('x'.repeat(131073));
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    }
    if (probe === 'children') {
      const { spawn } = await import('node:child_process');
      spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        stdio: 'ignore',
      });
      process.stdout.write(JSON.stringify({ ok: true, result: true }));
      process.exit(0);
    }
    if (probe === 'access') {
      const fs = await import('node:fs/promises'),
        net = await import('node:net');
      const hostFile = await fs.readFile('/etc/passwd').then(
        () => true,
        () => false,
      );
      const network = await new Promise((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port: 16432 });
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.setTimeout(200, () => {
          socket.destroy();
          resolve(false);
        });
      });
      process.stdout.write(
        JSON.stringify({
          ok: true,
          result: {
            hostFile,
            network,
            environment: Object.keys(process.env),
            pid: process.pid,
          },
        }),
      );
      process.exit(0);
    }
    throw Error();
  }
  if (
    !['pdf', 'docx'].includes(format) ||
    !['validate', 'extract'].includes(action)
  )
    throw Error();
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 10485760) throw Error();
    chunks.push(chunk);
  }
  if (!size) throw Error();
  const bytes = Buffer.concat(chunks, size);
  const result =
    action === 'extract'
      ? format === 'pdf'
        ? await extractPdf(bytes)
        : extractDocx(bytes)
      : format === 'pdf'
        ? await validatePdf(bytes)
        : !!validatedDocxEntries(bytes);
  if (result === false) throw Error();
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch {
  process.stdout.write(JSON.stringify({ ok: false }));
}
