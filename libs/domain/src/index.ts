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

export interface ApplicationInput {
  title: string;
  company: string;
  sourceUrl: string;
  location: string;
  description: string;
}

export interface JobApplication extends ApplicationInput {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRepository {
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
    ...normalizeApplicationInput(input),
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
