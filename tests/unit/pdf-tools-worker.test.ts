import { afterEach, expect, it, vi } from 'vitest';
import { LocalPdfWorker } from '../../apps/web/src/lib/pdf-tools-client';
import {
  emptyPdfEdits,
  PDF_TOOLS_LIMITS,
} from '../../apps/web/src/lib/pdf-tools-model';
class WorkerFixture {
  static latest: WorkerFixture;
  terminate = vi.fn();
  postMessage = vi.fn();
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  constructor() {
    WorkerFixture.latest = this;
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('terminates a stalled parser, rejects every pending request and refuses further processing', async () => {
  vi.stubGlobal('Worker', WorkerFixture);
  vi.useFakeTimers();
  const worker = new LocalPdfWorker();
  const result = worker.request(
    'open',
    emptyPdfEdits(),
    [],
    new Uint8Array([1]),
  );
  const failure = expect(result).rejects.toThrow('too long');
  await vi.advanceTimersByTimeAsync(PDF_TOOLS_LIMITS.timeout);
  await failure;
  expect(WorkerFixture.latest.terminate).toHaveBeenCalledOnce();
  await expect(worker.request('export', emptyPdfEdits())).rejects.toThrow(
    'stopped',
  );
});
it('clears deadlines on success, handles worker errors and rejects drafts when closed', async () => {
  vi.stubGlobal('Worker', WorkerFixture);
  vi.useFakeTimers();
  const worker = new LocalPdfWorker();
  const response = worker.request('open', emptyPdfEdits());
  WorkerFixture.latest.onmessage?.({
    data: {
      id: 1,
      info: { pages: [], fields: [] },
      bytes: new Uint8Array([1]),
    },
  });
  expect((await response).bytes).toEqual(new Uint8Array([1]));
  await vi.advanceTimersByTimeAsync(PDF_TOOLS_LIMITS.timeout + 1);
  expect(WorkerFixture.latest.terminate).not.toHaveBeenCalled();
  const pending = worker.request('export', emptyPdfEdits());
  const closed = expect(pending).rejects.toThrow('closed');
  worker.destroy();
  await closed;
  const another = new LocalPdfWorker(),
    broken = another.request('open', emptyPdfEdits());
  const failure = expect(broken).rejects.toThrow('stopped');
  WorkerFixture.latest.onerror?.();
  await failure;
});
