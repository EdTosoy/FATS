export const APPLICATION_STATUSES = [
  'Saved',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_WORK_ARRANGEMENTS = [
  'remote',
  'hybrid',
  'onsite',
] as const;
export const PAYMENT_PERIODS = [
  'hour',
  'day',
  'week',
  'month',
  'year',
] as const;
export interface ApplicationActivity {
  kind: 'note' | 'milestone' | 'recruiter-response' | 'status';
  date: string;
  notes: string;
}
export interface TrackingFields {
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  paymentPeriod?: '' | (typeof PAYMENT_PERIODS)[number];
  workArrangement?: string;
  seniority?: string;
  technologies?: string;
  qualifications?: string;
  postingDate?: string;
  lastCheckedDate?: string;
  applicationDate?: string;
  applicationChannel?: string;
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
  notes?: string;
  fitNotes?: string;
}
export const TRACKING_TEXT_FIELDS = [
  'currency',
  'seniority',
  'technologies',
  'qualifications',
  'postingDate',
  'lastCheckedDate',
  'applicationDate',
  'applicationChannel',
  'recruiterName',
  'recruiterEmail',
  'recruiterPhone',
  'notes',
  'fitNotes',
] as const;
export function normalizeTracking(input: TrackingFields): TrackingFields {
  const result: TrackingFields = {};
  for (const key of TRACKING_TEXT_FIELDS) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > 20000)
      throw new ApplicationValidationError(
        'Tracking fields must be text under 20,000 characters.',
      );
    result[key] = input[key].trim();
  }
  for (const key of [
    'postingDate',
    'lastCheckedDate',
    'applicationDate',
  ] as const) {
    const value = result[key];
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new ApplicationValidationError('Enter a valid calendar date.');
  }
  for (const key of ['salaryMin', 'salaryMax'] as const) {
    const value = input[key];
    if (value === null) {
      result[key] = null;
      continue;
    }
    if (value !== undefined) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1e12
      )
        throw new ApplicationValidationError(
          'Salary must be a non-negative number up to one trillion.',
        );
      result[key] = value;
    }
  }
  if (
    result.salaryMin != null &&
    result.salaryMax != null &&
    result.salaryMin > result.salaryMax
  )
    throw new ApplicationValidationError(
      'Minimum salary cannot exceed maximum salary.',
    );
  if (result.currency && !/^[A-Za-z]{3}$/.test(result.currency))
    throw new ApplicationValidationError('Use a three-letter currency code.');
  if (result.currency) result.currency = result.currency.toUpperCase();
  if (
    result.recruiterEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.recruiterEmail)
  )
    throw new ApplicationValidationError('Enter a valid contact email.');
  if (input.workArrangement !== undefined) {
    if (typeof input.workArrangement !== 'string')
      throw new ApplicationValidationError('Choose a valid work arrangement.');
    const arrangement = input.workArrangement.toLowerCase();
    if (
      arrangement !== '' &&
      !APPLICATION_WORK_ARRANGEMENTS.some((value) => value === arrangement)
    )
      throw new ApplicationValidationError('Choose a valid work arrangement.');
    result.workArrangement = arrangement;
  }
  if (input.paymentPeriod !== undefined) {
    if (
      input.paymentPeriod !== '' &&
      !PAYMENT_PERIODS.includes(input.paymentPeriod)
    )
      throw new ApplicationValidationError('Choose a valid payment period.');
    result.paymentPeriod = input.paymentPeriod;
  }
  return result;
}
export function validateApplicationActivities(
  value: unknown,
): ApplicationActivity[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new ApplicationValidationError('Use at most 1,000 activity entries.');
  return value.map((item) => {
    if (
      !item ||
      !['note', 'milestone', 'recruiter-response', 'status'].includes(
        item.kind,
      ) ||
      typeof item.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(Date.parse(item.date)) ||
      new Date(item.date).toISOString().slice(0, 10) !== item.date ||
      typeof item.notes !== 'string' ||
      !item.notes.trim() ||
      item.notes.length > 20000
    )
      throw new ApplicationValidationError(
        'Activity requires a valid type, date, and notes under 20,000 characters.',
      );
    return { kind: item.kind, date: item.date, notes: item.notes.trim() };
  });
}

export interface ApplicationInput extends TrackingFields {
  newActivity?: ApplicationActivity;
  title: string;
  company: string;
  sourceUrl: string;
  location: string;
  description: string;
}

export interface JobApplication extends ApplicationInput {
  id: string;
  activities?: ApplicationActivity[];
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRepository {
  createCapturedApplication(
    capture: import('./capture').JobCapture,
    input: ApplicationInput,
  ): Promise<JobApplication>;
  deleteApplication(id: string): Promise<void>;
  list(): Promise<JobApplication[]>;
  create(input: ApplicationInput): Promise<JobApplication>;
  update(
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ): Promise<JobApplication>;
}

export class ApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationValidationError';
  }
}

export function isApplicationStatus(
  value: unknown,
): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((status) => status === value);
}

export function normalizeApplicationInput(
  input: ApplicationInput,
): ApplicationInput {
  const result = {
    ...normalizeTracking(input),
    title: input.title.trim(),
    company: input.company.trim(),
    sourceUrl: input.sourceUrl.trim(),
    location: input.location.trim(),
    description: input.description.trim(),
  };
  for (const [field, label] of [
    ['title', 'Job title'],
    ['company', 'Company'],
    ['sourceUrl', 'Source URL'],
    ['location', 'Location'],
  ] as const) {
    if (!result[field])
      throw new ApplicationValidationError(`${label} is required.`);
  }
  if (
    result.title.length > 160 ||
    result.company.length > 160 ||
    result.location.length > 160
  ) {
    throw new ApplicationValidationError(
      'Job title, company, and location must be 160 characters or fewer.',
    );
  }
  if (result.sourceUrl.length > 2048 || result.description.length > 20000) {
    throw new ApplicationValidationError(
      'Use a shorter URL or a description under 20,000 characters.',
    );
  }
  let url: URL;
  try {
    url = new URL(result.sourceUrl);
  } catch {
    throw new ApplicationValidationError(
      'Enter a complete job link starting with https:// or http://.',
    );
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new ApplicationValidationError(
      'Use an http:// or https:// job link without embedded credentials.',
    );
  }
  return result;
}

export function createApplication(
  input: ApplicationInput,
  id: string,
  now: string,
): JobApplication {
  return {
    ...normalizeApplicationInput(input),
    ...(input.newActivity
      ? { activities: validateApplicationActivities([input.newActivity]) }
      : {}),
    id,
    status: 'Saved',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateApplication(
  application: JobApplication,
  input: ApplicationInput & { status: ApplicationStatus },
  now: string,
): JobApplication {
  if (!isApplicationStatus(input.status))
    throw new ApplicationValidationError('Choose a valid application status.');
  return {
    ...application,
    ...normalizeApplicationInput({
      ...application,
      ...Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ),
    }),
    ...(input.newActivity || input.status !== application.status
      ? {
          activities: validateApplicationActivities([
            ...(application.activities ?? []),
            ...(input.newActivity ? [input.newActivity] : []),
            ...(input.status !== application.status
              ? [
                  {
                    kind: 'status',
                    date: now.slice(0, 10),
                    notes: `${application.status} → ${input.status}`,
                  },
                ]
              : []),
          ]),
        }
      : {}),
    status: input.status,
    updatedAt: now,
  };
}

export function filterApplications(
  applications: JobApplication[],
  query: string,
  status: ApplicationStatus | 'All',
): JobApplication[] {
  const search = query.trim().toLocaleLowerCase();
  return applications.filter(
    (application) =>
      (status === 'All' || application.status === status) &&
      [
        application.title,
        application.company,
        application.location,
        application.description,
        ...TRACKING_TEXT_FIELDS.map((key) => application[key] ?? ''),
        application.workArrangement ?? '',
      ].some((value) => value.toLocaleLowerCase().includes(search)),
  );
}

export function applicationStatistics(applications: JobApplication[]) {
  return {
    total: applications.length,
    saved: applications.filter((application) => application.status === 'Saved')
      .length,
    active: applications.filter((application) =>
      ['Applied', 'Assessment', 'Interview'].includes(application.status),
    ).length,
    offers: applications.filter((application) => application.status === 'Offer')
      .length,
  };
}
