import { constants } from 'node:fs';
import {
  mkdir,
  lstat,
  open,
  link,
  unlink,
  readdir,
  realpath,
} from 'node:fs/promises';
import { resolve, join, isAbsolute, parse } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { DocumentHealth } from '@fats/domain';

// Keys are opaque, server-generated UUIDs. No URLs, public paths or owner input.
export interface DocumentStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string, expectedSize: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export const isStorageKey = (key: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    key,
  );
export const documentHash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export class StorageIntegrityError extends Error {
  readonly health: DocumentHealth;
  constructor(health: DocumentHealth) {
    super('Document bytes are unavailable.');
    this.health = health;
  }
}
export class FilesystemDocumentStorage implements DocumentStorage {
  readonly root: string;
  constructor(root: string) {
    if (
      !isAbsolute(root) ||
      root
        .split(/[\\/]/)
        .some((part) => ['public', '.next', 'node_modules'].includes(part)) ||
      resolve(root) === parse(root).root
    )
      throw new Error(
        'Choose an absolute private document directory outside publicly served directories.',
      );
    this.root = resolve(root);
  }
  private async ready(create = false) {
    if (create) await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    // Refuse symlinked ancestors and permissive roots; do not silently chmod user directories.
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0 ||
      (await realpath(this.root)) !== this.root
    )
      throw new Error(
        'The document directory must be private (0700) and must not use symbolic links.',
      );
  }
  private path(key: string) {
    if (!isStorageKey(key)) throw new Error('Invalid internal document key.');
    return join(this.root, key + '.blob');
  }
  async put(key: string, bytes: Uint8Array) {
    const destination = this.path(key);
    await this.ready(true);
    const temporary = join(this.root, randomUUID() + '.partial');
    const handle = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      await link(temporary, destination); // Atomic exclusive publication; never overwrites a version.
      const directory = await open(this.root, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await handle.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
  async read(key: string, expectedSize: number) {
    const path = this.path(key);
    try {
      await this.ready();
      const handle = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const info = await handle.stat();
        if (
          !info.isFile() ||
          info.size !== expectedSize ||
          info.size > 10485760 ||
          info.size < 1 ||
          (info.mode & 0o077) !== 0
        )
          throw new StorageIntegrityError('corrupt');
        const bytes = Buffer.alloc(expectedSize);
        let offset = 0;
        while (offset < expectedSize) {
          const result = await handle.read(
            bytes,
            offset,
            expectedSize - offset,
            offset,
          );
          if (!result.bytesRead) throw new StorageIntegrityError('corrupt');
          offset += result.bytesRead;
        }
        return bytes;
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error instanceof StorageIntegrityError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new StorageIntegrityError('missing');
      throw new StorageIntegrityError('unavailable');
    }
  }
  async remove(key: string) {
    const path = this.path(key);
    await this.ready();
    await unlink(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  async inventory() {
    await this.ready();
    return readdir(this.root);
  }
}
export async function verifiedDocumentBytes(
  storage: DocumentStorage,
  row: { storage_key: string; byte_size: number; sha256: string },
) {
  const bytes = await storage.read(row.storage_key, row.byte_size);
  if (documentHash(bytes) !== row.sha256)
    throw new StorageIntegrityError('corrupt');
  return bytes;
}
export function getDocumentStorage() {
  const root = process.env.FATS_DOCUMENTS_DIR;
  if (!root) throw new Error('Private document storage is not configured.');
  return new FilesystemDocumentStorage(root);
}
