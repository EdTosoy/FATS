import { describe, it, expect } from 'vitest';
import {
  createApplication,
  updateApplication,
  createBackup,
  createPortableBackup,
  createCareerBackup,
  parseBackup,
  serializeBackup,
  filterApplications,
  normalizeApplicationInput,
} from '@fats/domain';
const input = {
  title: 'Engineer',
  company: 'Example',
  sourceUrl: 'https://example.test/job',
  location: 'Cebu',
  description: '',
};
const now = '2026-11-06T00:00:00.000Z';
describe('enhanced application tracking', () => {
  it('preserves legacy records and round trips details and timeline through backups', () => {
    const old = createApplication(input, 'legacy', now);
    const updated = updateApplication(
      old,
      {
        ...input,
        status: 'Applied',
        salaryMin: 20000,
        salaryMax: 30000,
        currency: 'php',
        workArrangement: 'remote',
        technologies: 'TypeScript',
        applicationDate: '2026-11-06',
        fitNotes: 'Good learning opportunity',
        newActivity: {
          kind: 'recruiter-response',
          date: '2026-11-06',
          notes: 'Requested availability',
        },
      },
      now,
    );
    expect(updated.activities).toHaveLength(2);
    expect(updated.currency).toBe('PHP');
    expect(filterApplications([updated], 'typescript', 'Applied')).toEqual([
      updated,
    ]);
    const restored = parseBackup(
      serializeBackup(
        createBackup(
          {
            applications: [old, { ...updated, id: 'new' }],
            interviews: [],
          },
          now,
        ),
      ),
    );
    expect(restored.data.applications[0]).toEqual(old);
    expect(restored.data.applications[1]).toEqual({ ...updated, id: 'new' });
  });
  it.each([
    { salaryMin: -1 },
    { salaryMin: 20, salaryMax: 10 },
    { postingDate: '2026-02-30' },
    { postingDate: '2026-99-99' },
    { currency: 'pesos' },
    { recruiterEmail: 'invalid' },
  ])('rejects invalid structured details %j', (fields) => {
    expect(() => normalizeApplicationInput({ ...input, ...fields })).toThrow();
  });
  it('round trips tracking through version 2 and 3 backups', () => {
    const row = createApplication(
      {
        ...input,
        recruiterName: 'Recruiter',
        recruiterEmail: 'recruiter@example.test',
        recruiterPhone: '+63 000',
        applicationChannel: 'Company website',
        seniority: 'Graduate',
        qualifications: 'Degree',
        postingDate: '2026-10-01',
        lastCheckedDate: '2026-11-06',
        paymentPeriod: 'month',
        notes: 'My notes',
        newActivity: {
          kind: 'milestone',
          date: '2026-11-06',
          notes: 'Submitted portfolio',
        },
      },
      'job',
      now,
    );
    const data = {
      applications: [row],
      interviews: [],
      offers: [],
      employments: [],
    };
    const v2 = createPortableBackup(
      { applications: data.applications, interviews: [], offers: [] },
      now,
    );
    for (const backup of [v2, createCareerBackup(data, now)])
      expect(parseBackup(serializeBackup(backup)).data.applications).toEqual([
        row,
      ]);
  });
  it('rejects malformed activities and validates salary edits against saved bounds', () => {
    const row = createApplication({ ...input, salaryMax: 30000 }, 'job', now);
    expect(() =>
      updateApplication(
        row,
        { ...input, status: 'Saved', salaryMin: 40000 },
        now,
      ),
    ).toThrow('Minimum');
    expect(() =>
      updateApplication(
        row,
        {
          ...input,
          status: 'Saved',
          newActivity: { kind: 'note', date: '2026-02-30', notes: 'Invalid' },
        },
        now,
      ),
    ).toThrow('Activity');
    expect(
      updateApplication(row, { ...row, salaryMax: null, status: 'Saved' }, now)
        .salaryMax,
    ).toBeNull();
  });
  it('preserves existing tracking on legacy status-only edits', () => {
    const row = createApplication(
      { ...input, technologies: 'Rust' },
      'job',
      now,
    );
    expect(
      updateApplication(row, { ...input, status: 'Interview' }, now)
        .technologies,
    ).toBe('Rust');
  });
});
