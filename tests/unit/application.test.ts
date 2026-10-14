import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES,
  applicationStatistics,
  createApplication,
  filterApplications,
  normalizeApplicationInput,
  updateApplication,
  type ApplicationInput,
} from '@fats/domain';

const input: ApplicationInput = {
  title: 'Junior Developer',
  company: 'Example Philippines',
  sourceUrl: 'https://example.com/careers/graduate',
  location: 'Makati · Hybrid',
  description: 'Build accessible websites.',
};
const createdAt = '2026-10-15T00:00:00.000Z';
const updatedAt = '2026-10-16T00:00:00.000Z';

describe('application domain', () => {
  it('creates a Saved application and trims user input', () => {
    const application = createApplication(
      {
        ...input,
        title: ' Junior Developer ',
        company: ' Example Philippines ',
      },
      'job-1',
      createdAt,
    );
    expect(application).toEqual({
      ...input,
      id: 'job-1',
      status: 'Saved',
      createdAt,
      updatedAt: createdAt,
    });
  });

  it.each(APPLICATION_STATUSES)(
    'updates status to %s while preserving identity and creation date',
    (status) => {
      const original = createApplication(input, 'job-1', createdAt);
      const updated = updateApplication(
        original,
        { ...input, title: 'Graduate Developer', status },
        updatedAt,
      );
      expect(updated).toMatchObject({
        id: 'job-1',
        title: 'Graduate Developer',
        status,
        createdAt,
        updatedAt,
      });
      expect(original.status).toBe('Saved');
      expect(original.title).toBe('Junior Developer');
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/job',
    'example.com/job',
    'https://user:password@example.com/job',
  ])('rejects unsafe or incomplete URL %s', (sourceUrl) => {
    expect(() => normalizeApplicationInput({ ...input, sourceUrl })).toThrow();
  });

  it.each(['title', 'company', 'location', 'sourceUrl'] as const)(
    'rejects blank required field %s',
    (field) => {
      expect(() =>
        createApplication({ ...input, [field]: '  ' }, 'job-1', createdAt),
      ).toThrow('required');
    },
  );

  it('allows an empty optional description', () => {
    expect(
      createApplication({ ...input, description: '' }, 'job-1', createdAt)
        .description,
    ).toBe('');
  });

  it('combines case-insensitive trimmed search with status filtering', () => {
    const saved = createApplication(input, 'job-1', createdAt);
    const applied = updateApplication(
      createApplication(
        { ...input, company: 'Another Company', location: 'Cebu' },
        'job-2',
        createdAt,
      ),
      {
        ...input,
        company: 'Another Company',
        location: 'Cebu',
        status: 'Applied',
      },
      updatedAt,
    );
    expect(filterApplications([saved, applied], '  EXAMPLE  ', 'All')).toEqual([
      saved,
    ]);
    expect(filterApplications([saved, applied], 'cebu', 'Applied')).toEqual([
      applied,
    ]);
    expect(filterApplications([saved, applied], 'cebu', 'Saved')).toEqual([]);
    expect(
      filterApplications([saved, applied], 'accessible', 'All'),
    ).toHaveLength(2);
  });

  it('derives statistics from state, including a truthful empty state', () => {
    expect(applicationStatistics([])).toEqual({
      total: 0,
      saved: 0,
      active: 0,
      offers: 0,
    });
    const applications = APPLICATION_STATUSES.map((status) =>
      updateApplication(
        createApplication(input, status, createdAt),
        { ...input, status },
        updatedAt,
      ),
    );
    expect(applicationStatistics(applications)).toEqual({
      total: 7,
      saved: 1,
      active: 3,
      offers: 1,
    });
  });
});
