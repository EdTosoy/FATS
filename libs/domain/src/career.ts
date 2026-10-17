import { offerDate, WORK_ARRANGEMENTS } from './offer';

export const EMPLOYMENT_STATES = [
  'Not started',
  'Current',
  'Previous',
] as const;
export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Temporary',
  'Other',
] as const;
export const EMPLOYMENT_DOCUMENT_CATEGORIES = [
  'Employment contract',
  'Certificate of Employment (COE)',
  'BIR Form 2316',
  'Resignation letter',
  'Clearance documentation',
  'Final-pay documentation',
  'Payslip',
  'Other employment records',
] as const;
export const EMPLOYMENT_DOCUMENT_STATES = [
  'Not requested',
  'Requested',
  'Received',
  'Not applicable',
] as const;
export const CAREER_LIMITS = {
  employments: 50,
  events: 100,
  documents: 30,
} as const;
export class CareerValidationError extends Error {}
export const careerUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export interface EmploymentInput {
  employer: string;
  title: string;
  employmentType: (typeof EMPLOYMENT_TYPES)[number];
  status: (typeof EMPLOYMENT_STATES)[number];
  startOn: string;
  endOn: string;
  location: string;
  arrangement: (typeof WORK_ARRANGEMENTS)[number];
  notes: string;
  applicationId: string;
  fromAcceptedOffer: boolean;
  archived: boolean;
}
export interface EmploymentDocumentInput {
  category: (typeof EMPLOYMENT_DOCUMENT_CATEGORIES)[number];
  name: string;
  status: (typeof EMPLOYMENT_DOCUMENT_STATES)[number];
  requestedOn: string;
  issuedOn: string;
  taxYear: string;
  followUpOn: string;
  notes: string;
  documentVersionId: string;
}
export type CareerChange =
  | { kind: 'employment'; documentId: null; details: EmploymentInput }
  | { kind: 'document'; documentId: string; details: EmploymentDocumentInput };
export type CareerEvent = CareerChange & {
  requestId: string;
  sequence: number;
  recordedAt: string;
  documentReference: string | null;
};
export interface CareerEmployment {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  details: EmploymentInput;
  events: CareerEvent[];
}
export const emptyEmployment = (): EmploymentInput => ({
  employer: '',
  title: '',
  employmentType: 'Full-time',
  status: 'Not started',
  startOn: '',
  endOn: '',
  location: '',
  arrangement: '',
  notes: '',
  applicationId: '',
  fromAcceptedOffer: false,
  archived: false,
});
export const emptyEmploymentDocument = (): EmploymentDocumentInput => ({
  category: 'Employment contract',
  name: '',
  status: 'Not requested',
  requestedOn: '',
  issuedOn: '',
  taxYear: '',
  followUpOn: '',
  notes: '',
  documentVersionId: '',
});
export function careerObject(
  value: unknown,
  fields: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new CareerValidationError(
      'Send only supported Career Vault details, without ownership or storage information.',
    );
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new CareerValidationError(
      `Enter valid ${label} (up to ${max} characters).`,
    );
  const result = value.trim();
  if (required && !result) throw new CareerValidationError(`Enter ${label}.`);
  return result;
}
function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (!options.includes(value as T))
    throw new CareerValidationError(`Choose a valid ${label}.`);
  return value as T;
}
function date(value: unknown, label: string, optional = true) {
  try {
    return offerDate(value, label, optional);
  } catch {
    throw new CareerValidationError(`Choose a valid ${label}.`);
  }
}
export function normalizeEmployment(value: unknown): EmploymentInput {
  const row = careerObject(value, Object.keys(emptyEmployment()));
  const employer = text(row.employer, 'employer name', 200, true),
    title = text(row.title, 'job title', 200, true);
  const status = choice(row.status, EMPLOYMENT_STATES, 'employment status');
  const startOn = date(row.startOn, 'start date', status === 'Not started'),
    endOn = date(row.endOn, 'end date', status !== 'Previous');
  if (status !== 'Previous' && endOn)
    throw new CareerValidationError(
      'Only previous employment has an end date.',
    );
  if (endOn && startOn && endOn < startOn)
    throw new CareerValidationError(
      'The end date must be on or after the start date.',
    );
  const applicationId = text(row.applicationId, 'application reference', 256);
  if (
    typeof row.fromAcceptedOffer !== 'boolean' ||
    typeof row.archived !== 'boolean' ||
    (row.fromAcceptedOffer && !applicationId)
  )
    throw new CareerValidationError(
      'Choose an application before linking an accepted offer.',
    );
  return {
    employer,
    title,
    employmentType: choice(
      row.employmentType,
      EMPLOYMENT_TYPES,
      'employment type',
    ),
    status,
    startOn,
    endOn,
    location: text(row.location, 'location', 200),
    arrangement: choice(row.arrangement, WORK_ARRANGEMENTS, 'work arrangement'),
    notes: text(row.notes, 'employment notes', 2000),
    applicationId,
    fromAcceptedOffer: row.fromAcceptedOffer,
    archived: row.archived,
  };
}
export function normalizeEmploymentDocument(
  value: unknown,
): EmploymentDocumentInput {
  const row = careerObject(value, Object.keys(emptyEmploymentDocument()));
  const category = choice(
      row.category,
      EMPLOYMENT_DOCUMENT_CATEGORIES,
      'document category',
    ),
    taxYear = text(row.taxYear, 'tax year', 4);
  if (
    taxYear &&
    (!/^\d{4}$/.test(taxYear) || taxYear < '1900' || taxYear > '2200')
  )
    throw new CareerValidationError(
      'Enter a four-digit tax year between 1900 and 2200.',
    );
  if (taxYear && category !== 'BIR Form 2316' && category !== 'Payslip')
    throw new CareerValidationError(
      'A tax year is only used for BIR Form 2316 or a payslip.',
    );
  const documentVersionId = text(row.documentVersionId, 'document version', 36);
  if (documentVersionId && !careerUuid(documentVersionId))
    throw new CareerValidationError('Choose an available document version.');
  return {
    category,
    name: text(row.name, 'document label', 200),
    status: choice(
      row.status,
      EMPLOYMENT_DOCUMENT_STATES,
      'document tracking status',
    ),
    requestedOn: date(row.requestedOn, 'request date'),
    issuedOn: date(row.issuedOn, 'issue date'),
    taxYear,
    followUpOn: date(row.followUpOn, 'follow-up date'),
    notes: text(row.notes, 'document notes', 2000),
    documentVersionId,
  };
}
export function normalizeCareerChange(value: unknown): CareerChange {
  const row = careerObject(value, ['kind', 'documentId', 'details']);
  if (row.kind === 'employment' && row.documentId === null)
    return {
      kind: 'employment',
      documentId: null,
      details: normalizeEmployment(row.details),
    };
  if (row.kind === 'document' && careerUuid(row.documentId))
    return {
      kind: 'document',
      documentId: row.documentId,
      details: normalizeEmploymentDocument(row.details),
    };
  throw new CareerValidationError(
    'Choose valid employment or document details.',
  );
}
export function employmentDocuments(record: CareerEmployment) {
  const documents = new Map<
    string,
    {
      id: string;
      details: EmploymentDocumentInput;
      history: CareerEvent[];
      documentReference: string | null;
    }
  >();
  for (const event of record.events)
    if (event.kind === 'document') {
      const previous = documents.get(event.documentId);
      documents.set(event.documentId, {
        id: event.documentId,
        details: event.details,
        documentReference: event.documentReference,
        history: [...(previous?.history ?? []), event],
      });
    }
  return [...documents.values()];
}
