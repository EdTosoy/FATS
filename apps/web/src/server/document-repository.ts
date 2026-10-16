import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  documentDetails,
  MAX_ACCOUNT_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_VERSIONS,
  type DocumentLibrary,
  type Document,
  type DocumentVersion,
} from '@fats/domain';
import { WorkspaceError } from './workspace-repository';
import { validateDocument } from './document-validation';
import {
  documentHash,
  verifiedDocumentBytes,
  StorageIntegrityError,
  type DocumentStorage,
} from './document-storage';

export class PostgresDocumentRepository {
  constructor(
    private readonly pool: Pool,
    private readonly owner: string,
    private readonly storage: DocumentStorage,
  ) {}
  private async transaction<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      // Backups take the exclusive counterpart before exporting a snapshot.
      await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
      await client.query(
        'INSERT INTO workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING',
        [this.owner],
      );
      await client.query(
        'SELECT revision FROM workspaces WHERE user_id=$1 FOR UPDATE',
        [this.owner],
      );
      const result = await run(client);
      await client.query(
        'UPDATE workspaces SET revision=revision+1 WHERE user_id=$1',
        [this.owner],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async library(): Promise<DocumentLibrary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const docs = await client.query(
        'SELECT * FROM documents WHERE user_id=$1 ORDER BY updated_at DESC,id',
        [this.owner],
      );
      const versions = await client.query(
        'SELECT * FROM document_versions WHERE user_id=$1 ORDER BY version_number DESC',
        [this.owner],
      );
      const links = await client.query(
        'SELECT * FROM application_document_versions WHERE user_id=$1',
        [this.owner],
      );
      await client.query('COMMIT');
      const mapped: DocumentVersion[] = [];
      // Sequential integrity reads bound memory to one file, at most 100 MiB per account.
      for (const row of versions.rows) {
        let health: DocumentVersion['health'] = 'available';
        try {
          await verifiedDocumentBytes(this.storage, row);
        } catch (error) {
          health =
            error instanceof StorageIntegrityError
              ? error.health
              : 'unavailable';
        }
        mapped.push({
          id: row.id,
          documentId: row.document_id,
          number: row.version_number,
          originalFilename: row.original_filename,
          format: row.format,
          size: row.byte_size,
          sha256: row.sha256,
          createdAt: row.created_at.toISOString(),
          health,
        });
      }
      const documents: Document[] = docs.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        archived: row.archived,
        isDefault: row.is_default,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        versions: mapped.filter((v) => v.documentId === row.id),
      }));
      return {
        documents,
        associations: links.rows.map((row) => ({
          applicationId: row.application_id,
          documentId: row.document_id,
          versionId: row.version_id,
          updatedAt: row.updated_at.toISOString(),
        })),
        usedBytes: mapped.reduce((total, v) => total + v.size, 0),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async upload(
    bytes: Uint8Array,
    filename: unknown,
    input: {
      name?: unknown;
      category?: unknown;
      documentId?: string;
      requestId: string;
    },
  ) {
    const file = await validateDocument(bytes, filename);
    const hash = documentHash(bytes);
    const details = input.documentId
      ? null
      : documentDetails(input.name, input.category);
    return this.transaction(async (client) => {
      const existing = await client.query(
        'SELECT * FROM document_versions WHERE user_id=$1 AND id=$2',
        [this.owner, input.requestId],
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (
          row.sha256 !== hash ||
          row.original_filename !== file.originalFilename ||
          (input.documentId && row.document_id !== input.documentId)
        )
          throw new WorkspaceError(
            'This upload request was already used. Choose the file again.',
            409,
          );
        return { documentId: row.document_id, versionId: row.id };
      }
      const usage = await client.query(
        'SELECT COALESCE(sum(byte_size),0)::bigint AS bytes FROM document_versions WHERE user_id=$1',
        [this.owner],
      );
      if (
        Number(usage.rows[0].bytes) + bytes.length >
        MAX_ACCOUNT_DOCUMENT_BYTES
      )
        throw new WorkspaceError(
          'Your account has reached its 100 MiB document limit. Delete an unlinked document to make room.',
          413,
        );
      const id = input.documentId ?? randomUUID();
      let number = 1;
      if (input.documentId) {
        const doc = await client.query(
          'SELECT * FROM documents WHERE user_id=$1 AND id=$2',
          [this.owner, id],
        );
        if (!doc.rows.length)
          throw new WorkspaceError('Document not found.', 404);
        if (doc.rows[0].archived)
          throw new WorkspaceError(
            'Restore this document from the archive before adding a version.',
            409,
          );
        const count = await client.query(
          'SELECT count(*)::int AS count FROM document_versions WHERE user_id=$1 AND document_id=$2',
          [this.owner, id],
        );
        number = count.rows[0].count + 1;
        if (number > MAX_DOCUMENT_VERSIONS)
          throw new WorkspaceError(
            'A document can have up to 20 versions. Create a new document to continue.',
            409,
          );
      } else {
        const count = await client.query(
          'SELECT count(*)::int AS count FROM documents WHERE user_id=$1',
          [this.owner],
        );
        if (count.rows[0].count >= MAX_DOCUMENTS)
          throw new WorkspaceError(
            'Your library can hold 50 documents, including archived documents.',
            409,
          );
      }
      const key = randomUUID();
      try {
        await this.storage.put(key, bytes);
      } catch {
        throw new WorkspaceError(
          'The file could not be stored. Keep your selection and retry. No complete document was added.',
          503,
        );
      }
      // A crash/ambiguous COMMIT may leave unreferenced bytes. Never delete them
      // in catch: a committed version must remain readable after a lost response.
      if (details)
        await client.query(
          'INSERT INTO documents(user_id,id,name,category) VALUES($1,$2,$3,$4)',
          [this.owner, id, details.name, details.category],
        );
      await client.query(
        'INSERT INTO document_versions(user_id,document_id,id,version_number,original_filename,format,byte_size,sha256,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          this.owner,
          id,
          input.requestId,
          number,
          file.originalFilename,
          file.format,
          bytes.length,
          hash,
          key,
        ],
      );
      await client.query(
        'UPDATE documents SET updated_at=now() WHERE user_id=$1 AND id=$2',
        [this.owner, id],
      );
      return { documentId: id, versionId: input.requestId };
    });
  }
  async edit(
    id: string,
    input: {
      name: unknown;
      category: unknown;
      archived: unknown;
      isDefault: unknown;
    },
  ) {
    const details = documentDetails(input.name, input.category);
    if (
      typeof input.archived !== 'boolean' ||
      typeof input.isDefault !== 'boolean'
    )
      throw new WorkspaceError('Choose valid archive and default settings.');
    if (input.isDefault && (input.archived || details.category !== 'Resumes'))
      throw new WorkspaceError('Only an active resume can be your default.');
    return this.transaction(async (client) => {
      const doc = await client.query(
        'SELECT * FROM documents WHERE user_id=$1 AND id=$2',
        [this.owner, id],
      );
      if (!doc.rows.length)
        throw new WorkspaceError('Document not found.', 404);
      if (
        details.category !== 'Resumes' &&
        (
          await client.query(
            'SELECT 1 FROM application_document_versions WHERE user_id=$1 AND document_id=$2 LIMIT 1',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'Keep the Resumes category while this document is linked to an application.',
          409,
        );
      if (input.isDefault)
        await client.query(
          'UPDATE documents SET is_default=false,updated_at=now() WHERE user_id=$1 AND is_default',
          [this.owner],
        );
      await client.query(
        'UPDATE documents SET name=$3,category=$4,archived=$5,is_default=$6,updated_at=now() WHERE user_id=$1 AND id=$2',
        [
          this.owner,
          id,
          details.name,
          details.category,
          input.archived,
          input.isDefault,
        ],
      );
    });
  }
  async associate(applicationId: string, versionId: string | null) {
    return this.transaction(async (client) => {
      if (
        !(
          await client.query(
            'SELECT 1 FROM applications WHERE user_id=$1 AND id=$2',
            [this.owner, applicationId],
          )
        ).rowCount
      )
        throw new WorkspaceError('Application not found.', 404);
      if (versionId === null) {
        await client.query(
          'DELETE FROM application_document_versions WHERE user_id=$1 AND application_id=$2',
          [this.owner, applicationId],
        );
        return;
      }
      const versions = await client.query(
        'SELECT v.*,d.archived,d.category FROM document_versions v JOIN documents d ON d.user_id=v.user_id AND d.id=v.document_id WHERE v.user_id=$1 AND v.id=$2',
        [this.owner, versionId],
      );
      const row = versions.rows[0];
      if (!row) throw new WorkspaceError('Resume version not found.', 404);
      if (row.category !== 'Resumes' || row.archived)
        throw new WorkspaceError('Choose a version of an active resume.', 409);
      try {
        await verifiedDocumentBytes(this.storage, row);
      } catch {
        throw new WorkspaceError(
          'This version’s file is missing or damaged. Recover its bytes before recording it as submitted.',
          409,
        );
      }
      await client.query(
        'INSERT INTO application_document_versions(user_id,application_id,document_id,version_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,application_id) DO UPDATE SET document_id=EXCLUDED.document_id,version_id=EXCLUDED.version_id,updated_at=now()',
        [this.owner, applicationId, row.document_id, versionId],
      );
    });
  }
  async download(versionId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM document_versions WHERE user_id=$1 AND id=$2',
      [this.owner, versionId],
    );
    if (!rows.length)
      throw new WorkspaceError('Document version not found.', 404);
    try {
      return {
        row: rows[0],
        bytes: await verifiedDocumentBytes(this.storage, rows[0]),
      };
    } catch {
      throw new WorkspaceError(
        'This file is missing, damaged, or unavailable. Its metadata and application links are preserved. Ask the local operator to recover the matching file from a complete backup.',
        409,
      );
    }
  }
  async delete(id: string) {
    await this.transaction(async (client) => {
      if (
        (
          await client.query(
            'SELECT 1 FROM offer_events e JOIN document_versions v ON v.user_id=e.user_id AND v.id=e.version_id WHERE e.user_id=$1 AND v.document_id=$2 LIMIT 1',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'This document is part of offer history. Archive it to preserve the exact offer letter or contract.',
          409,
        );
      if (
        !(
          await client.query(
            'SELECT 1 FROM documents WHERE user_id=$1 AND id=$2',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError('Document not found.', 404);
      if (
        (
          await client.query(
            'SELECT 1 FROM application_document_versions WHERE user_id=$1 AND document_id=$2 LIMIT 1',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'This document is linked to an application. Archive it to keep the submitted version, or explicitly remove every application link before deleting.',
          409,
        );
      if (
        (
          await client.query(
            'SELECT 1 FROM matching_reports r JOIN document_versions v ON v.user_id=r.user_id AND v.id=r.version_id WHERE r.user_id=$1 AND v.document_id=$2 LIMIT 1',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'This document has comparison reports. Archive it, or delete its reports before deleting the document.',
          409,
        );
      await client.query(
        'INSERT INTO document_garbage(storage_key) SELECT storage_key FROM document_versions WHERE user_id=$1 AND document_id=$2',
        [this.owner, id],
      );
      await client.query(
        'DELETE FROM document_versions WHERE user_id=$1 AND document_id=$2',
        [this.owner, id],
      );
      await client.query('DELETE FROM documents WHERE user_id=$1 AND id=$2', [
        this.owner,
        id,
      ]);
    });
    await this.cleanup();
  }
  async cleanup() {
    // Serialize against backup and other cleanup processes. Only durable garbage
    // rows authorize byte deletion; no deletion by filename guesses or age.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
      const { rows } = await client.query(
        'SELECT storage_key FROM document_garbage FOR UPDATE SKIP LOCKED',
      );
      for (const row of rows) {
        try {
          await this.storage.remove(row.storage_key);
          await client.query(
            'DELETE FROM document_garbage WHERE storage_key=$1',
            [row.storage_key],
          );
        } catch {
          /* Retain durable retry entry. */
        }
      }
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}
