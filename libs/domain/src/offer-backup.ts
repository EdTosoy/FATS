import {
  OFFER_CHECKLIST,
  OfferValidationError,
  validateOfferCommand,
  type Offer,
  type OfferEvent,
  type OfferCommand,
  type ReviewState,
} from './offer';
import { isIsoInstant } from './interview';
import type { WorkspaceData } from './backup';

export interface PortableOfferEvent extends OfferEvent {
  documentReference: string | null;
  review: { checklist: ReviewState[]; questions: string } | null;
}
export interface PortableOffer extends Omit<Offer, 'events'> {
  events: PortableOfferEvent[];
}
export interface PortableWorkspaceData extends WorkspaceData {
  offers: PortableOffer[];
}
export interface PortableRestoreSummary {
  career?: import('./career-backup').CareerRestoreSummary;
  mode: 'add';
  added: { applications: number; interviews: number; offers: number };
  identical: { applications: number; interviews: number; offers: number };
  conflicts: string[];
  offers: {
    applicationId: string;
    application: string;
    revisions: number;
    state: string;
  }[];
  unavailableDocuments: {
    application: string;
    sequence: number;
    reference: string;
  }[];
}
function invalid(message: string): never {
  throw new OfferValidationError(message);
}
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    invalid(
      'The offer backup contains unsupported fields or ownership information.',
    );
  return value as Record<string, unknown>;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function portableEventCommand(event: PortableOfferEvent): OfferCommand {
  return validateOfferCommand({
    kind: event.kind,
    occurredOn: event.occurredOn,
    notes: event.notes,
    terms: event.terms,
    decision: event.decision,
    confirmed: true,
    ...event.review,
  });
}
export function validatePortableOffers(
  value: unknown,
  applicationIds: Set<string>,
): PortableOffer[] {
  if (!Array.isArray(value))
    invalid('Offers must be an array in a version 2 backup.');
  const parents = new Set<string>(),
    requests = new Set<string>();
  return value.map((input) => {
    const row = object(input, [
      'applicationId',
      'version',
      'state',
      'checklist',
      'questions',
      'events',
    ]);
    if (
      typeof row.applicationId !== 'string' ||
      !applicationIds.has(row.applicationId) ||
      parents.has(row.applicationId)
    )
      invalid('An offer has a missing or duplicate application.');
    parents.add(row.applicationId);
    if (
      !Array.isArray(row.events) ||
      !row.events.length ||
      row.version !== row.events.length
    )
      invalid('Offer history must be complete and ordered.');
    let state: Offer['state'] = 'reviewing';
    let checklist: ReviewState[] = OFFER_CHECKLIST.map(() => 'Not reviewed'),
      questions = '';
    const events: PortableOfferEvent[] = row.events.map((input, index) => {
      const event = object(input, [
        'requestId',
        'sequence',
        'kind',
        'occurredOn',
        'recordedAt',
        'notes',
        'terms',
        'decision',
        'review',
        'documentReference',
      ]);
      if (
        !uuid(event.requestId) ||
        requests.has(event.requestId) ||
        event.sequence !== index + 1 ||
        !isIsoInstant(event.recordedAt) ||
        (index === 0 && event.kind !== 'terms')
      )
        invalid(
          'Offer history identifiers, timestamps, or revision ordering are invalid.',
        );
      requests.add(event.requestId);
      if (
        event.documentReference !== null &&
        (!uuid(event.documentReference) || event.kind !== 'terms')
      )
        invalid('The historical document reference is invalid.');
      if (
        (event.kind !== 'terms' && event.terms !== null) ||
        (event.kind !== 'decision' && event.decision !== null) ||
        (event.kind !== 'review' && event.review !== null)
      )
        invalid('Offer history contains inconsistent entry metadata.');
      if (event.kind === 'terms') {
        const terms = object(event.terms, [
          'receivedOn',
          'salaryAmount',
          'currency',
          'frequency',
          'employmentType',
          'arrangement',
          'location',
          'benefits',
          'startOn',
          'deadlineOn',
          'timeZone',
          'notes',
          'documentVersionId',
        ]);
        if (terms.documentVersionId !== '')
          invalid('Portable backups cannot create live document links.');
      }
      const review =
        event.kind === 'review'
          ? object(event.review, ['checklist', 'questions'])
          : null;
      const command = validateOfferCommand({
        ...event,
        confirmed: true,
        ...(review ?? {}),
      });
      if (command.kind === 'terms' || command.kind === 'negotiation') {
        if (state !== 'reviewing')
          invalid(
            'Revised terms or negotiation follow a resolved decision without reopening.',
          );
      }
      if (command.kind === 'decision') state = command.decision;
      if (command.kind === 'review') {
        if (review?.questions !== command.questions)
          invalid('Review questions must retain their validated exact values.');
        checklist = command.checklist;
        questions = command.questions;
      }
      if (
        typeof event.notes !== 'string' ||
        event.notes !== ('notes' in command ? command.notes : '')
      )
        invalid('Offer entry notes are invalid.');
      if (
        command.kind === 'terms' &&
        Object.entries(command.terms).some(
          ([key, value]) =>
            (event.terms as Record<string, unknown>)[key] !== value,
        )
      )
        invalid('Offer terms must retain their validated exact values.');
      return {
        requestId: event.requestId,
        sequence: index + 1,
        kind: command.kind,
        occurredOn: command.occurredOn,
        recordedAt: event.recordedAt,
        notes: event.notes,
        terms: command.kind === 'terms' ? command.terms : null,
        decision: command.kind === 'decision' ? command.decision : null,
        review:
          command.kind === 'review'
            ? { checklist: command.checklist, questions: command.questions }
            : null,
        documentReference: event.documentReference as string | null,
      };
    });
    if (
      row.state !== state ||
      row.questions !== questions ||
      JSON.stringify(row.checklist) !== JSON.stringify(checklist)
    )
      invalid(
        'The current offer decision or review does not match its history.',
      );
    return {
      applicationId: row.applicationId,
      version: events.length,
      state,
      checklist,
      questions,
      events,
    };
  });
}
export function planPortableRestore(
  incoming: PortableWorkspaceData,
  current: PortableWorkspaceData,
) {
  const conflicts: string[] = [];
  const identical = { applications: 0, interviews: 0, offers: 0 };
  const names = {
    applications: new Map(
      incoming.applications.map((row) => [
        row.id,
        `${row.title} · ${row.company}`,
      ]),
    ),
    interviews: new Map(incoming.interviews.map((row) => [row.id, row.title])),
    offers: new Map(
      incoming.applications.map((row) => [
        row.id,
        `${row.title} · ${row.company}`,
      ]),
    ),
  };
  function additions<T>(
    rows: T[],
    saved: T[],
    key: (row: T) => string,
    label: keyof typeof identical,
  ): T[] {
    const existing = new Map(saved.map((row) => [key(row), row]));
    return rows.filter((row) => {
      const match = existing.get(key(row));
      if (!match) return true;
      if (JSON.stringify(match) !== JSON.stringify(row))
        conflicts.push(`${label}: ${names[label].get(key(row)) ?? key(row)}`);
      else identical[label]++;
      return false;
    });
  }
  const data: PortableWorkspaceData = {
    applications: additions(
      incoming.applications,
      current.applications,
      (row) => row.id,
      'applications',
    ),
    interviews: additions(
      incoming.interviews,
      current.interviews,
      (row) => row.id,
      'interviews',
    ),
    offers: additions(
      incoming.offers,
      current.offers,
      (row) => row.applicationId,
      'offers',
    ),
  };
  const requests = new Set(
    current.offers.flatMap((offer) =>
      offer.events.map((event) => event.requestId),
    ),
  );
  for (const offer of data.offers)
    if (offer.events.some((event) => requests.has(event.requestId)))
      conflicts.push(
        `Offer history identifier: ${names.offers.get(offer.applicationId)}`,
      );
  const label = (id: string) => {
    const app = incoming.applications.find((app) => app.id === id)!;
    return `${app.title} · ${app.company}`;
  };
  const summary: PortableRestoreSummary = {
    mode: 'add',
    conflicts,
    added: {
      applications: data.applications.length,
      interviews: data.interviews.length,
      offers: data.offers.length,
    },
    identical,
    offers: incoming.offers.map((offer) => ({
      applicationId: offer.applicationId,
      application: label(offer.applicationId),
      revisions: offer.events.filter((e) => e.kind === 'terms').length,
      state: offer.state,
    })),
    unavailableDocuments: data.offers.flatMap((offer) =>
      offer.events
        .filter((event) => event.documentReference)
        .map((event) => ({
          application: label(offer.applicationId),
          sequence: event.sequence,
          reference: event.documentReference!,
        })),
    ),
  };
  return { data, summary };
}
