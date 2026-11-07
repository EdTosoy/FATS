import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FATS_ORIGINS, type JobCapture } from '@fats/domain';

const extensionId = 'sidekick-test';
const job = {
  title: 'Graduate Engineer',
  company: 'Example',
  location: 'Cebu',
  sourceUrl: 'https://jobs.example.test/1',
  description: 'Build tools.',
  workArrangement: 'Hybrid',
  salaryMin: 25000,
  salaryMax: 35000,
  currency: 'PHP',
  paymentPeriod: 'month',
  seniority: 'Junior',
  technologies: 'TypeScript',
  qualifications: 'Degree or equivalent',
  postingDate: '2026-10-01',
};
let stored: JobCapture | undefined;
let listener: (
  message: unknown,
  sender: unknown,
  reply: (value: unknown) => void,
) => boolean;
const createTab = vi.fn();
const panel = {
  id: extensionId,
  url: `chrome-extension://${extensionId}/sidepanel.html`,
};
function app(origin: string) {
  const url = `${origin}/sidekick`;
  return { id: extensionId, url, origin, frameId: 0, tab: { url } };
}
async function send(message: unknown, sender: unknown) {
  return new Promise<{ ok: boolean; capture?: JobCapture; error?: string }>(
    (resolve) => {
      listener(message, sender, (value) => resolve(value as never));
    },
  );
}
beforeEach(async () => {
  vi.resetModules();
  stored = undefined;
  createTab.mockReset().mockResolvedValue({});
  vi.stubGlobal('chrome', {
    runtime: {
      id: extensionId,
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (value: typeof listener) => {
          listener = value;
        },
      },
    },
    action: { onClicked: { addListener: vi.fn() } },
    storage: {
      session: {
        setAccessLevel: vi.fn().mockResolvedValue(undefined),
        get: async () => ({ pendingJob: stored }),
        set: async (value: { pendingJob: JobCapture }) => {
          stored = value.pendingJob;
        },
        remove: async () => {
          stored = undefined;
        },
      },
    },
    tabs: { create: createTab },
  });
  await import('../../apps/extension/src/background');
});
afterEach(() => vi.unstubAllGlobals());
describe('packaged worker message boundary', () => {
  it.each(FATS_ORIGINS)(
    'stages only to the selected origin and retrieves only there: %s',
    async (origin) => {
      expect(
        await send({ type: 'sidekick:stage', job, origin }, panel),
      ).toEqual({ ok: true });
      expect(createTab).toHaveBeenCalledWith({
        url: `${origin}/sidekick#${stored!.id}`,
      });
      const result = await send(
        { type: 'sidekick:get', id: stored!.id },
        app(origin),
      );
      expect(result.ok).toBe(true);
      expect(result.capture?.job).toEqual(job);
      const other = FATS_ORIGINS.find((value) => value !== origin)!;
      expect(
        (await send({ type: 'sidekick:get', id: stored!.id }, app(other))).ok,
      ).toBe(false);
      expect(stored).toBeDefined();
    },
  );
  it('rejects arbitrary staging destinations and forged panel senders', async () => {
    for (const origin of [
      '',
      'https://evil.test',
      'http://fats.edtosoy.com',
      'https://fats.edtosoy.com.evil.test',
    ])
      expect(
        (await send({ type: 'sidekick:stage', job, origin }, panel)).ok,
      ).toBe(false);
    expect(
      (
        await send(
          { type: 'sidekick:stage', job, origin: FATS_ORIGINS[2] },
          app(FATS_ORIGINS[2]),
        )
      ).ok,
    ).toBe(false);
    expect(stored).toBeUndefined();
    expect(createTab).not.toHaveBeenCalled();
  });
  it('rejects untrusted retrieval and expired captures without exposing data', async () => {
    const origin = FATS_ORIGINS[2];
    await send({ type: 'sidekick:stage', job, origin }, panel);
    const id = stored!.id;
    for (const sender of [
      { ...app(origin), id: 'other' },
      { ...app(origin), frameId: 1 },
      { ...app(origin), origin: 'https://evil.test' },
      { ...app(origin), url: `${origin}/sidekick/extra` },
      { ...app(origin), tab: { url: 'https://evil.test/sidekick' } },
    ]) {
      const result = await send({ type: 'sidekick:get', id }, sender);
      expect(result.ok).toBe(false);
      expect(result.capture).toBeUndefined();
    }
    stored = { ...stored!, expiresAt: stored!.createdAt };
    expect((await send({ type: 'sidekick:get', id }, app(origin))).ok).toBe(
      false,
    );
    expect(stored).toBeUndefined();
  });
});
