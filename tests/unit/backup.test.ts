import { describe, expect, it } from 'vitest';
import {
  createApplication,
  createInterview,
  createBackup,
  parseBackup,
  serializeBackup,
  validateWorkspaceData,
  MAX_BACKUP_BYTES,
} from '@fats/domain';

const now = '2026-10-15T00:00:00.000Z';
const application = createApplication(
  {
    title: 'Graduate Developer',
    company: 'Example',
    sourceUrl: 'https://example.com/job',
    location: 'Remote',
    description: 'Requirements',
  },
  'job-1',
  now,
);
const interview = createInterview(
  {
    applicationId: application.id,
    title: 'Meet the team',
    stage: 'HR',
    scheduledAt: '2030-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.com/meeting',
    location: '',
    preparationNotes: 'Questions to expect',
    reflections: 'Lessons learned',
  },
  'interview-1',
  now,
);
const data = {
  applications: [application],
  interviews: [
    interview,
    { ...interview, id: 'interview-2', status: 'completed' as const },
    { ...interview, id: 'interview-3', status: 'cancelled' as const },
  ],
};

describe('versioned FATS backups', () => {
  it('roundtrips every field, multiple relationships, statuses, timestamps, and exact note text', () => {
    const original = structuredClone(data);
    original.interviews[0].preparationNotes =
      '  Keep exact spacing\nAnd lines  ';
    const backup = createBackup(original, now);
    expect(parseBackup(serializeBackup(backup))).toEqual({
      format: 'fats-backup',
      version: 1,
      exportedAt: now,
      data: original,
    });
  });
  it('roundtrips empty datasets', () => {
    expect(
      parseBackup(
        serializeBackup(
          createBackup({ applications: [], interviews: [] }, now),
        ),
      ).data,
    ).toEqual({ applications: [], interviews: [] });
  });
  it('copies only known record fields and detaches the exported snapshot', () => {
    const source = structuredClone(data);
    const backup = createBackup(
      {
        ...source,
        unrelatedStorage: 'exclude',
        applications: [{ ...source.applications[0], unrelated: 'exclude' }],
      },
      now,
    );
    source.interviews[0].reflections = 'Changed after snapshot';
    expect(backup.data.interviews[0].reflections).toBe('Lessons learned');
    expect(JSON.stringify(backup)).not.toContain('exclude');
  });
  it.each(['{bad', '', 'null', '[]', '{"version":1,"applications":[]}'])(
    'rejects malformed or non-backup JSON: %s',
    (text) => expect(() => parseBackup(text)).toThrow(),
  );
  it.each([0, 2, '1', null])('rejects unsupported version %s', (version) => {
    expect(() =>
      parseBackup(JSON.stringify({ ...createBackup(data, now), version })),
    ).toThrow('version is not supported');
  });
  it.each([
    (value: typeof data) => {
      value.applications[0].sourceUrl = 'javascript:alert(1)';
    },
    (value: typeof data) => {
      value.applications[0].title = ' ';
    },
    (value: typeof data) => {
      value.applications[0].status = 'bad' as 'Saved';
    },
    (value: typeof data) => {
      value.applications[0].createdAt = '2026-02-30T00:00:00.000Z';
    },
    (value: typeof data) => {
      value.interviews[0].timeZone = 'Invalid/Zone';
    },
    (value: typeof data) => {
      value.interviews[0].meetingUrl = 'https://user:pass@example.com';
    },
    (value: typeof data) => {
      value.interviews[0].applicationId = 'missing';
    },
    (value: typeof data) => {
      value.interviews[0].scheduledAt = 'invalid';
    },
    (value: typeof data) => {
      value.interviews[0].status = 'bad' as 'scheduled';
    },
    (value: typeof data) => {
      value.applications.push(value.applications[0]);
    },
    (value: typeof data) => {
      value.interviews.push(value.interviews[0]);
    },
  ])('rejects invalid records and references %#', (change) => {
    const value = structuredClone(data);
    change(value);
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'fats-backup',
          version: 1,
          exportedAt: now,
          data: value,
        }),
      ),
    ).toThrow();
  });
  it.each([
    { applications: [], interviews: null },
    { applications: [null], interviews: [] },
    { applications: [{ ...application, company: 5 }], interviews: [] },
    {
      applications: [application],
      interviews: [{ ...interview, reflections: {} }],
    },
    { applications: [], interviews: [interview] },
  ])('rejects invalid record types and missing collections %#', (value) =>
    expect(() => validateWorkspaceData(value)).toThrow(),
  );
  it('rejects an invalid export timestamp and oversized UTF-8 files', () => {
    expect(() => createBackup(data, 'invalid')).toThrow('timestamp');
    expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow(
      '10 MiB',
    );
  });
});
