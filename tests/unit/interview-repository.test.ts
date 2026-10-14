import { describe, expect, it } from 'vitest';
import { type InterviewInput, type InterviewStatus } from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
  type KeyValueStorage,
} from '../../apps/web/src/lib/local-application-repository';
const job = {
  title: 'Graduate Developer',
  company: 'Example',
  sourceUrl: 'https://example.com/job',
  location: 'Remote',
  description: '',
};
function fixture() {
  const values = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  let id = 0;
  let tick = 0;
  const repository = new LocalApplicationRepository(
    storage,
    () => `id-${++id}`,
    () => new Date(Date.UTC(2026, 9, 15, 0, 0, tick++)).toISOString(),
  );
  const input: InterviewInput = {
    applicationId: 'id-1',
    title: 'Meet the team',
    stage: 'HR',
    scheduledAt: '2026-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.com/meeting',
    location: '',
    preparationNotes: '',
    reflections: '',
  };
  return { values, storage, repository, input };
}
describe('interview persistence', () => {
  it('loads Phase 1 storage unchanged, then preserves it while adding multiple linked interviews', async () => {
    const { values, storage, repository, input } = fixture();
    const application = await repository.create(job);
    const legacy = JSON.stringify({ version: 1, applications: [application] });
    values.set(APPLICATION_STORAGE_KEY, legacy);
    expect(await repository.listInterviews()).toEqual([]);
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(legacy);
    const first = await repository.createInterview(input);
    const second = await repository.createInterview({
      ...input,
      title: 'Technical round',
    });
    const fresh = new LocalApplicationRepository(storage);
    expect(await fresh.listInterviews(application.id)).toEqual([first, second]);
    expect(await fresh.list()).toEqual([application]);
    expect(await fresh.upcomingInterviews('2026-10-16T02:00:00.000Z')).toEqual([
      first,
      second,
    ]);
    expect(await fresh.upcomingInterviews('2026-10-16T02:00:00.001Z')).toEqual(
      [],
    );
    await repository.update(application.id, { ...job, status: 'Interview' });
    expect(await fresh.listInterviews()).toHaveLength(2);
  });
  it('persists edits, rescheduling, completion/cancellation, notes, and reassociation without changing job statuses', async () => {
    const { repository, storage, input } = fixture();
    const firstApp = await repository.create(job);
    const secondApp = await repository.create({ ...job, company: 'Another' });
    const interview = await repository.createInterview(input);
    for (const status of [
      'completed',
      'cancelled',
      'scheduled',
    ] as InterviewStatus[]) {
      const changed = await repository.updateInterview(interview.id, {
        ...input,
        applicationId: secondApp.id,
        title: 'Updated round',
        scheduledAt: '2026-10-17T03:00:00.000Z',
        stage: 'Technical',
        preparationNotes: 'Review projects',
        reflections: 'More concrete examples',
        status,
      });
      expect(changed.createdAt).toBe(interview.createdAt);
      expect(changed.updatedAt).not.toBe(interview.updatedAt);
      expect(
        await new LocalApplicationRepository(storage).listInterviews(
          secondApp.id,
        ),
      ).toEqual([changed]);
    }
    expect(await repository.listInterviews(firstApp.id)).toEqual([]);
    expect(
      (await repository.list()).every((app) => app.status === 'Saved'),
    ).toBe(true);
  });
  it('restricts deletion even for cancelled/completed interviews and permits deletion without children', async () => {
    const { repository, input } = fixture();
    const parent = await repository.create(job);
    const other = await repository.create(job);
    const interview = await repository.createInterview(input);
    for (const status of [
      'scheduled',
      'completed',
      'cancelled',
    ] as InterviewStatus[]) {
      await repository.updateInterview(interview.id, { ...input, status });
      await expect(repository.deleteApplication(parent.id)).rejects.toThrow(
        'linked interviews',
      );
    }
    await repository.deleteApplication(other.id);
    expect(await repository.list()).toEqual([parent]);
  });
  it('rejects missing/deleted parents, missing interviews, and invalid updates without writing', async () => {
    const { repository, values, input } = fixture();
    await repository.create(job);
    const interview = await repository.createInterview(input);
    const before = values.get(APPLICATION_STORAGE_KEY);
    await expect(
      repository.createInterview({ ...input, applicationId: 'missing' }),
    ).rejects.toThrow('linked application');
    await expect(
      repository.updateInterview(interview.id, {
        ...input,
        applicationId: 'missing',
        status: 'scheduled',
      }),
    ).rejects.toThrow('linked application');
    await expect(
      repository.updateInterview('missing', { ...input, status: 'scheduled' }),
    ).rejects.toThrow('interview could not be found');
    await expect(
      repository.updateInterview(interview.id, {
        ...input,
        timeZone: 'Invalid',
        status: 'scheduled',
      }),
    ).rejects.toThrow('IANA');
    expect(values.get(APPLICATION_STORAGE_KEY)).toBe(before);
  });
  it.each([
    'orphan',
    'duplicate',
    'bad-date',
    'bad-zone',
    'bad-url',
    'bad-status',
    'bad-type',
    'bad-version',
  ])(
    'preserves malformed data and blocks further writes: %s',
    async (defect) => {
      const { repository, values, input } = fixture();
      await repository.create(job);
      await repository.createInterview(input);
      const data = JSON.parse(values.get(APPLICATION_STORAGE_KEY)!);
      if (defect === 'orphan') data.applications = [];
      if (defect === 'duplicate') data.interviews.push(data.interviews[0]);
      if (defect === 'bad-date')
        data.interviews[0].scheduledAt = '2026-02-30T00:00:00.000Z';
      if (defect === 'bad-zone') data.interviews[0].timeZone = 'Invalid';
      if (defect === 'bad-url')
        data.interviews[0].meetingUrl = 'javascript:alert(1)';
      if (defect === 'bad-status') data.interviews[0].status = 'unknown';
      if (defect === 'bad-type') data.interviews = null;
      if (defect === 'bad-version') data.version = 9;
      const raw = JSON.stringify(data);
      values.set(APPLICATION_STORAGE_KEY, raw);
      await expect(repository.listInterviews()).rejects.toThrow(
        'left untouched',
      );
      await expect(repository.createInterview(input)).rejects.toThrow(
        'left untouched',
      );
      await expect(repository.create(job)).rejects.toThrow('left untouched');
      expect(values.get(APPLICATION_STORAGE_KEY)).toBe(raw);
    },
  );
  it('reports blocked reads and failed writes while preserving the last saved interview', async () => {
    const { repository, storage, input } = fixture();
    await repository.create(job);
    const interview = await repository.createInterview(input);
    const failing = new LocalApplicationRepository({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota');
      },
    });
    await expect(
      failing.updateInterview(interview.id, { ...input, status: 'completed' }),
    ).rejects.toThrow('could not be saved');
    expect(await repository.listInterviews()).toEqual([interview]);
    const blocked = new LocalApplicationRepository({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: storage.setItem,
    });
    await expect(blocked.listInterviews()).rejects.toThrow('cannot access');
  });
  it('reads the current collection on every write to preserve sequential changes from other adapters', async () => {
    const { repository, storage, input } = fixture();
    await repository.create(job);
    await repository.listInterviews();
    const other = new LocalApplicationRepository(
      storage,
      () => 'other-interview',
    );
    await other.createInterview(input);
    await repository.createInterview(input);
    expect(await repository.listInterviews()).toHaveLength(2);
  });
});
