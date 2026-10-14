export const INTERVIEW_STAGES = [
  'HR',
  'Technical',
  'Behavioral',
  'Final',
  'Custom',
] as const;
export const INTERVIEW_STATUSES = [
  'scheduled',
  'completed',
  'cancelled',
] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export interface InterviewInput {
  applicationId: string;
  title: string;
  stage: InterviewStage;
  scheduledAt: string;
  timeZone: string;
  meetingUrl: string;
  location: string;
  preparationNotes: string;
  reflections: string;
}
export interface Interview extends InterviewInput {
  id: string;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
}
export interface InterviewRepository {
  listInterviews(applicationId?: string): Promise<Interview[]>;
  upcomingInterviews(now: string): Promise<Interview[]>;
  createInterview(input: InterviewInput): Promise<Interview>;
  updateInterview(
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ): Promise<Interview>;
}
export class InterviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterviewValidationError';
  }
}
export function validateTimeZone(timeZone: string): void {
  try {
    // Offset strings are not IANA timezone identifiers.
    if (!timeZone || /^[+-]/.test(timeZone)) throw new Error();
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
  } catch {
    throw new InterviewValidationError(
      'Enter a valid IANA timezone, such as Asia/Manila or America/New_York.',
    );
  }
}
export function isIsoInstant(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function zonedDateTime(instant: string, timeZone: string) {
  validateTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    second: get('second'),
  };
}
export function localDateTime(instant: string, timeZone: string) {
  const { date, time } = zonedDateTime(instant, timeZone);
  return { date, time };
}
// Match the requested wall time against offsets on both sides of a transition.
// Never use the host's timezone or silently roll a skipped time forward.
export function resolveInterviewTime(
  date: string,
  time: string,
  timeZone: string,
  occurrence?: 'earlier' | 'later',
): string {
  validateTimeZone(timeZone);
  const raw = `${date}T${time}:00.000Z`;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    !isIsoInstant(raw)
  )
    throw new InterviewValidationError('Enter a valid date and time.');
  const wall = Date.parse(raw);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3600000;
    const local = zonedDateTime(new Date(sample).toISOString(), timeZone);
    offsets.add(
      Date.parse(`${local.date}T${local.time}:${local.second}.000Z`) - sample,
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(wall - offset).toISOString())
    .filter((instant) => {
      const local = zonedDateTime(instant, timeZone);
      return (
        local.date === date && local.time === time && local.second === '00'
      );
    })
    .sort();
  if (!matches.length)
    throw new InterviewValidationError(
      'This time does not exist in that timezone because the clocks change. Choose another time.',
    );
  if (matches.length > 1 && !occurrence)
    throw new InterviewValidationError(
      'This time occurs twice because the clocks change. Choose the first or second occurrence.',
    );
  return occurrence === 'later' ? matches[matches.length - 1] : matches[0];
}
export function normalizeInterviewInput(input: InterviewInput): InterviewInput {
  const result: InterviewInput = {
    applicationId: input.applicationId,
    title: input.title,
    stage: input.stage,
    scheduledAt: input.scheduledAt,
    timeZone: input.timeZone,
    meetingUrl: input.meetingUrl,
    location: input.location,
    preparationNotes: input.preparationNotes,
    reflections: input.reflections,
  };
  for (const key of [
    'applicationId',
    'title',
    'timeZone',
    'meetingUrl',
    'location',
    'preparationNotes',
    'reflections',
  ] as const) {
    if (typeof result[key] !== 'string')
      throw new InterviewValidationError('Interview details must be text.');
    result[key] = result[key].trim();
  }
  if (!result.applicationId)
    throw new InterviewValidationError('Choose an existing application.');
  if (!result.title || result.title.length > 160)
    throw new InterviewValidationError(
      'Enter an interview title of 160 characters or fewer.',
    );
  if (!INTERVIEW_STAGES.includes(result.stage))
    throw new InterviewValidationError('Choose a valid interview stage.');
  if (!isIsoInstant(result.scheduledAt))
    throw new InterviewValidationError(
      'Enter a valid scheduled date and time.',
    );
  validateTimeZone(result.timeZone);
  if (!result.meetingUrl && !result.location)
    throw new InterviewValidationError(
      'Add a meeting URL or physical location.',
    );
  if (result.location.length > 500 || result.meetingUrl.length > 2048)
    throw new InterviewValidationError(
      'Use a location under 500 characters and a URL under 2,048 characters.',
    );
  if (
    result.preparationNotes.length > 20000 ||
    result.reflections.length > 20000
  )
    throw new InterviewValidationError(
      'Keep each notes field under 20,000 characters.',
    );
  if (result.meetingUrl) {
    try {
      const url = new URL(result.meetingUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new InterviewValidationError(
        'Use a complete http:// or https:// meeting URL without embedded credentials.',
      );
    }
  }
  return result;
}
export function createInterview(
  input: InterviewInput,
  id: string,
  now: string,
): Interview {
  return {
    ...normalizeInterviewInput(input),
    id,
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  };
}
export function updateInterview(
  current: Interview,
  input: InterviewInput & { status: InterviewStatus },
  now: string,
): Interview {
  if (!INTERVIEW_STATUSES.includes(input.status))
    throw new InterviewValidationError('Choose a valid interview status.');
  return {
    ...current,
    ...normalizeInterviewInput(input),
    status: input.status,
    updatedAt: now,
  };
}
export function upcomingInterviews(
  interviews: Interview[],
  now: string,
): Interview[] {
  return interviews
    .filter(
      (i) =>
        i.status === 'scheduled' &&
        Date.parse(i.scheduledAt) >= Date.parse(now),
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
export type InterviewGroup = 'Upcoming' | 'Past & completed' | 'Cancelled';
export function interviewGroup(
  interview: Interview,
  now: string,
): InterviewGroup {
  if (interview.status === 'cancelled') return 'Cancelled';
  return interview.status === 'completed' ||
    Date.parse(interview.scheduledAt) < Date.parse(now)
    ? 'Past & completed'
    : 'Upcoming';
}
