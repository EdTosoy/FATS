import { describe, expect, it } from 'vitest';
import {
  CAPTURE_TTL_MS,
  applicationFromCapture,
  validateJobCapture,
  normalizeCapturedJob,
  isFatsCapturePage,
  type JobCapture,
} from '@fats/domain';
import { isPanelSender, isAppSender } from '../../apps/extension/src/security';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
} from '../../apps/web/src/lib/local-application-repository';
const now = '2026-10-15T00:00:00.000Z';
const capture: JobCapture = {
  format: 'fats-sidekick',
  version: 1,
  id: 'a1b2c3d4-1111-4111-8111-a1b2c3d4e5f6',
  createdAt: now,
  expiresAt: new Date(Date.parse(now) + CAPTURE_TTL_MS).toISOString(),
  origin: 'http://localhost:3000',
  job: {
    title: 'Graduate Engineer',
    company: 'Example',
    location: 'Makati',
    workArrangement: 'Hybrid',
    sourceUrl: 'https://example.com/job',
    description: 'Notes',
  },
};
describe('Sidekick contract and trust boundaries', () => {
  it('projects trusted fields and reuses application validation without a storage migration', () => {
    const normalized = normalizeCapturedJob({
      ...capture.job,
      company: ' Example ',
      extra: 'discard',
    });
    expect(normalized.company).toBe('Example');
    expect(normalized).not.toHaveProperty('extra');
    expect(applicationFromCapture(normalized).location).toBe('Makati · Hybrid');
    expect(
      applicationFromCapture({
        ...normalized,
        location: '',
        workArrangement: 'Remote',
      }).location,
    ).toBe('Remote');
    expect(
      applicationFromCapture({ ...normalized, location: 'Makati · Hybrid' })
        .location,
    ).toBe('Makati · Hybrid');
    expect(validateJobCapture(capture, now, 'http://localhost:3000')).toEqual(
      capture,
    );
  });
  it.each([
    { format: 'bad' },
    { version: 2 },
    { id: 'invalid' },
    { expiresAt: now },
    { expiresAt: '2030-01-01T00:00:00.000Z' },
    { createdAt: '2030-01-01T00:00:00.000Z' },
    { origin: 'https://evil.test' },
  ])('rejects invalid or stale handoff %#', (patch) =>
    expect(() => validateJobCapture({ ...capture, ...patch }, now)).toThrow(),
  );
  it.each([
    { title: '' },
    { company: '' },
    { sourceUrl: 'javascript:alert(1)' },
    { sourceUrl: 'https://user:pass@example.com' },
    { description: 'x'.repeat(20001) },
    { workArrangement: 5 },
    { location: '', workArrangement: '' },
  ])('rejects unsafe or incomplete job %#', (patch) =>
    expect(() => normalizeCapturedJob({ ...capture.job, ...patch })).toThrow(),
  );
  it('rejects origin mismatches and expiry at the exact boundary', () => {
    expect(() =>
      validateJobCapture(capture, now, 'http://127.0.0.1:3000'),
    ).toThrow('another');
    expect(() => validateJobCapture(capture, capture.expiresAt)).toThrow(
      'expired',
    );
  });
  it.each([
    'http://localhost:3000/sidekick',
    'http://127.0.0.1:3000/sidekick#id',
  ])('accepts only the supported FATS route %s', (url) =>
    expect(isFatsCapturePage(url)).toBe(true),
  );
  it.each([
    'http://localhost:4000/sidekick',
    'http://localhost:3000/sidekick/extra',
    'https://evil.test/sidekick',
    'http://localhost.evil.test:3000/sidekick',
    'http://user:pass@localhost:3000/sidekick',
    'javascript:alert(1)',
  ])('rejects other URLs %s', (url) =>
    expect(isFatsCapturePage(url)).toBe(false),
  );
  it('validates extension identity, exact panel URL, top frame, and app sender origin', () => {
    const id = 'example-extension';
    const url = 'http://localhost:3000/sidekick';
    expect(
      isPanelSender({ id, url: `chrome-extension://${id}/sidepanel.html` }, id),
    ).toBe(true);
    expect(
      isPanelSender(
        { id: 'other', url: `chrome-extension://${id}/sidepanel.html` },
        id,
      ),
    ).toBe(false);
    expect(
      isPanelSender(
        { id, url: `chrome-extension://${id}/sidepanel.html?spoof` },
        id,
      ),
    ).toBe(false);
    const sender = {
      id,
      url,
      origin: 'http://localhost:3000',
      frameId: 0,
      tab: { url },
    };
    expect(isAppSender(sender, id)).toBe(true);
    expect(isAppSender({ ...sender, frameId: 1 }, id)).toBe(false);
    expect(isAppSender({ ...sender, origin: 'https://evil.test' }, id)).toBe(
      false,
    );
    expect(
      isAppSender(
        { ...sender, tab: { url: 'http://localhost:4000/sidekick' } },
        id,
      ),
    ).toBe(false);
  });
});
describe('confirmed capture persistence', () => {
  function fixture() {
    let raw: string | null = null;
    let fail = false;
    const storage = {
      getItem: (key: string) => {
        expect(key).toBe(APPLICATION_STORAGE_KEY);
        return raw;
      },
      setItem: (_key: string, value: string) => {
        if (fail) throw new Error('quota');
        raw = value;
      },
    };
    return {
      repository: new LocalApplicationRepository(
        storage,
        () => 'existing-id',
        () => now,
      ),
      storage,
      raw: () => raw,
      fail: () => {
        fail = true;
      },
    };
  }
  it('creates through the existing rules, preserves prior applications, and makes retries/URL duplicates idempotent', async () => {
    const f = fixture();
    await f.repository.create({
      ...capture.job,
      sourceUrl: 'https://example.com/other',
    });
    const first = await f.repository.createCapturedApplication(
      capture,
      applicationFromCapture(capture.job),
    );
    const retry = await f.repository.createCapturedApplication(capture, {
      ...applicationFromCapture(capture.job),
      title: 'Do not overwrite',
    });
    const otherCapture = {
      ...capture,
      id: 'b1b2c3d4-1111-4111-8111-a1b2c3d4e5f6',
    };
    const repeatedUrl = await f.repository.createCapturedApplication(
      otherCapture,
      {
        ...applicationFromCapture(capture.job),
        sourceUrl: `${capture.job.sourceUrl}#section`,
      },
    );
    expect(retry).toEqual(first);
    expect(repeatedUrl).toEqual(first);
    expect(first).toMatchObject({
      id: capture.id,
      status: 'Saved',
      createdAt: now,
      location: 'Makati · Hybrid',
    });
    expect(await new LocalApplicationRepository(f.storage).list()).toHaveLength(
      2,
    );
  });
  it('preserves saved state after invalid input or a failed write', async () => {
    const f = fixture();
    await f.repository.create({
      ...capture.job,
      sourceUrl: 'https://example.com/other',
    });
    const before = f.raw();
    await expect(
      f.repository.createCapturedApplication(
        { ...capture, expiresAt: now },
        applicationFromCapture(capture.job),
      ),
    ).rejects.toThrow('expired');
    await expect(
      f.repository.createCapturedApplication(capture, {
        ...capture.job,
        title: '',
      }),
    ).rejects.toThrow('required');
    f.fail();
    await expect(
      f.repository.createCapturedApplication(
        capture,
        applicationFromCapture(capture.job),
      ),
    ).rejects.toThrow('could not be saved');
    expect(f.raw()).toBe(before);
  });
});
