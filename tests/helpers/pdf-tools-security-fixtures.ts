import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ascii = (text: string) => Buffer.from(text, 'ascii');
function pdf(objects: Buffer[], trailer = '') {
  const parts = [ascii('%PDF-1.7\n')];
  const offsets = [0];
  let size = parts[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(size);
    const object = Buffer.concat([
      ascii(`${index + 1} 0 obj\n`),
      objects[index],
      ascii('\nendobj\n'),
    ]);
    parts.push(object);
    size += object.length;
  }
  parts.push(
    ascii(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
        .join(
          '',
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${size}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}
const content = ascii(
  'BT /F1 16 Tf 50 740 Td (SYNTHETIC SECURITY FIXTURE) Tj ET',
);
const stream = (bytes: Buffer) =>
  Buffer.concat([
    ascii(`<< /Length ${bytes.length} >>\nstream\n`),
    bytes,
    ascii('\nendstream'),
  ]);
const objects = () => [
  ascii('<< /Type /Catalog /Pages 2 0 R >>'),
  ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
  ascii(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  ),
  stream(content),
  ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
];

// A real detached CMS signature using an ephemeral, self-signed synthetic key.
// Poppler validates its byte ranges and cryptographic signature independently.
export async function signedPdfFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'fats-pdf-signature-'));
  try {
    const data = objects();
    data[0] = ascii('<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>');
    data[2] = ascii(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [7 0 R] >>',
    );
    data.push(ascii('<< /Fields [7 0 R] /SigFlags 3 >>'));
    data.push(
      ascii(
        '<< /Type /Annot /Subtype /Widget /FT /Sig /T (Synthetic signature) /Rect [0 0 0 0] /V 8 0 R /P 3 0 R >>',
      ),
    );
    const placeholder = '0'.repeat(16384);
    const range = '/ByteRange [0 ********** ********** **********]';
    data.push(
      ascii(
        `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ${range} /Contents <${placeholder}> >>`,
      ),
    );
    const unsigned = pdf(data);
    const start = unsigned.indexOf(ascii('/Contents <')) + '/Contents '.length;
    const end = start + placeholder.length + 2;
    const ranges = `/ByteRange [0 ${String(start).padStart(10, '0')} ${String(end).padStart(10, '0')} ${String(unsigned.length - end).padStart(10, '0')}]`;
    ascii(ranges).copy(unsigned, unsigned.indexOf(ascii(range)));
    await writeFile(
      join(directory, 'content.bin'),
      Buffer.concat([unsigned.subarray(0, start), unsigned.subarray(end)]),
    );
    await run(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'key.pem',
        '-out',
        'cert.pem',
        '-subj',
        '/CN=FATS Synthetic Fixture',
        '-days',
        '1',
      ],
      { cwd: directory, timeout: 15000 },
    );
    await run(
      'openssl',
      [
        'cms',
        '-sign',
        '-binary',
        '-in',
        'content.bin',
        '-signer',
        'cert.pem',
        '-inkey',
        'key.pem',
        '-outform',
        'DER',
        '-out',
        'signature.der',
        '-md',
        'sha256',
        '-nosmimecap',
      ],
      { cwd: directory, timeout: 15000 },
    );
    const signature = (
      await readFile(join(directory, 'signature.der'))
    ).toString('hex');
    if (signature.length > placeholder.length)
      throw new Error('Synthetic signature exceeds fixture reservation.');
    ascii(signature.padEnd(placeholder.length, '0')).copy(unsigned, start + 1);
    return unsigned;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Minimal Standard Security revision 2 fixture. This is generated test data,
// never an application decryption implementation; Poppler must confirm it opens
// only with its known synthetic password before the rejection test uses it.
export const syntheticPdfPassword = 'synthetic-fixture-only';
export function encryptedPdfFixture() {
  const padding = Buffer.from(
    '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
    'hex',
  );
  const padded = (text: string) =>
    Buffer.concat([ascii(text), padding]).subarray(0, 32);
  const md5 = (bytes: Buffer) => createHash('md5').update(bytes).digest();
  const rc4 = (key: Buffer, input: Buffer) => {
    const state = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + state[i] + key[i % key.length]) & 255;
      [state[i], state[j]] = [state[j], state[i]];
    }
    let i = 0;
    j = 0;
    return Buffer.from(
      input.map((value) => {
        i = (i + 1) & 255;
        j = (j + state[i]) & 255;
        [state[i], state[j]] = [state[j], state[i]];
        return value ^ state[(state[i] + state[j]) & 255];
      }),
    );
  };
  const owner = rc4(
    md5(padded('synthetic-owner-only')).subarray(0, 5),
    padded(syntheticPdfPassword),
  );
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const id = ascii('0123456789abcdef');
  const key = md5(
    Buffer.concat([padded(syntheticPdfPassword), owner, permissions, id]),
  ).subarray(0, 5);
  const user = rc4(key, padding);
  const objectKey = md5(
    Buffer.concat([key, Buffer.from([4, 0, 0, 0, 0])]),
  ).subarray(0, 10);
  const data = objects();
  data[3] = stream(rc4(objectKey, content));
  data.push(
    ascii(
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> >>`,
    ),
  );
  return pdf(
    data,
    `/Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>]`,
  );
}
