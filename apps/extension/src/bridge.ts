import {
  CAPTURE_REQUEST,
  CAPTURE_RESPONSE,
  isCaptureId,
  isFatsCapturePage,
} from '@fats/domain';
if (window === window.top && isFatsCapturePage(location.href)) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !event.data ||
      typeof event.data !== 'object'
    )
      return;
    const message = event.data as Record<string, unknown>;
    if (
      message.type !== CAPTURE_REQUEST ||
      !isCaptureId(message.id) ||
      !isCaptureId(message.requestId)
    )
      return;
    chrome.runtime.sendMessage({ type: 'sidekick:get', id: message.id }).then(
      (response: unknown) =>
        window.postMessage(
          { type: CAPTURE_RESPONSE, requestId: message.requestId, response },
          location.origin,
        ),
      () =>
        window.postMessage(
          {
            type: CAPTURE_RESPONSE,
            requestId: message.requestId,
            response: {
              ok: false,
              error:
                'Sidekick was refreshed or disconnected. Refresh FATS and try again.',
            },
          },
          location.origin,
        ),
    );
  });
}
