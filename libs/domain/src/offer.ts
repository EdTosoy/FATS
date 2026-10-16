export const OFFER_CHECKLIST = [
  'Salary and payment frequency',
  'Working hours and schedule',
  'Work location and arrangement',
  'Benefits and allowances',
  'Probationary period',
  'Employment start date',
  'Contract duration, if applicable',
  'Bonds or training repayment clauses, if applicable',
  'Notice or termination provisions',
  'Offer response deadline',
] as const;
export const REVIEW_STATES = [
  'Not reviewed',
  'Reviewed',
  'Need to clarify',
] as const;
export const OFFER_STATES = [
  'reviewing',
  'accepted',
  'declined',
  'withdrawn',
] as const;
export const PAY_FREQUENCIES = [
  '',
  'hourly',
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'annually',
  'other',
] as const;
export const WORK_ARRANGEMENTS = ['', 'remote', 'hybrid', 'on-site'] as const;
export type OfferState = (typeof OFFER_STATES)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export interface OfferTerms {
  receivedOn: string;
  salaryAmount: string;
  currency: string;
  frequency: (typeof PAY_FREQUENCIES)[number];
  employmentType: string;
  arrangement: (typeof WORK_ARRANGEMENTS)[number];
  location: string;
  benefits: string;
  startOn: string;
  deadlineOn: string;
  timeZone: string;
  notes: string;
  documentVersionId: string;
}
export interface OfferEvent {
  unavailableDocumentReference?: string;
  requestId: string;
  sequence: number;
  kind: 'terms' | 'negotiation' | 'decision' | 'review';
  occurredOn: string;
  recordedAt: string;
  notes: string;
  terms: OfferTerms | null;
  decision: OfferState | null;
}
export interface Offer {
  applicationId: string;
  version: number;
  state: OfferState;
  checklist: ReviewState[];
  questions: string;
  events: OfferEvent[];
}
export type OfferCommand =
  | { kind: 'terms'; occurredOn: string; notes: string; terms: OfferTerms }
  | { kind: 'negotiation'; occurredOn: string; notes: string }
  | {
      kind: 'decision';
      occurredOn: string;
      notes: string;
      decision: OfferState;
      confirmed: true;
    }
  | {
      kind: 'review';
      occurredOn: string;
      checklist: ReviewState[];
      questions: string;
    };
export class OfferValidationError extends Error {}
function fail(message: string): never {
  throw new OfferValidationError(message);
}
function text(value: unknown, label: string, max = 5000) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    fail(`Enter valid ${label} (up to ${max} characters).`);
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Enter valid offer details.');
  return value as Record<string, unknown>;
}
export function offerDate(value: unknown, label: string, optional = false) {
  if (optional && value === '') return '';
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '1900-01-01' ||
    value > '2200-12-31' ||
    !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value
  )
    fail(`Choose a valid ${label}.`);
  return value;
}
export function exactOfferAmount(value: unknown) {
  if (value === '') return '';
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/.test(value)
  )
    fail(
      'Enter a nonnegative salary with up to 14 whole digits and 4 decimal places, without commas.',
    );
  return value.includes('.')
    ? value.replace(/0+$/, '').replace(/\.$/, '')
    : value;
}
export function validateOfferTerms(input: unknown): OfferTerms {
  const v = object(input);
  const currency = text(v.currency, 'currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    fail('Enter a three-letter currency code, such as PHP.');
  const timeZone = text(v.timeZone, 'timezone', 100);
  try {
    if (!timeZone || /^[+-]/.test(timeZone)) throw new Error();
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    fail('Choose a valid IANA timezone.');
  }
  if (
    !PAY_FREQUENCIES.includes(v.frequency as OfferTerms['frequency']) ||
    !WORK_ARRANGEMENTS.includes(v.arrangement as OfferTerms['arrangement'])
  )
    fail('Choose a supported payment frequency and work arrangement.');
  const documentVersionId = text(v.documentVersionId, 'document version', 36);
  if (
    documentVersionId &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      documentVersionId,
    )
  )
    fail('Choose an existing document version.');
  return {
    receivedOn: offerDate(v.receivedOn, 'date received'),
    salaryAmount: exactOfferAmount(v.salaryAmount),
    currency,
    frequency: v.frequency as OfferTerms['frequency'],
    employmentType: text(v.employmentType, 'employment type', 160),
    arrangement: v.arrangement as OfferTerms['arrangement'],
    location: text(v.location, 'work location', 500),
    benefits: text(v.benefits, 'benefits'),
    startOn: offerDate(v.startOn, 'start date', true),
    deadlineOn: offerDate(v.deadlineOn, 'response deadline', true),
    timeZone,
    notes: text(v.notes, 'contract notes'),
    documentVersionId,
  };
}
export function validateOfferCommand(input: unknown): OfferCommand {
  const v = object(input),
    occurredOn = offerDate(v.occurredOn, 'entry date');
  switch (v.kind) {
    case 'terms':
      return {
        kind: 'terms',
        occurredOn,
        notes: text(v.notes, 'revision note'),
        terms: validateOfferTerms(v.terms),
      };
    case 'negotiation': {
      const notes = text(v.notes, 'negotiation note');
      if (!notes) fail('Add a brief negotiation note.');
      return { kind: 'negotiation', occurredOn, notes };
    }
    case 'decision':
      if (
        v.confirmed !== true ||
        !OFFER_STATES.includes(v.decision as OfferState)
      )
        fail('Confirm the decision you want to record.');
      return {
        kind: 'decision',
        occurredOn,
        notes: text(v.notes, 'decision notes'),
        decision: v.decision as OfferState,
        confirmed: true,
      };
    case 'review':
      if (
        !Array.isArray(v.checklist) ||
        v.checklist.length !== OFFER_CHECKLIST.length ||
        !v.checklist.every((x) => REVIEW_STATES.includes(x))
      )
        fail('Choose a review state for each checklist item.');
      return {
        kind: 'review',
        occurredOn,
        checklist: v.checklist as ReviewState[],
        questions: text(v.questions, 'questions for HR'),
      };
    default:
      return fail('Choose a supported offer action.');
  }
}
export function latestOfferTerms(offer: Offer) {
  return (
    [...offer.events].reverse().find((event) => event.terms)?.terms ?? null
  );
}
export function offerToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function offerDeadline(terms: OfferTerms, now = new Date()) {
  if (!terms.deadlineOn) return null;
  const today = offerToday(terms.timeZone, now);
  const days =
    (Date.parse(terms.deadlineOn + 'T00:00:00Z') -
      Date.parse(today + 'T00:00:00Z')) /
    86400000;
  return {
    tone: days < 0 ? 'passed' : days <= 3 ? 'soon' : 'upcoming',
    label:
      days < 0
        ? 'Response deadline passed · check with HR'
        : days === 0
          ? 'Response due today'
          : days === 1
            ? 'Response due tomorrow'
            : `Response due ${terms.deadlineOn}`,
    days,
  };
}
export function offerSalary(terms: OfferTerms) {
  return terms.salaryAmount === ''
    ? 'Salary not recorded'
    : `${terms.currency} ${terms.salaryAmount}${terms.frequency ? ` / ${terms.frequency}` : ' · frequency unspecified'}`;
}
