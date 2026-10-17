import {
  CareerValidationError,
  CAREER_LIMITS,
  careerObject,
  careerUuid,
  normalizeCareerChange,
  normalizeEmployment,
  type CareerEmployment,
  type CareerEvent,
} from './career';
import { isIsoInstant } from './interview';
import {
  planPortableRestore,
  type PortableWorkspaceData,
  type PortableRestoreSummary,
} from './offer-backup';
export interface CareerWorkspaceData extends PortableWorkspaceData {
  employments: CareerEmployment[];
}
export interface CareerRestoreSummary {
  total: number;
  added: number;
  identical: number;
  documents: number;
  unavailableDocuments: number;
}
function invalid(message: string): never {
  throw new CareerValidationError(message);
}
function exactDetails(raw: unknown, valid: object) {
  if (
    !raw ||
    Object.entries(valid).some(
      ([key, value]) => (raw as Record<string, unknown>)[key] !== value,
    )
  )
    invalid('Career Vault history must retain its exact validated values.');
}
export function validatePortableEmployments(
  value: unknown,
  workspace: PortableWorkspaceData,
): CareerEmployment[] {
  if (!Array.isArray(value) || value.length > CAREER_LIMITS.employments)
    invalid('Career Vault must contain at most 50 employment records.');
  const ids = new Set<string>(),
    requests = new Set<string>(),
    documentParents = new Map<string, string>();
  const apps = new Set(workspace.applications.map((app) => app.id));
  const offers = new Set(
    workspace.offers
      .filter((offer) =>
        offer.events.some(
          (event) => event.kind === 'decision' && event.decision === 'accepted',
        ),
      )
      .map((offer) => offer.applicationId),
  );
  const sourceApplications = new Set<string>();
  const identities = new Set<string>();
  return value.map((input) => {
    const row = careerObject(input, [
      'id',
      'version',
      'createdAt',
      'updatedAt',
      'details',
      'events',
    ]);
    if (
      !careerUuid(row.id) ||
      ids.has(row.id) ||
      !isIsoInstant(row.createdAt) ||
      !isIsoInstant(row.updatedAt)
    )
      invalid(
        'Employment identifiers or timestamps are invalid or duplicated.',
      );
    ids.add(row.id);
    if (
      !Array.isArray(row.events) ||
      !row.events.length ||
      row.events.length > CAREER_LIMITS.events ||
      row.version !== row.events.length
    )
      invalid(
        'Career Vault history must be complete, ordered and no longer than 100 entries per employment.',
      );
    let latest: ReturnType<typeof normalizeEmployment> | undefined;
    const documents = new Set<string>();
    const events: CareerEvent[] = row.events.map((input, index) => {
      const event = careerObject(input, [
        'requestId',
        'sequence',
        'recordedAt',
        'kind',
        'documentId',
        'details',
        'documentReference',
      ]);
      if (
        !careerUuid(event.requestId) ||
        requests.has(event.requestId) ||
        event.sequence !== index + 1 ||
        !isIsoInstant(event.recordedAt) ||
        (index === 0 && event.kind !== 'employment')
      )
        invalid(
          'Career Vault history identifiers, timestamps or order are invalid.',
        );
      requests.add(event.requestId);
      const change = normalizeCareerChange({
        kind: event.kind,
        documentId: event.documentId,
        details: event.details,
      });
      exactDetails(event.details, change.details);
      if (change.kind === 'employment') {
        if (
          (change.details.applicationId &&
            !apps.has(change.details.applicationId)) ||
          (change.details.fromAcceptedOffer &&
            !offers.has(change.details.applicationId))
        )
          invalid(
            'An employment association has a missing application or accepted-offer history.',
          );
        if (event.documentReference !== null)
          invalid(
            'Only document entries may retain an unlinked file reference.',
          );
        latest = change.details;
      } else {
        if (change.details.documentVersionId)
          invalid(
            'Portable Career Vault metadata cannot create live file links.',
          );
        if (
          event.documentReference !== null &&
          !careerUuid(event.documentReference)
        )
          invalid('An unlinked document reference is invalid.');
        if (
          documentParents.has(change.documentId) &&
          documentParents.get(change.documentId) !== row.id
        )
          invalid('A document entry cannot belong to two employments.');
        documentParents.set(change.documentId, row.id as string);
        documents.add(change.documentId);
      }
      if (
        index > 0 &&
        event.recordedAt <
          (row.events as { recordedAt: string }[])[index - 1].recordedAt
      )
        invalid('Career Vault recorded timestamps must be ordered.');
      return {
        ...change,
        requestId: event.requestId,
        sequence: index + 1,
        recordedAt: event.recordedAt,
        documentReference: event.documentReference as string | null,
      };
    });
    const details = normalizeEmployment(row.details);
    exactDetails(row.details, details);
    const identity = JSON.stringify([
      details.employer.toLowerCase(),
      details.title.toLowerCase(),
      details.startOn,
    ]);
    if (identities.has(identity))
      invalid('The backup contains possible duplicate employment records.');
    identities.add(identity);
    if (
      JSON.stringify(latest) !== JSON.stringify(details) ||
      row.createdAt !== events[0].recordedAt ||
      row.updatedAt !== events.at(-1)!.recordedAt ||
      documents.size > CAREER_LIMITS.documents
    )
      invalid(
        'Employment details, dates or document counts do not match their history.',
      );
    if (details.applicationId && sourceApplications.has(details.applicationId))
      invalid('An application is associated with more than one employment.');
    if (details.applicationId) sourceApplications.add(details.applicationId);
    return {
      id: row.id,
      version: events.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      details,
      events,
    };
  });
}
export function portableEmployments(
  records: CareerEmployment[],
): CareerEmployment[] {
  return records.map((record) => ({
    ...record,
    events: record.events.map((event) =>
      event.kind === 'document'
        ? {
            ...event,
            details: { ...event.details, documentVersionId: '' },
            documentReference:
              event.documentReference ??
              (event.details.documentVersionId || null),
          }
        : event,
    ),
  }));
}
export function planCareerRestore(
  incoming: CareerWorkspaceData,
  current: CareerWorkspaceData,
) {
  const base = planPortableRestore(incoming, current);
  const existing = new Map(current.employments.map((row) => [row.id, row]));
  const requests = new Set(
    current.employments.flatMap((row) =>
      row.events.map((event) => event.requestId),
    ),
  );
  const parents = new Map(
    current.employments
      .filter((row) => row.details.applicationId)
      .map((row) => [row.details.applicationId, row.id]),
  );
  const documentParents = new Map(
    current.employments.flatMap((row) =>
      row.events
        .filter((event) => event.kind === 'document')
        .map((event) => [event.documentId, row.id]),
    ),
  );
  let identical = 0;
  const employments = incoming.employments.filter((record) => {
    const saved = existing.get(record.id),
      label = `Career Vault: ${record.details.title} · ${record.details.employer}`;
    if (saved) {
      if (JSON.stringify(saved) === JSON.stringify(record)) identical++;
      else base.summary.conflicts.push(label);
      return false;
    }
    if (
      record.events.some(
        (event) =>
          requests.has(event.requestId) ||
          (event.documentId && documentParents.has(event.documentId)),
      ) ||
      (record.details.applicationId &&
        parents.has(record.details.applicationId))
    )
      base.summary.conflicts.push(label);
    // Different IDs for the same employer/title/start are potential duplicates,
    // never an instruction to overwrite or silently merge a user's job history.
    if (
      current.employments.some(
        (row) =>
          row.details.employer.toLowerCase() ===
            record.details.employer.toLowerCase() &&
          row.details.title.toLowerCase() ===
            record.details.title.toLowerCase() &&
          row.details.startOn === record.details.startOn,
      )
    )
      base.summary.conflicts.push(`${label} (possible duplicate)`);
    return true;
  });
  const career: CareerRestoreSummary = {
    total: incoming.employments.length,
    added: employments.length,
    identical,
    documents: incoming.employments.reduce(
      (sum, row) =>
        sum +
        new Set(
          row.events
            .filter((event) => event.kind === 'document')
            .map((event) => event.documentId),
        ).size,
      0,
    ),
    unavailableDocuments: employments.reduce(
      (sum, row) =>
        sum + row.events.filter((event) => event.documentReference).length,
      0,
    ),
  };
  if (
    current.employments.length + employments.length >
    CAREER_LIMITS.employments
  )
    base.summary.conflicts.push(
      'Career Vault supports up to 50 employment records, including archived records.',
    );
  return {
    data: { ...base.data, employments },
    summary: { ...base.summary, career } as PortableRestoreSummary & {
      career: CareerRestoreSummary;
    },
  };
}
