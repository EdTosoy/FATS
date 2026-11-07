import { it, expect } from 'vitest';
import {
  createApplication,
  changeApplicationTask,
  validateTasks,
  taskGroup,
  normalizeTask,
  nextActions,
  createBackup,
  createPortableBackup,
  createCareerBackup,
  serializeBackup,
  parseBackup,
  type TaskInput,
} from '@fats/domain';
import { LocalApplicationRepository } from '../../apps/web/src/lib/local-application-repository';
const now = '2026-11-06T04:00:00.000Z';
const input: TaskInput = {
  title: 'Follow up',
  notes: 'Ask about assessment',
  dueDate: '2026-11-06',
  dueTime: '',
  timeZone: 'Asia/Manila',
  occurrence: '',
};
const app = () =>
  createApplication(
    {
      title: 'Engineer',
      company: 'Example',
      sourceUrl: 'https://example.test/job',
      location: 'Cebu',
      description: '',
    },
    'app',
    now,
  );
const save = () =>
  changeApplicationTask(
    app(),
    { action: 'save', id: 'task', input, expected: null },
    now,
  );
it('creates, edits, completes, reopens and deletes without changing application status or preparations', () => {
  let row = save();
  expect(row.tasks![0].state).toBe('pending');
  const original = row.tasks![0];
  row = changeApplicationTask(
    row,
    { action: 'complete', id: 'task', expected: original },
    now,
  );
  expect(row.tasks![0].completedAt).toBe(now);
  expect(row.status).toBe('Saved');
  expect(row.activities![0].notes).toBe('Completed task: Follow up');
  expect(() =>
    changeApplicationTask(
      row,
      { action: 'delete', id: 'task', expected: original },
      now,
    ),
  ).toThrow('changed');
  row = changeApplicationTask(
    row,
    { action: 'reopen', id: 'task', expected: row.tasks![0] },
    now,
  );
  expect(row.tasks![0].completedAt).toBeNull();
  row = changeApplicationTask(
    row,
    {
      action: 'save',
      id: 'task',
      input: { ...input, title: 'Updated' },
      expected: row.tasks![0],
    },
    now,
  );
  expect(row.tasks![0].title).toBe('Updated');
  row = changeApplicationTask(
    row,
    { action: 'delete', id: 'task', expected: row.tasks![0] },
    now,
  );
  expect(row.tasks).toEqual([]);
});
it('uses the full calendar day in the selected timezone, and exact instants for timed tasks', () => {
  const task = save().tasks![0];
  expect(taskGroup(task, '2026-11-06T15:59:59.000Z')).toBe('Due today');
  expect(taskGroup(task, '2026-11-06T16:00:00.000Z')).toBe('Overdue');
  expect(taskGroup(task, '2026-11-05T00:00:00.000Z')).toBe('Upcoming');
  const timed = { ...task, ...normalizeTask({ ...input, dueTime: '12:00' }) };
  expect(taskGroup(timed, '2026-11-06T04:00:01.000Z')).toBe('Overdue');
});
it('rejects skipped times, requires repeated-time choice and preserves the selected occurrence', () => {
  expect(() =>
    normalizeTask({
      ...input,
      dueDate: '2026-03-08',
      dueTime: '02:30',
      timeZone: 'America/New_York',
    }),
  ).toThrow('does not exist');
  const repeated = {
    ...input,
    dueDate: '2026-11-01',
    dueTime: '01:30',
    timeZone: 'America/New_York',
  };
  expect(() => normalizeTask(repeated)).toThrow('occurs twice');
  expect(
    Date.parse(normalizeTask({ ...repeated, occurrence: 'later' }).dueAt!) -
      Date.parse(normalizeTask({ ...repeated, occurrence: 'earlier' }).dueAt!),
  ).toBe(3600000);
});
it.each([
  { dueDate: '2026-02-30' },
  { timeZone: 'Not/AZone' },
  { dueTime: '25:00' },
  { title: '' },
  { notes: 'x'.repeat(20001) },
])('rejects invalid task %j', (patch) =>
  expect(() => normalizeTask({ ...input, ...patch })).toThrow(),
);
it('validates bounds and completion timestamps and round trips versions 1–3 without changing old records', () => {
  const row = save(),
    task = row.tasks![0];
  expect(() =>
    validateTasks([{ ...task, state: 'completed', completedAt: null }]),
  ).toThrow();
  expect(() => validateTasks([task, task])).toThrow();
  expect(() =>
    validateTasks(Array.from({ length: 101 }, () => task)),
  ).toThrow();
  const completed = changeApplicationTask(
    row,
    { action: 'complete', id: 'task', expected: task },
    now,
  );
  const data = { applications: [completed], interviews: [] };
  for (const backup of [
    createBackup(data, now),
    createPortableBackup({ ...data, offers: [] }, now),
    createCareerBackup({ ...data, offers: [], employments: [] }, now),
  ])
    expect(parseBackup(serializeBackup(backup)).data.applications).toEqual([
      completed,
    ]);
  expect(
    createBackup({ applications: [app()], interviews: [] }, now).data
      .applications[0].tasks,
  ).toBeUndefined();
});
it('projects scheduled interviews and active offer deadlines without creating task records', () => {
  const application = save();
  const interview = {
    id: 'interview',
    applicationId: 'app',
    title: 'Technical',
    scheduledAt: now,
    timeZone: 'Asia/Manila',
    status: 'scheduled' as const,
  };
  const offer = {
    applicationId: 'app',
    state: 'reviewing' as const,
    events: [{ terms: { deadlineOn: '2026-11-06', timeZone: 'Asia/Manila' } }],
  };
  const rows = nextActions(
    [application],
    [interview as never],
    [offer as never],
    now,
  );
  expect(rows.map((row) => row.source).sort()).toEqual([
    'interview',
    'offer',
    'task',
  ]);
  expect(application.tasks).toHaveLength(1);
});
it('guest saves are atomic, preserve old data after failure and reject stale task changes', async () => {
  let raw: string | null = null,
    fail = false;
  const repository = new LocalApplicationRepository({
    getItem: () => raw,
    setItem: (_, value) => {
      if (fail) throw Error('quota');
      raw = value;
    },
  });
  const application = await repository.create({ ...app() });
  const before = raw;
  fail = true;
  const change = { action: 'save' as const, id: 'task', input, expected: null };
  await expect(repository.changeTask(application.id, change)).rejects.toThrow(
    'could not be saved',
  );
  expect(raw).toBe(before);
  fail = false;
  const saved = await repository.changeTask(application.id, change);
  expect((await repository.list())[0].tasks).toEqual(saved.tasks);
  await expect(repository.changeTask(application.id, change)).rejects.toThrow(
    'changed',
  );
  expect(
    parseBackup(await repository.exportBackup()).data.applications[0].tasks,
  ).toEqual(saved.tasks);
});
