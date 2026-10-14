import { describe, expect, it } from 'vitest';
import {
  createInterview,
  updateInterview,
  normalizeInterviewInput,
  resolveInterviewTime,
  localDateTime,
  upcomingInterviews,
  interviewGroup,
  INTERVIEW_STATUSES,
  type InterviewInput,
} from '@fats/domain';
const now = '2026-10-15T00:00:00.000Z';
const later = '2026-10-16T00:00:00.000Z';
const input: InterviewInput = {
  applicationId: 'job-1',
  title: ' Team conversation ',
  stage: 'Technical',
  scheduledAt: later,
  timeZone: 'Asia/Manila',
  meetingUrl: 'https://example.com/meeting',
  location: '',
  preparationNotes: ' Practice introduction ',
  reflections: '',
};

describe('interview domain', () => {
  it('creates a linked scheduled record with trimmed notes and timestamps', () => {
    expect(createInterview(input, 'interview-1', now)).toEqual({
      ...input,
      title: 'Team conversation',
      preparationNotes: 'Practice introduction',
      id: 'interview-1',
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    });
  });
  it.each(INTERVIEW_STATUSES)(
    'updates details, notes, time, and status %s while preserving identity',
    (status) => {
      const current = createInterview(input, 'interview-1', now);
      const changed = updateInterview(
        current,
        {
          ...input,
          title: 'Final conversation',
          stage: 'Final',
          scheduledAt: '2026-10-17T00:00:00.000Z',
          preparationNotes: 'Prepare examples',
          reflections: 'Asked about teamwork',
          status,
          ...{ id: 'injected', createdAt: later },
        },
        later,
      );
      expect(changed).toMatchObject({
        id: current.id,
        createdAt: now,
        updatedAt: later,
        status,
        title: 'Final conversation',
        stage: 'Final',
        preparationNotes: 'Prepare examples',
        reflections: 'Asked about teamwork',
        scheduledAt: '2026-10-17T00:00:00.000Z',
      });
    },
  );
  it.each([
    { title: ' ' },
    { applicationId: '' },
    { stage: 'Unknown' },
    { scheduledAt: '2026-02-30T00:00:00.000Z' },
    { scheduledAt: 'not a date' },
    { timeZone: 'Not/A_Zone' },
    { timeZone: '+08:00' },
    { meetingUrl: 'javascript:alert(1)' },
    { meetingUrl: 'https://user:pass@example.com' },
    { meetingUrl: '', location: '' },
    { preparationNotes: 'x'.repeat(20001) },
    { reflections: 'x'.repeat(20001) },
  ])('rejects invalid interview input %#', (patch) => {
    expect(() =>
      normalizeInterviewInput({ ...input, ...patch } as InterviewInput),
    ).toThrow();
  });
  it('accepts physical locations and custom stages without a URL', () => {
    expect(
      normalizeInterviewInput({
        ...input,
        stage: 'Custom',
        meetingUrl: '',
        location: ' Office 4 ',
      }).location,
    ).toBe('Office 4');
  });
  it('rejects invalid statuses', () => {
    expect(() =>
      updateInterview(
        createInterview(input, 'i', now),
        { ...input, status: 'bad' as 'scheduled' },
        later,
      ),
    ).toThrow('valid interview status');
  });
  it('sorts actual future scheduled interviews, includes the exact boundary, and separates past/completed/cancelled', () => {
    const first = createInterview(input, 'first', now);
    const boundary = { ...first, id: 'boundary', scheduledAt: now };
    const past = {
      ...first,
      id: 'past',
      scheduledAt: '2026-10-14T23:59:59.999Z',
    };
    const completed = {
      ...first,
      id: 'completed',
      status: 'completed' as const,
    };
    const cancelled = {
      ...first,
      id: 'cancelled',
      status: 'cancelled' as const,
    };
    expect(
      upcomingInterviews([first, cancelled, past, boundary, completed], now),
    ).toEqual([boundary, first]);
    expect(interviewGroup(boundary, now)).toBe('Upcoming');
    expect(interviewGroup(boundary, '2026-10-15T00:00:00.001Z')).toBe(
      'Past & completed',
    );
    expect(interviewGroup(past, now)).toBe('Past & completed');
    expect(interviewGroup(completed, now)).toBe('Past & completed');
    expect(interviewGroup(cancelled, now)).toBe('Cancelled');
  });
});
describe('explicit timezone scheduling', () => {
  it('converts Manila midnight across a UTC date boundary and roundtrips', () => {
    const instant = resolveInterviewTime('2026-10-16', '00:15', 'Asia/Manila');
    expect(instant).toBe('2026-10-15T16:15:00.000Z');
    expect(localDateTime(instant, 'Asia/Manila')).toEqual({
      date: '2026-10-16',
      time: '00:15',
    });
  });
  it.each([
    ['2026-02-30', '12:00'],
    ['2025-02-29', '12:00'],
    ['2026-10-16', '24:00'],
    ['2026-10-16', '12:60'],
    ['', '12:00'],
  ])('rejects invalid wall time %s %s', (date, time) => {
    expect(() => resolveInterviewTime(date, time, 'Asia/Manila')).toThrow(
      'valid date and time',
    );
  });
  it('supports leap day, UTC, half-hour and quarter-hour offsets', () => {
    expect(resolveInterviewTime('2028-02-29', '10:00', 'UTC')).toBe(
      '2028-02-29T10:00:00.000Z',
    );
    expect(resolveInterviewTime('2026-10-16', '10:00', 'Asia/Kolkata')).toBe(
      '2026-10-16T04:30:00.000Z',
    );
    expect(resolveInterviewTime('2026-10-16', '10:00', 'Asia/Kathmandu')).toBe(
      '2026-10-16T04:15:00.000Z',
    );
  });
  it('rejects spring-forward gaps rather than silently moving the appointment', () => {
    expect(() =>
      resolveInterviewTime('2026-03-08', '02:30', 'America/New_York'),
    ).toThrow('does not exist');
  });
  it('requires an explicit choice for a repeated time and preserves both instants', () => {
    expect(() =>
      resolveInterviewTime('2026-11-01', '01:30', 'America/New_York'),
    ).toThrow('occurs twice');
    expect(
      resolveInterviewTime(
        '2026-11-01',
        '01:30',
        'America/New_York',
        'earlier',
      ),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(
      resolveInterviewTime('2026-11-01', '01:30', 'America/New_York', 'later'),
    ).toBe('2026-11-01T06:30:00.000Z');
  });
  it('handles a half-hour daylight-saving transition', () => {
    expect(() =>
      resolveInterviewTime('2026-10-04', '02:15', 'Australia/Lord_Howe'),
    ).toThrow('does not exist');
    const a = resolveInterviewTime(
      '2026-04-05',
      '01:45',
      'Australia/Lord_Howe',
      'earlier',
    );
    const b = resolveInterviewTime(
      '2026-04-05',
      '01:45',
      'Australia/Lord_Howe',
      'later',
    );
    expect(Date.parse(b) - Date.parse(a)).toBe(30 * 60000);
  });
  it('preserves second-based historical offsets rather than rounding a wall time', () => {
    expect(resolveInterviewTime('1900-01-15', '10:00', 'Europe/Paris')).toBe(
      '1900-01-15T09:50:39.000Z',
    );
  });
  it('rejects a date skipped by a timezone change across the date line', () => {
    expect(() =>
      resolveInterviewTime('2011-12-30', '10:00', 'Pacific/Apia'),
    ).toThrow('does not exist');
  });
});
