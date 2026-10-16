import { assertActiveAccount } from './account-lifecycle';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  OFFER_CHECKLIST,
  validateOfferCommand,
  type Offer,
  type OfferEvent,
} from '@fats/domain';
import { WorkspaceError } from './workspace-repository';

export class PostgresOfferRepository {
  constructor(
    private readonly pool: Pool,
    private readonly owner: string,
  ) {}
  async list(): Promise<Offer[]> {
    await assertActiveAccount(this.pool, this.owner);
    // One statement gives a consistent snapshot of headers and their history.
    const { rows } = await this.pool.query(
      `SELECT o.*, COALESCE(jsonb_agg(jsonb_build_object(
        'requestId',e.request_id,'sequence',e.sequence,'kind',e.kind,
        'occurredOn',e.occurred_on,'recordedAt',e.recorded_at,'notes',e.notes,
        'terms',e.terms,'decision',e.decision) || CASE WHEN e.source_version_id IS NOT NULL THEN jsonb_build_object('unavailableDocumentReference',e.source_version_id) ELSE '{}'::jsonb END ORDER BY e.sequence) FILTER (WHERE e.sequence IS NOT NULL),'[]') AS events
       FROM offers o LEFT JOIN offer_events e USING(user_id,application_id)
       WHERE o.user_id=$1 GROUP BY o.user_id,o.application_id ORDER BY o.application_id`,
      [this.owner],
    );
    return rows.map((row) => ({
      applicationId: row.application_id,
      version: row.version,
      state: row.state,
      checklist: row.checklist,
      questions: row.questions,
      events: row.events as OfferEvent[],
    }));
  }
  async command(
    applicationId: string,
    requestId: string,
    baseVersion: number,
    input: unknown,
  ) {
    const command = validateOfferCommand(input);
    if (
      !applicationId ||
      applicationId.length > 256 ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        requestId,
      ) ||
      !Number.isSafeInteger(baseVersion) ||
      baseVersion < 0
    )
      throw new WorkspaceError('Use a valid offer request and version.');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ applicationId, baseVersion, command }))
      .digest('hex');
    const client = await this.pool.connect();
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
      if (
        !(
          await client.query(
            'SELECT 1 FROM applications WHERE user_id=$1 AND id=$2',
            [this.owner, applicationId],
          )
        ).rowCount
      )
        throw new WorkspaceError('Application not found.', 404);
      const retry = (
        await client.query(
          'SELECT fingerprint FROM offer_events WHERE user_id=$1 AND request_id=$2',
          [this.owner, requestId],
        )
      ).rows[0];
      if (retry) {
        if (retry.fingerprint !== fingerprint)
          throw new WorkspaceError(
            'This request was already used for different details. Refresh and start a new entry.',
            409,
          );
        await client.query('COMMIT');
        return;
      }
      const existing = (
        await client.query(
          'SELECT * FROM offers WHERE user_id=$1 AND application_id=$2',
          [this.owner, applicationId],
        )
      ).rows[0];
      if ((existing?.version ?? 0) !== baseVersion)
        throw new WorkspaceError(
          'This offer changed in another tab. Your draft is kept. Reload the saved offer, review it, then retry.',
          409,
        );
      if (!existing && command.kind !== 'terms')
        throw new WorkspaceError('Record the offer terms first.');
      if (
        existing?.state !== 'reviewing' &&
        existing &&
        (command.kind === 'terms' || command.kind === 'negotiation')
      )
        throw new WorkspaceError(
          'Choose Continue reviewing before adding revised terms or negotiation notes.',
          409,
        );
      if (command.kind === 'terms' && command.terms.documentVersionId) {
        // Existing archived links can be retained, while new choices use active library files.
        const document = (
          await client.query(
            `SELECT d.archived FROM document_versions v JOIN documents d ON d.user_id=v.user_id AND d.id=v.document_id WHERE v.user_id=$1 AND v.id=$2`,
            [this.owner, command.terms.documentVersionId],
          )
        ).rows[0];
        if (!document)
          throw new WorkspaceError('Document version not found.', 404);
        if (
          document.archived &&
          !(
            await client.query(
              'SELECT 1 FROM offer_events WHERE user_id=$1 AND application_id=$2 AND version_id=$3',
              [this.owner, applicationId, command.terms.documentVersionId],
            )
          ).rowCount
        )
          throw new WorkspaceError(
            'Restore the archived document in your library before linking it.',
            409,
          );
      }
      const version = baseVersion + 1;
      if (!existing)
        await client.query(
          "INSERT INTO offers(user_id,application_id,version,state,checklist) VALUES($1,$2,$3,'reviewing',$4)",
          [
            this.owner,
            applicationId,
            version,
            JSON.stringify(OFFER_CHECKLIST.map(() => 'Not reviewed')),
          ],
        );
      else
        await client.query(
          'UPDATE offers SET version=$3,state=$4,checklist=$5,questions=$6 WHERE user_id=$1 AND application_id=$2',
          [
            this.owner,
            applicationId,
            version,
            command.kind === 'decision' ? command.decision : existing.state,
            JSON.stringify(
              command.kind === 'review'
                ? command.checklist
                : existing.checklist,
            ),
            command.kind === 'review' ? command.questions : existing.questions,
          ],
        );
      await client.query(
        `INSERT INTO offer_events(user_id,application_id,sequence,request_id,fingerprint,kind,occurred_on,notes,terms,version_id,decision,review)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          this.owner,
          applicationId,
          version,
          requestId,
          fingerprint,
          command.kind,
          command.occurredOn,
          'notes' in command ? command.notes : '',
          command.kind === 'terms' ? JSON.stringify(command.terms) : null,
          command.kind === 'terms'
            ? command.terms.documentVersionId || null
            : null,
          command.kind === 'decision' ? command.decision : null,
          command.kind === 'review'
            ? JSON.stringify({
                checklist: command.checklist,
                questions: command.questions,
              })
            : null,
        ],
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
}
