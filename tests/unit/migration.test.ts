import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createApplication,
  createInterview,
  planLocalMigration,
  type WorkspaceData,
} from '@fats/domain';
import { LocalDataTransfer } from '../../apps/web/src/lib/local-data-transfer';
import { HttpWorkspaceRepository } from '../../apps/web/src/lib/http-workspace-repository';
const now = '2026-10-15T00:00:00.000Z';
const app = createApplication(
  {
    title: 'Graduate Developer',
    company: 'Example',
    location: 'Remote',
    sourceUrl: 'https://example.test/job',
    description: 'Original description',
  },
  'legacy-app',
  now,
);
const interview = createInterview(
  {
    applicationId: app.id,
    title: 'Introduction',
    stage: 'HR',
    scheduledAt: '2030-10-16T02:00:00.000Z',
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.test/meeting',
    location: '',
    preparationNotes: '  Original notes.\n',
    reflections: '',
  },
  'legacy-interview',
  now,
);
const data: WorkspaceData = {
  applications: [app],
  interviews: [
    {
      ...interview,
      preparationNotes: '  Original notes.\n',
      status: 'completed',
      reflections: '  Learned something.\n',
    },
  ],
};
const empty: WorkspaceData = { applications: [], interviews: [] };
afterEach(() => vi.unstubAllGlobals());
describe('explicit additive migration', () => {
  it('preserves identity, timestamps, statuses, notes, and relationships without mutating either input', () => {
    const result = planLocalMigration(data, empty);
    expect(result.data).toEqual(data);
    expect(result.added).toEqual({ applications: 1, interviews: 1 });
    result.data.applications[0].title = 'Changed copy';
    expect(data.applications[0].title).toBe('Graduate Developer');
  });
  it('skips identical records and handles an empty dataset', () => {
    expect(planLocalMigration(data, data)).toMatchObject({
      data: empty,
      added: { applications: 0, interviews: 0 },
      identical: { applications: 1, interviews: 1 },
    });
    expect(planLocalMigration(empty, data).data).toEqual(empty);
  });
  it('rejects conflicts, duplicates, invalid records, and missing parents before any writes', () => {
    expect(() =>
      planLocalMigration(data, {
        ...data,
        applications: [{ ...app, title: 'Account edit' }],
      }),
    ).toThrow('conflicts');
    expect(() =>
      planLocalMigration({ ...data, applications: [app, app] }, empty),
    ).toThrow('Duplicate');
    expect(() =>
      planLocalMigration(
        {
          ...data,
          applications: [{ ...app, sourceUrl: 'javascript:alert(1)' }],
        },
        empty,
      ),
    ).toThrow();
    expect(() =>
      planLocalMigration({ ...data, applications: [] }, empty),
    ).toThrow('missing parent');
  });
  it('copies a stable browser snapshot only after preview, preserves raw storage, and rejects later local edits', async () => {
    let raw = JSON.stringify({ version: 1, ...data });
    let writes = 0;
    const storage = {
      getItem: () => raw,
      setItem: () => {
        writes++;
      },
    };
    const source = new LocalDataTransfer(storage),
      account = new HttpWorkspaceRepository('test-owner');
    expect(await source.inspect()).toEqual({ applications: 1, interviews: 1 });
    const token = '01234567-1111-4111-8111-0123456789ab';
    const fetch = vi.fn(async (_url: unknown, options: RequestInit) => {
      const request = JSON.parse(String(options.body));
      return Response.json(
        request.action === 'preview-migration' ? { token } : data,
      );
    });
    vi.stubGlobal('fetch', fetch);
    const preview = await source.preview(account);
    expect(preview.token).toBe(token);
    expect(fetch).toHaveBeenCalledTimes(1);
    raw = JSON.stringify({
      version: 1,
      ...data,
      applications: [{ ...app, title: 'Later browser edit' }],
    });
    await expect(source.confirm(account, token)).rejects.toThrow(
      'changed since preview',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writes).toBe(0);
  });
  it('retains the confirmation token for interrupted requests, permits retry, and never deletes local originals', async () => {
    const raw = JSON.stringify({ version: 1, ...data }),
      write = vi.fn();
    const source = new LocalDataTransfer({
        getItem: () => raw,
        setItem: write,
      }),
      account = new HttpWorkspaceRepository('test-owner');
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, options: RequestInit) => {
        const request = JSON.parse(String(options.body));
        if (request.action === 'preview-migration')
          return Response.json({
            token: '01234567-1111-4111-8111-0123456789ab',
          });
        if (fail) {
          fail = false;
          throw new Error('Synthetic interruption');
        }
        return Response.json(data);
      }),
    );
    const preview = await source.preview(account);
    await expect(source.confirm(account, preview.token)).rejects.toThrow(
      'interrupted',
    );
    expect(await source.confirm(account, preview.token)).toEqual(data);
    expect(write).not.toHaveBeenCalled();
  });
  it('cancels an uncommitted transfer and preserves unreadable local storage for recovery', async () => {
    const source = new LocalDataTransfer({
      getItem: () => '{broken',
      setItem: vi.fn(),
    });
    await expect(source.inspect()).rejects.toThrow();
    const account = new HttpWorkspaceRepository('test-owner');
    source.cancel(account);
    await expect(source.confirm(account, 'not-previewed')).rejects.toThrow(
      'Preview',
    );
  });
});
