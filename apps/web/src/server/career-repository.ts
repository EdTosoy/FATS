import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CAREER_LIMITS,
  careerUuid,
  normalizeCareerChange,
  normalizeEmployment,
  employmentDocuments,
  portableEmployments,
  type CareerChange,
  type CareerEmployment,
  type CareerEvent,
  type EmploymentInput,
} from '@fats/domain';
import { assertActiveAccount } from './account-lifecycle';
import { requireAcceptedDocument } from './document-acceptance';
import {
  getDocumentStorage,
  verifiedDocumentBytes,
  type DocumentStorage,
} from './document-storage';
import { WorkspaceError } from './workspace-error';

export async function readCareerEmployments(
  db: Pool | PoolClient,
  owner: string,
): Promise<CareerEmployment[]> {
  const { rows } = await db.query(
    `SELECT c.*, COALESCE(jsonb_agg(jsonb_build_object(
    'requestId',e.request_id,'sequence',e.sequence,'kind',e.kind,'documentId',e.document_id,
    'details',e.details,'recordedAt',e.recorded_at,'documentReference',e.source_version_id)
    ORDER BY e.sequence) FILTER(WHERE e.sequence IS NOT NULL),'[]') AS events
    FROM career_employments c LEFT JOIN career_events e ON e.user_id=c.user_id AND e.employment_id=c.id
    WHERE c.user_id=$1 GROUP BY c.user_id,c.id ORDER BY c.created_at,c.id`,
    [owner],
  );
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    details: normalizeEmployment(row.details),
    events: row.events.map((event: CareerEvent) => ({
      ...normalizeCareerChange({
        kind: event.kind,
        documentId: event.documentId,
        details: event.details,
      }),
      requestId: event.requestId,
      sequence: event.sequence,
      recordedAt: new Date(event.recordedAt).toISOString(),
      documentReference: event.documentReference,
    })),
  }));
}
export function careerFingerprint(
  employmentId: string,
  baseVersion: number,
  change: CareerChange,
) {
  return createHash('sha256')
    .update(JSON.stringify({ employmentId, baseVersion, change }))
    .digest('hex');
}
async function insertEvent(
  client: PoolClient,
  owner: string,
  employmentId: string,
  event: CareerEvent,
  fingerprint: string,
) {
  await client.query(
    `INSERT INTO career_events(user_id,employment_id,sequence,request_id,fingerprint,kind,document_id,details,recorded_at,version_id,source_version_id,application_id,offer_application_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      owner,
      employmentId,
      event.sequence,
      event.requestId,
      fingerprint,
      event.kind,
      event.documentId,
      JSON.stringify(event.details),
      event.recordedAt,
      event.kind === 'document'
        ? event.details.documentVersionId || null
        : null,
      event.documentReference,
      event.kind === 'employment' ? event.details.applicationId || null : null,
      event.kind === 'employment' && event.details.fromAcceptedOffer
        ? event.details.applicationId
        : null,
    ],
  );
}
export async function insertPortableEmployment(
  client: PoolClient,
  owner: string,
  record: CareerEmployment,
) {
  if (
    record.events.some(
      (event) => event.kind === 'document' && event.details.documentVersionId,
    )
  )
    throw new WorkspaceError(
      'Portable Career Vault metadata cannot create live file links.',
    );
  await client.query(
    'INSERT INTO career_employments(user_id,id,version,details,application_id,offer_application_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      owner,
      record.id,
      record.version,
      JSON.stringify(record.details),
      record.details.applicationId || null,
      record.details.fromAcceptedOffer ? record.details.applicationId : null,
      record.createdAt,
      record.updatedAt,
    ],
  );
  for (const event of record.events) {
    const change: CareerChange =
      event.kind === 'document'
        ? {
            kind: 'document',
            documentId: event.documentId,
            details: {
              ...event.details,
              documentVersionId: event.documentReference ?? '',
            },
          }
        : { kind: 'employment', documentId: null, details: event.details };
    await insertEvent(
      client,
      owner,
      record.id,
      event,
      careerFingerprint(record.id, event.sequence - 1, change),
    );
  }
}
export async function readPortableEmployments(
  client: PoolClient,
  owner: string,
) {
  return portableEmployments(await readCareerEmployments(client, owner));
}
const associationValues = (details: EmploymentInput) => [
  details.applicationId || null,
  details.fromAcceptedOffer ? details.applicationId : null,
];
export class PostgresCareerRepository {
  constructor(
    private readonly pool: Pool,
    private readonly owner: string,
    private readonly storage?: DocumentStorage,
  ) {}
  async list() {
    await assertActiveAccount(this.pool, this.owner);
    return readCareerEmployments(this.pool, this.owner);
  }
  async command(
    employmentId: string,
    requestId: string,
    baseVersion: number,
    input: unknown,
  ) {
    const change = normalizeCareerChange(input);
    if (
      !careerUuid(employmentId) ||
      !careerUuid(requestId) ||
      !Number.isSafeInteger(baseVersion) ||
      baseVersion < 0
    )
      throw new WorkspaceError('Use a valid Career Vault request and version.');
    const fingerprint = careerFingerprint(employmentId, baseVersion, change),
      client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
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
      const retry = (
        await client.query(
          'SELECT fingerprint FROM career_events WHERE user_id=$1 AND request_id=$2',
          [this.owner, requestId],
        )
      ).rows[0];
      if (retry) {
        if (retry.fingerprint !== fingerprint)
          throw new WorkspaceError(
            'This request was used for different details. Keep your draft and start a new save.',
            409,
          );
        await client.query('COMMIT');
        return;
      }
      const records = await readCareerEmployments(client, this.owner),
        existing = records.find((row) => row.id === employmentId);
      if ((existing?.version ?? 0) !== baseVersion)
        throw new WorkspaceError(
          'This employment changed in another tab. Your draft is kept. Reload saved records, review the differences, then reopen the form.',
          409,
        );
      if (!existing && change.kind !== 'employment')
        throw new WorkspaceError(
          'Save an employment record before adding documents.',
          404,
        );
      if (!existing && records.length >= CAREER_LIMITS.employments)
        throw new WorkspaceError(
          'Career Vault supports up to 50 employment records, including archived records.',
          409,
        );
      if (baseVersion >= CAREER_LIMITS.events)
        throw new WorkspaceError(
          'This employment has reached 100 history entries. Export your history and request recovery help; no history was removed.',
          409,
        );
      if (change.kind === 'employment')
        await this.checkEmployment(
          client,
          records,
          existing,
          employmentId,
          change.details,
        );
      else {
        const documents = employmentDocuments(existing!);
        if (
          !documents.some((document) => document.id === change.documentId) &&
          documents.length >= CAREER_LIMITS.documents
        )
          throw new WorkspaceError(
            'Use at most 30 document entries per employment.',
            409,
          );
        if (
          (
            await client.query(
              'SELECT 1 FROM career_events WHERE user_id=$1 AND document_id=$2 AND employment_id<>$3 LIMIT 1',
              [this.owner, change.documentId, employmentId],
            )
          ).rowCount
        )
          throw new WorkspaceError(
            'That document entry belongs to another employment.',
            409,
          );
        if (change.details.documentVersionId)
          await this.checkDocument(
            client,
            employmentId,
            change.documentId,
            change.details.documentVersionId,
          );
      }
      const recordedAt = new Date().toISOString(),
        version = baseVersion + 1;
      const details =
        change.kind === 'employment' ? change.details : existing!.details;
      if (!existing)
        await client.query(
          'INSERT INTO career_employments(user_id,id,version,details,application_id,offer_application_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)',
          [
            this.owner,
            employmentId,
            version,
            JSON.stringify(details),
            ...associationValues(details),
            recordedAt,
          ],
        );
      else
        await client.query(
          'UPDATE career_employments SET version=$3,details=$4,application_id=$5,offer_application_id=$6,updated_at=$7 WHERE user_id=$1 AND id=$2',
          [
            this.owner,
            employmentId,
            version,
            JSON.stringify(details),
            ...associationValues(details),
            recordedAt,
          ],
        );
      await insertEvent(
        client,
        this.owner,
        employmentId,
        {
          ...change,
          requestId,
          sequence: version,
          recordedAt,
          documentReference: null,
        },
        fingerprint,
      );
      await client.query(
        'UPDATE workspaces SET revision=revision+1 WHERE user_id=$1',
        [this.owner],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async checkEmployment(
    client: PoolClient,
    records: CareerEmployment[],
    existing: CareerEmployment | undefined,
    id: string,
    details: EmploymentInput,
  ) {
    if (details.applicationId) {
      if (
        !(
          await client.query(
            'SELECT 1 FROM applications WHERE user_id=$1 AND id=$2',
            [this.owner, details.applicationId],
          )
        ).rowCount
      )
        throw new WorkspaceError('Choose an application in your account.', 404);
      if (
        records.some(
          (row) =>
            row.id !== id &&
            row.details.applicationId === details.applicationId,
        )
      )
        throw new WorkspaceError(
          'This application already has an employment record. Open that record instead.',
          409,
        );
    }
    if (
      details.fromAcceptedOffer &&
      !(
        existing?.details.fromAcceptedOffer &&
        existing.details.applicationId === details.applicationId
      )
    ) {
      if (
        !(
          await client.query(
            "SELECT 1 FROM offers WHERE user_id=$1 AND application_id=$2 AND state='accepted'",
            [this.owner, details.applicationId],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'Choose an accepted offer from your account. Accepting an offer does not start employment.',
          409,
        );
    }
    if (
      records.some(
        (row) =>
          row.id !== id &&
          row.details.employer.toLowerCase() ===
            details.employer.toLowerCase() &&
          row.details.title.toLowerCase() === details.title.toLowerCase() &&
          row.details.startOn === details.startOn,
      )
    )
      throw new WorkspaceError(
        'This employer, role and start date are already recorded. Open the existing employment instead.',
        409,
      );
  }
  private async checkDocument(
    client: PoolClient,
    employmentId: string,
    documentId: string,
    versionId: string,
  ) {
    const version = (
      await client.query(
        'SELECT v.*,d.archived FROM document_versions v JOIN documents d ON d.user_id=v.user_id AND d.id=v.document_id WHERE v.user_id=$1 AND v.id=$2',
        [this.owner, versionId],
      )
    ).rows[0];
    if (!version)
      throw new WorkspaceError(
        'Document version not found in your account.',
        404,
      );
    await requireAcceptedDocument(client, version);
    if (
      version.archived &&
      !(
        await client.query(
          'SELECT 1 FROM career_events WHERE user_id=$1 AND employment_id=$2 AND document_id=$3 AND version_id=$4 LIMIT 1',
          [this.owner, employmentId, documentId, version.id],
        )
      ).rowCount
    )
      throw new WorkspaceError(
        'Restore this document in the library before linking it.',
        409,
      );
    try {
      await verifiedDocumentBytes(
        this.storage ?? getDocumentStorage(),
        version,
      );
    } catch {
      throw new WorkspaceError(
        'This file is missing, damaged or unavailable. Choose No file to save metadata; earlier file history is preserved.',
        409,
      );
    }
  }
}
