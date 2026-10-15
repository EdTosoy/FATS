import {
  CAPTURE_REQUEST,
  CAPTURE_RESPONSE,
  isCaptureId,
  isFatsCapturePage,
  validateJobCapture,
  type JobCapture,
} from '@fats/domain';
export function requestSidekickCapture(
  id: string,
  signal: AbortSignal,
): Promise<JobCapture> {
  return new Promise((resolve, reject) => {
    if (
      !isCaptureId(id) ||
      !isFatsCapturePage(window.location.href) ||
      window !== window.top
    ) {
      reject(
        new Error(
          'Open FATS from Sidekick to review a capture, or save a job manually.',
        ),
      );
      return;
    }
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(
      () =>
        finish(
          new Error(
            'Sidekick is unavailable. Install or enable the extension, refresh this page, and retry. You can also save manually.',
          ),
        ),
      4000,
    );
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', cancel);
    }
    function finish(error?: Error, capture?: JobCapture) {
      cleanup();
      if (error) reject(error);
      else resolve(capture!);
    }
    function cancel() {
      finish(new Error('Capture request cancelled.'));
    }
    function receive(event: MessageEvent<unknown>) {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        !event.data ||
        typeof event.data !== 'object'
      )
        return;
      const row = event.data as Record<string, unknown>;
      if (row.type !== CAPTURE_RESPONSE || row.requestId !== requestId) return;
      const response = row.response as
        { ok?: unknown; capture?: unknown; error?: unknown } | undefined;
      try {
        if (!response || response.ok !== true)
          throw new Error(
            typeof response?.error === 'string'
              ? response.error.slice(0, 400)
              : 'This capture is unavailable. Open FATS from Sidekick again.',
          );
        const capture = validateJobCapture(
          response.capture,
          new Date().toISOString(),
          location.origin,
        );
        if (capture.id !== id)
          throw new Error('This capture does not match the requested draft.');
        finish(undefined, capture);
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error('The capture could not be validated.'),
        );
      }
    }
    if (signal.aborted) {
      cancel();
      return;
    }
    window.addEventListener('message', receive);
    signal.addEventListener('abort', cancel, { once: true });
    window.postMessage(
      { type: CAPTURE_REQUEST, id, requestId },
      location.origin,
    );
  });
}
