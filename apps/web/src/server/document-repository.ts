import { recordMomentum } from './momentum';
import { requireAcceptedDocument } from './document-acceptance';
import {
  ClamavDocumentScanner,
  type DocumentScanner,
} from './document-scanner';
import { admitUpload } from './upload-admission';
import { cleanupDocumentGarbage } from './document-cleanup';
import { assertActiveAccount } from './account-lifecycle';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  DocumentValidationError,
  documentDetails,
  MAX_ACCOUNT_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_VERSIONS,
  type DocumentLibrary,
  type Document,
  type DocumentVersion,
} from '@fats/domain';
import { WorkspaceError } from './workspace-repository';
import { documentFileDetails, validateDocument } from './document-validation';
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
    private readonly scanner: DocumentScanner = new ClamavDocumentScanner(),
  ) {}
  private async transaction<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      // Backups take the exclusive counterpart before exporting a snapshot.
      await client.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
      await assertActiveAccount(client, this.owner, true);
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
    await assertActiveAccount(this.pool, this.owner);
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
          await requireAcceptedDocument(this.pool, row);
          await verifiedDocumentBytes(this.storage, row);
        } catch (error) {
          health =
            error instanceof WorkspaceError && error.status === 409
              ? 'unverified'
              : error instanceof StorageIntegrityError
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
    const release = await admitUpload(this.pool, this.owner);
    try {
      return await this.uploadAdmitted(bytes, filename, input);
    } finally {
      await release();
    }
  }
  async uploadAdmitted(
    bytes: Uint8Array,
    filename: unknown,
    input: {
      name?: unknown;
      category?: unknown;
      documentId?: string;
      requestId: string;
    },
  ) {
    const file = documentFileDetails(bytes, filename);
    const hash = documentHash(bytes);
    const details = input.documentId
      ? null
      : documentDetails(input.name, input.category);
    if (
      !this.storage.quarantine ||
      !this.storage.readQuarantine ||
      !this.storage.promote
    )
      throw new WorkspaceError(
        'Private document quarantine is unavailable. Ask the local operator to check storage. No document was accepted.',
        503,
      );
    // Retry an already accepted immutable version without repeating intake. The
    // original scan evidence, owner and exact bytes must all agree.
    const key = randomUUID();
    const prior = await this.transaction(async (client) => {
      const found = (
        await client.query(
          'SELECT * FROM document_versions WHERE user_id=$1 AND id=$2',
          [this.owner, input.requestId],
        )
      ).rows[0];
      if (found) {
        if (
          found.sha256 !== hash ||
          found.original_filename !== file.originalFilename ||
          (input.documentId && found.document_id !== input.documentId)
        )
          throw new WorkspaceError(
            'This upload request was already used. Choose the file again.',
            409,
          );
        await requireAcceptedDocument(client, found);
        return { documentId: found.document_id, versionId: found.id };
      }
      await client.query(
        "INSERT INTO document_objects(storage_key,user_id,intake_state) VALUES($1,$2,'quarantined')",
        [key, this.owner],
      );
      return null;
    });
    if (prior) return prior;
    const controller = new AbortController();
    let checking = false;
    const monitor = setInterval(() => {
      if (checking) return;
      checking = true;
      void assertActiveAccount(this.pool, this.owner)
        .catch(() => controller.abort())
        .finally(() => {
          checking = false;
        });
    }, 200);
    try {
      await this.storage.quarantine(key, bytes);
      const staged = await this.storage.readQuarantine(key, bytes.length);
      if (documentHash(staged) !== hash)
        throw new WorkspaceError(
          'The upload could not be verified. Keep your file and retry.',
          503,
        );
      const scan = await this.scanner.scan(staged, controller.signal);
      await assertActiveAccount(this.pool, this.owner);
      if (scan.sha256 !== hash || controller.signal.aborted)
        throw new WorkspaceError(
          'The upload was interrupted. No document was accepted.',
          409,
        );
      await validateDocument(staged, filename, controller.signal);
      return await this.transaction(async (client) => {
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
        try {
          await this.storage.promote!(key, bytes.length, hash);
        } catch {
          throw new WorkspaceError(
            'The file could not be stored. Keep your selection and retry. No complete document was added.',
            503,
          );
        }
        await client.query(
          "UPDATE document_objects SET intake_state='accepted',accepted_sha256=$3,scan_engine=$4,signature_revision=$5,signature_at=$6,scanned_at=$7 WHERE user_id=$1 AND storage_key=$2 AND intake_state='quarantined'",
          [
            this.owner,
            key,
            hash,
            scan.engine,
            scan.signatureRevision,
            scan.signatureAt,
            scan.scannedAt,
          ],
        );
        // A crash/ambiguous COMMIT may leave unreferenced bytes. Never delete them
        // in catch: a committed version must remain readable after a lost response.
        if (details)
          await client.query(
            'INSERT INTO documents(user_id,id,name,category) VALUES($1,$2,$3,$4)',
            [this.owner, id, details.name, details.category],
          );
        const duplicateContent = (
          await client.query(
            'SELECT 1 FROM document_versions WHERE user_id=$1 AND sha256=$2 LIMIT 1',
            [this.owner, hash],
          )
        ).rowCount;
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
        if (!duplicateContent) await recordMomentum(client, this.owner);
        return { documentId: id, versionId: input.requestId };
      });
    } catch (error) {
      // Known failures and ambiguous publication alike are reconciled against live
      // versions under the owner lock; no speculative byte deletion here.
      throw error instanceof WorkspaceError ||
        error instanceof DocumentValidationError
        ? error
        : new WorkspaceError(
            'The document upload could not be confirmed. Keep your selection and retry; the same request will not add a duplicate version.',
            503,
          );
    } finally {
      clearInterval(monitor);
      // Hold upload admission until reconciliation. FOR UPDATE waits for any
      // ambiguous publication transaction before classifying unused intents.
      let cleanup: PoolClient | undefined;
      try {
        cleanup = await this.pool.connect();
        await cleanup.query('BEGIN');
        await cleanup.query("SET LOCAL lock_timeout='5s'");
        await cleanup.query('SELECT pg_advisory_xact_lock_shared(16432,5)');
        await cleanup.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
          this.owner,
        ]);
        await cleanup.query(
          'INSERT INTO document_garbage(storage_key) SELECT o.storage_key FROM document_objects o WHERE user_id=$1 AND NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.storage_key=o.storage_key) ON CONFLICT DO NOTHING',
          [this.owner],
        );
        await cleanup.query('COMMIT');
        await cleanupDocumentGarbage(this.pool, this.storage, this.owner);
      } catch {
        await cleanup
          ?.query('ROLLBACK')
          .catch(() => {}); /* Durable recovery remains available. */
      } finally {
        cleanup?.release();
      }
    }
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
      await requireAcceptedDocument(client, row);
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
    await assertActiveAccount(this.pool, this.owner);
    const { rows } = await this.pool.query(
      'SELECT * FROM document_versions WHERE user_id=$1 AND id=$2',
      [this.owner, versionId],
    );
    if (!rows.length)
      throw new WorkspaceError('Document version not found.', 404);
    await requireAcceptedDocument(this.pool, rows[0]);
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
            'SELECT 1 FROM career_events e JOIN document_versions v ON v.user_id=e.user_id AND v.id=e.version_id WHERE e.user_id=$1 AND v.document_id=$2 LIMIT 1',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'This document is part of Career Vault history. Archive it to preserve its exact versions.',
          409,
        );
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
    await cleanupDocumentGarbage(this.pool, this.storage);
  }
}
