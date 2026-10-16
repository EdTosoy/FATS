import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { documentHash } from './document-storage.ts';
import { clamavExecutable, runClamavProcess } from './document-process.ts';
import { WorkspaceError } from './workspace-error.ts';
const exec = promisify(execFile);
export interface ScanReceipt {
  engine: string;
  signatureRevision: string;
  signatureAt: string;
  scannedAt: string;
  sha256: string;
}
export interface DocumentScanner {
  scan(bytes: Uint8Array, signal?: AbortSignal): Promise<ScanReceipt>;
}
const unavailable = () =>
  new WorkspaceError(
    'Document safety checks are unavailable. Keep your file and retry later, or ask the local operator to check the scanner and signatures. No document was accepted.',
    503,
  );
export class ClamavDocumentScanner implements DocumentScanner {
  async health() {
    try {
      const directory = process.env.FATS_CLAMAV_DATABASE_DIR;
      if (
        !directory ||
        !isAbsolute(directory) ||
        (await realpath(directory)) !== directory
      )
        throw Error();
      const info = await lstat(directory);
      if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw Error();
      async function header(name: string) {
        for (const extension of ['cvd', 'cld'])
          try {
            const file = await open(
              join(directory!, name + '.' + extension),
              constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            try {
              const stat = await file.stat();
              if (!stat.isFile() || stat.size < 512) throw Error();
              const bytes = Buffer.alloc(512);
              await file.read(bytes, 0, 512, 0);
              const fields = bytes.toString('ascii').split(':');
              if (
                fields[0] !== 'ClamAV-VDB' ||
                !/^\d+$/.test(fields[2]) ||
                !/^\d+$/.test(fields[8]?.trim())
              )
                throw Error();
              return {
                revision: fields[2],
                timestamp: Number(fields[8].trim()) * 1000,
              };
            } finally {
              await file.close();
            }
          } catch {
            /* A verified Freshclam database may use either format. */
          }
        throw Error();
      }
      await header('main');
      const daily = await header('daily');
      if (
        daily.timestamp > Date.now() + 300000 ||
        Date.now() - daily.timestamp > 48 * 3600000
      )
        throw Error();
      const scanner = await clamavExecutable();
      const version = await exec(scanner, ['--version'], {
        timeout: 3000,
        maxBuffer: 4096,
        env: { TZ: 'UTC', NODE_ENV: 'production' },
      });
      const engine = /^ClamAV (\d+\.\d+\.\d+)(?:[\s/]|$)/.exec(
        version.stdout,
      )?.[1];
      if (!engine) throw Error();
      return {
        directory,
        scanner,
        engine: 'ClamAV ' + engine,
        signatureRevision: daily.revision,
        signatureAt: new Date(daily.timestamp).toISOString(),
      };
    } catch {
      throw unavailable();
    }
  }
  async scan(bytes: Uint8Array, signal?: AbortSignal): Promise<ScanReceipt> {
    if (!bytes.length || bytes.length > 10485760) throw unavailable();
    const before = await this.health();
    let result: Awaited<ReturnType<typeof runClamavProcess>>;
    try {
      result = await runClamavProcess(
        bytes,
        before.directory,
        before.scanner,
        signal,
      );
    } catch {
      throw unavailable();
    }
    if (result.code === 1 && / FOUND(?:\r?\n|$)/.test(result.stdout))
      throw new WorkspaceError(
        'This file did not pass the safety check. Choose a different PDF or DOCX. No document was accepted.',
        400,
      );
    // A success exit alone is insufficient: missing/partial scans never count.
    if (
      result.code !== 0 ||
      result.diagnostics ||
      !/^stdin: OK\r?\n$/.test(result.stdout)
    )
      throw unavailable();
    const after = await this.health();
    if (
      before.engine !== after.engine ||
      before.signatureRevision !== after.signatureRevision ||
      before.signatureAt !== after.signatureAt
    )
      throw unavailable();
    return {
      engine: before.engine,
      signatureRevision: before.signatureRevision,
      signatureAt: before.signatureAt,
      scannedAt: new Date().toISOString(),
      sha256: documentHash(bytes),
    };
  }
}
