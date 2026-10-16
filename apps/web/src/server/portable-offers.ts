import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  validatePortableOffers,
  portableEventCommand,
  type PortableOffer,
} from '@fats/domain';

// Called only within an owner-locked workspace transaction. No byte-store reads,
// downloads, or source-account lookups are needed for portable JSON recovery.
export async function readPortableOffers(
  client: PoolClient,
  owner: string,
): Promise<PortableOffer[]> {
  const headers = (
    await client.query(
      'SELECT * FROM offers WHERE user_id=$1 ORDER BY application_id',
      [owner],
    )
  ).rows;
  const entries = (
    await client.query(
      'SELECT * FROM offer_events WHERE user_id=$1 ORDER BY application_id,sequence',
      [owner],
    )
  ).rows;
  return validatePortableOffers(
    headers.map((row) => ({
      applicationId: row.application_id,
      version: row.version,
      state: row.state,
      checklist: row.checklist,
      questions: row.questions,
      events: entries
        .filter((event) => event.application_id === row.application_id)
        .map((event) => ({
          requestId: event.request_id,
          sequence: event.sequence,
          kind: event.kind,
          occurredOn: event.occurred_on,
          recordedAt: event.recorded_at.toISOString(),
          notes: event.notes,
          terms: event.terms ? { ...event.terms, documentVersionId: '' } : null,
          decision: event.decision,
          review: event.review,
          documentReference:
            event.source_version_id ?? event.version_id ?? null,
        })),
    })),
    new Set(headers.map((row) => row.application_id)),
  );
}
export async function insertPortableOffer(
  client: PoolClient,
  owner: string,
  offer: PortableOffer,
) {
  await client.query(
    'INSERT INTO offers(user_id,application_id,version,state,checklist,questions) VALUES($1,$2,$3,$4,$5,$6)',
    [
      owner,
      offer.applicationId,
      offer.version,
      offer.state,
      JSON.stringify(offer.checklist),
      offer.questions,
    ],
  );
  for (const event of offer.events) {
    const command = portableEventCommand(event);
    // Preserve the original request fingerprint semantics without exporting an
    // internal digest or treating the old version ID as an authorized link.
    if (command.kind === 'terms')
      command.terms.documentVersionId = event.documentReference ?? '';
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          applicationId: offer.applicationId,
          baseVersion: event.sequence - 1,
          command,
        }),
      )
      .digest('hex');
    await client.query(
      `INSERT INTO offer_events(user_id,application_id,sequence,request_id,fingerprint,kind,occurred_on,recorded_at,notes,terms,version_id,decision,review,source_version_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$13)`,
      [
        owner,
        offer.applicationId,
        event.sequence,
        event.requestId,
        fingerprint,
        event.kind,
        event.occurredOn,
        event.recordedAt,
        event.notes,
        event.terms ? JSON.stringify(event.terms) : null,
        event.decision,
        event.review ? JSON.stringify(event.review) : null,
        event.documentReference,
      ],
    );
  }
}
