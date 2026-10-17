import { describe, expect, it } from 'vitest';
import {
  activityDate,
  createApplication,
  getMomentum,
  validateActivityDays,
  workspaceActivityDays,
} from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
} from '../../apps/web/src/lib/local-application-repository';

const input = {
  title: 'Graduate developer',
  company: 'Example',
  location: 'Manila',
  sourceUrl: 'https://example.test/job',
  description: '',
};
const monday = '2026-10-19T00:00:00.000Z';
function fixture() {
  const values = new Map<string, string>();
  let instant = monday;
  let sequence = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const repository = new LocalApplicationRepository(
    storage,
    () => `fixture-${++sequence}`,
    () => instant,
  );
  return {
    repository,
    storage,
    values,
    at: (next: string) => {
      instant = next;
    },
  };
}

describe('momentum calendar', () => {
  it('uses Philippine midnight rather than UTC or the device timezone', () => {
    expect(activityDate('2026-10-18T15:59:59.999Z')).toBe('2026-10-18');
    expect(activityDate('2026-10-18T16:00:00.000Z')).toBe('2026-10-19');
    expect(activityDate('2026-10-18T09:00:00-07:00')).toBe('2026-10-19');
    expect(activityDate('2026-11-01T01:30:00-04:00')).toBe('2026-11-01');
    expect(activityDate('2026-11-01T01:30:00-05:00')).toBe('2026-11-01');
  });
  it('starts empty and never counts future dates', () => {
    const result = getMomentum(['2026-10-20'], monday);
    expect(result.streak).toBe(0);
    expect(result.activeThisWeek).toBe(0);
    expect(result.hasActivity).toBe(false);
  });
  it('deduplicates days and keeps yesterday’s streak while today is open', () => {
    const days = ['2026-10-17', '2026-10-18', '2026-10-18'];
    expect(getMomentum(days, monday).streak).toBe(2);
    expect(getMomentum([...days, '2026-10-19'], monday).streak).toBe(3);
    expect(getMomentum(days, '2026-10-20T00:00:00.000Z').streak).toBe(0);
  });
  it('breaks at inactive days instead of filling gaps', () => {
    expect(
      getMomentum(['2026-10-16', '2026-10-18', '2026-10-19'], monday).streak,
    ).toBe(2);
  });
  it('shows Monday–Sunday independently of streaks across week boundaries', () => {
    const days = ['2026-10-18', '2026-10-19'];
    expect(getMomentum(days, monday).activeThisWeek).toBe(1);
    expect(getMomentum(days, monday).days.map((day) => day.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(getMomentum(days, '2026-10-18T00:00:00.000Z').activeThisWeek).toBe(
      1,
    );
  });
  it('handles month/year boundaries and leap days', () => {
    expect(
      getMomentum(['2027-12-31', '2028-01-01'], '2028-01-01T00:00:00.000Z')
        .streak,
    ).toBe(2);
    expect(
      getMomentum(
        ['2028-02-28', '2028-02-29', '2028-03-01'],
        '2028-03-01T00:00:00.000Z',
      ).streak,
    ).toBe(3);
  });
  it('validates real calendar dates', () => {
    for (const invalid of [
      ['2026-02-29'],
      ['2026-04-31'],
      ['2026-13-01'],
      ['tomorrow'],
      [7],
      null,
    ])
      expect(() => validateActivityDays(invalid)).toThrow();
    expect(validateActivityDays(['2028-02-29', '2028-02-29'])).toEqual([
      '2028-02-29',
    ]);
  });
  it('reuses creation timestamps without treating mutable update timestamps as history', () => {
    const application = createApplication(
      input,
      'old',
      '2026-10-01T00:00:00.000Z',
    );
    expect(
      workspaceActivityDays({
        applications: [{ ...application, updatedAt: monday }],
        interviews: [],
      }),
    ).toEqual(['2026-10-01']);
  });
});

describe('guest momentum persistence', () => {
  it('persists one active day for multiple saves, changes, and reloads', async () => {
    const { repository, storage } = fixture();
    const row = await repository.create(input);
    await repository.update(row.id, { ...input, status: 'Applied' });
    await repository.create(input);
    expect(
      (await new LocalApplicationRepository(storage).getWorkspace())
        .activityDays,
    ).toEqual(['2026-10-19']);
  });
  it('ignores unchanged edits, passive reads, and duplicate captures on later days', async () => {
    const { repository, at } = fixture();
    const row = await repository.create(input);
    at('2026-10-20T00:00:00.000Z');
    expect(
      await repository.update(row.id, { ...input, status: 'Saved' }),
    ).toEqual(row);
    await repository.list();
    await repository.getWorkspace();
    await repository.createCapturedApplication(
      {
        format: 'fats-sidekick',
        version: 1,
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: '2026-10-20T00:00:00.000Z',
        expiresAt: '2026-10-20T00:10:00.000Z',
        origin: 'http://127.0.0.1:3000',
        job: { ...input, workArrangement: '' },
      },
      input,
    );
    expect((await repository.getWorkspace()).activityDays).toEqual([
      '2026-10-19',
    ]);
  });
  it('records status changes and substantive interview preparation on their actual save dates', async () => {
    const { repository, at } = fixture();
    const row = await repository.create(input);
    at('2026-10-20T00:00:00.000Z');
    await repository.update(row.id, { ...input, status: 'Interview' });
    const interview = await repository.createInterview({
      applicationId: row.id,
      title: 'Conversation',
      stage: 'HR',
      scheduledAt: '2026-11-01T00:00:00.000Z',
      timeZone: 'Asia/Manila',
      location: 'Manila',
      meetingUrl: '',
      preparationNotes: '',
      reflections: '',
    });
    at('2026-10-21T00:00:00.000Z');
    await repository.updateInterview(interview.id, {
      ...interview,
      preparationNotes: 'Practice explaining my capstone project.',
    });
    at('2026-10-22T00:00:00.000Z');
    await repository.updateInterview(interview.id, {
      ...interview,
      preparationNotes: 'Practice explaining my capstone project.',
    });
    expect((await repository.getWorkspace()).activityDays).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);
  });
  it('does not record failed persistence or invalid actions', async () => {
    const { repository, storage } = fixture();
    const row = await repository.create(input);
    const failing = new LocalApplicationRepository(
      {
        ...storage,
        setItem: () => {
          throw new Error('Full');
        },
      },
      () => 'new',
      () => '2026-10-20T00:00:00.000Z',
    );
    await expect(
      failing.update(row.id, { ...input, status: 'Applied' }),
    ).rejects.toThrow('could not be saved');
    await expect(repository.create({ ...input, title: '' })).rejects.toThrow();
    expect((await repository.getWorkspace()).activityDays).toEqual([
      '2026-10-19',
    ]);
  });
  it('preserves activity after deletion, but excludes it from JSON exports', async () => {
    const { repository } = fixture();
    const row = await repository.create(input);
    await repository.deleteApplication(row.id);
    expect((await repository.getWorkspace()).activityDays).toEqual([
      '2026-10-19',
    ]);
    expect(await repository.exportBackup()).not.toContain('activityDays');
  });
  it('preserves legacy creation history and never overwrites malformed activity', async () => {
    const { repository, values, at } = fixture();
    const row = createApplication(input, 'legacy', '2026-10-01T00:00:00.000Z');
    values.set(
      APPLICATION_STORAGE_KEY,
      JSON.stringify({ version: 1, applications: [row] }),
    );
    at(monday);
    await repository.update(row.id, { ...input, status: 'Applied' });
    expect((await repository.getWorkspace()).activityDays).toEqual([
      '2026-10-01',
      '2026-10-19',
    ]);
    const corrupt = JSON.stringify({
      version: 1,
      applications: [row],
      activityDays: ['2026-02-30'],
    });
    values.set(APPLICATION_STORAGE_KEY, corrupt);
    await expect(repository.create(input)).rejects.toThrow('left untouched');
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(corrupt);
  });
  it('keeps workspace history during restore and does not award the restore date', async () => {
    const { repository, at } = fixture();
    await repository.create(input);
    const backup = await repository.exportBackup();
    at('2026-10-20T00:00:00.000Z');
    const preview = await repository.previewRestore(backup);
    await repository.restoreBackup(preview.token);
    expect((await repository.getWorkspace()).activityDays).toEqual([
      '2026-10-19',
    ]);
  });
});
