import {
  isIsoInstant,
  resolveInterviewTime,
  validateTimeZone,
  localDateTime,
  type Interview,
} from './interview';
import { latestOfferTerms, type Offer } from './offer';
import {
  validateApplicationActivities,
  type JobApplication,
} from './application';
export interface TaskInput {
  title: string;
  notes: string;
  dueDate: string;
  dueTime: string;
  timeZone: string;
  occurrence: '' | 'earlier' | 'later';
}
export interface ApplicationTask extends TaskInput {
  id: string;
  dueAt: string | null;
  state: 'pending' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type TaskChange =
  | {
      action: 'save';
      id: string;
      input: TaskInput;
      expected: ApplicationTask | null;
    }
  | {
      action: 'complete' | 'reopen' | 'delete';
      id: string;
      expected: ApplicationTask;
    };
export interface TaskRepository {
  changeTask(
    applicationId: string,
    change: TaskChange,
  ): Promise<JobApplication>;
}
export class TaskError extends Error {}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TaskError('Enter valid task details.');
  return value as Record<string, unknown>;
}
export function normalizeTask(
  value: unknown,
): TaskInput & { dueAt: string | null } {
  const row = object(value);
  for (const field of [
    'title',
    'notes',
    'dueDate',
    'dueTime',
    'timeZone',
    'occurrence',
  ])
    if (typeof row[field] !== 'string')
      throw new TaskError('Task fields must be text.');
  const title = (row.title as string).trim(),
    notes = row.notes as string,
    dueDate = row.dueDate as string,
    dueTime = row.dueTime as string,
    timeZone = (row.timeZone as string).trim(),
    occurrence = row.occurrence as TaskInput['occurrence'];
  if (!title || title.length > 160 || notes.length > 20000)
    throw new TaskError(
      'Use a task title of 1–160 characters and notes of at most 20,000 characters.',
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !Number.isFinite(Date.parse(dueDate)) ||
    new Date(dueDate).toISOString().slice(0, 10) !== dueDate
  )
    throw new TaskError('Choose a valid due date.');
  if (!['', 'earlier', 'later'].includes(occurrence))
    throw new TaskError('Choose a valid clock-time occurrence.');
  validateTimeZone(timeZone);
  const dueAt = dueTime
    ? resolveInterviewTime(dueDate, dueTime, timeZone, occurrence || undefined)
    : null;
  return {
    title,
    notes,
    dueDate,
    dueTime,
    timeZone,
    occurrence: dueTime ? occurrence : '',
    dueAt,
  };
}
export function validateTasks(value: unknown): ApplicationTask[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new TaskError('Keep at most 100 tasks per application.');
  const result = value.map((value) => {
    const row = object(value),
      input = normalizeTask(row);
    if (
      typeof row.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(row.id) ||
      !['pending', 'completed'].includes(row.state as string) ||
      !isIsoInstant(row.createdAt) ||
      !isIsoInstant(row.updatedAt) ||
      row.createdAt > row.updatedAt ||
      row.dueAt !== input.dueAt
    )
      throw new TaskError('Task identity, state or timestamps are invalid.');
    if (
      row.state === 'completed'
        ? !isIsoInstant(row.completedAt) ||
          row.completedAt < row.createdAt ||
          row.completedAt > row.updatedAt
        : row.completedAt !== null
    )
      throw new TaskError('Task completion timestamp is invalid.');
    return {
      ...input,
      id: row.id,
      state: row.state as ApplicationTask['state'],
      completedAt: row.completedAt as string | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
  if (new Set(result.map((row) => row.id)).size !== result.length)
    throw new TaskError('Task IDs must be unique per application.');
  return result;
}
export function changeApplicationTask(
  application: JobApplication,
  value: TaskChange,
  now: string,
): JobApplication {
  const change = object(value);
  if (!isIsoInstant(now)) throw new TaskError('Task save time is invalid.');
  const tasks = application.tasks ?? [],
    current = tasks.find((row) => row.id === change.id);
  const expected =
    change.expected === null ? null : validateTasks([change.expected])[0];
  if (JSON.stringify(expected) !== JSON.stringify(current ?? null))
    throw new TaskError(
      'This task changed in another tab. Keep your inputs and reopen the saved task before retrying.',
    );
  let next: ApplicationTask | undefined;
  if (change.action === 'save')
    next = {
      ...normalizeTask(change.input),
      id: change.id as string,
      state: current?.state ?? 'pending',
      completedAt: current?.completedAt ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
  else if (['complete', 'reopen', 'delete'].includes(change.action as string)) {
    if (!current) throw new TaskError('Task not found.');
    if (change.action !== 'delete')
      next = {
        ...current,
        state: change.action === 'complete' ? 'completed' : 'pending',
        completedAt: change.action === 'complete' ? now : null,
        updatedAt: now,
      };
  } else throw new TaskError('Choose a valid task action.');
  const updated = current
    ? tasks.filter((row) => row.id !== current.id)
    : tasks;
  const result = {
    ...application,
    tasks: validateTasks(next ? [...updated, next] : updated),
    updatedAt: now,
  };
  if (current && next && current.state !== next.state)
    result.activities = validateApplicationActivities([
      ...(application.activities ?? []),
      {
        kind: 'milestone',
        date: now.slice(0, 10),
        notes: `${next.state === 'completed' ? 'Completed' : 'Reopened'} task: ${next.title}`,
      },
    ]);
  return result;
}
export type TaskGroup = 'Overdue' | 'Due today' | 'Upcoming' | 'Completed';
export function deadlineGroup(
  date: string,
  timeZone: string,
  now: string,
  dueAt: string | null = null,
): Exclude<TaskGroup, 'Completed'> {
  const today = localDateTime(now, timeZone).date;
  return (dueAt ? dueAt < now : date < today)
    ? 'Overdue'
    : date === today
      ? 'Due today'
      : 'Upcoming';
}
export function taskGroup(task: ApplicationTask, now: string): TaskGroup {
  return task.state === 'completed'
    ? 'Completed'
    : deadlineGroup(task.dueDate, task.timeZone, now, task.dueAt);
}
export interface NextAction {
  id: string;
  applicationId: string;
  title: string;
  date: string;
  timeZone: string;
  group: TaskGroup;
  source: 'task' | 'interview' | 'offer';
  task?: ApplicationTask;
  href: string;
}
export function nextActions(
  applications: JobApplication[],
  interviews: Interview[],
  offers: Offer[],
  now: string,
): NextAction[] {
  const result: NextAction[] = applications.flatMap((app) =>
    (app.tasks ?? []).map((task) => ({
      id: `task-${app.id}-${task.id}`,
      applicationId: app.id,
      title: task.title,
      date: task.dueDate + (task.dueTime ? ` ${task.dueTime}` : ''),
      timeZone: task.timeZone,
      group: taskGroup(task, now),
      source: 'task' as const,
      task,
      href: `/applications/${encodeURIComponent(app.id)}`,
    })),
  );
  for (const interview of interviews)
    if (interview.status === 'scheduled')
      result.push({
        id: `interview-${interview.id}`,
        applicationId: interview.applicationId,
        title: interview.title,
        date:
          localDateTime(interview.scheduledAt, interview.timeZone).date +
          ' ' +
          localDateTime(interview.scheduledAt, interview.timeZone).time,
        timeZone: interview.timeZone,
        group: deadlineGroup(
          localDateTime(interview.scheduledAt, interview.timeZone).date,
          interview.timeZone,
          now,
          interview.scheduledAt,
        ),
        source: 'interview',
        href: `/interviews/${encodeURIComponent(interview.id)}`,
      });
  for (const offer of offers) {
    const terms = latestOfferTerms(offer);
    if (offer.state === 'reviewing' && terms?.deadlineOn)
      result.push({
        id: `offer-${offer.applicationId}`,
        applicationId: offer.applicationId,
        title: 'Offer response deadline',
        date: terms.deadlineOn,
        timeZone: terms.timeZone,
        group: deadlineGroup(terms.deadlineOn, terms.timeZone, now),
        source: 'offer',
        href: `/applications/${encodeURIComponent(offer.applicationId)}`,
      });
  }
  return result.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}
