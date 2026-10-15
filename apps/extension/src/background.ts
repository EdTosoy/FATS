import {
  CAPTURE_TTL_MS,
  isCaptureId,
  isFatsOrigin,
  normalizeCapturedJob,
  validateJobCapture,
  type JobCapture,
} from '@fats/domain';
import { isPanelSender, isAppSender } from './security';
const KEY = 'pendingJob';
// Handle the action explicitly so Chrome grants activeTab before opening the panel.
chrome.action.onClicked.addListener((tab) => {
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});
chrome.storage.session
  .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  .catch(() => {});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.remove(KEY);
});

async function handle(value: unknown, sender: chrome.runtime.MessageSender) {
  if (!value || typeof value !== 'object') throw new Error('Invalid request.');
  const message = value as Record<string, unknown>;
  if (
    message.type === 'sidekick:stage' &&
    isPanelSender(sender, chrome.runtime.id)
  ) {
    if (!isFatsOrigin(message.origin))
      throw new Error('Choose a supported local FATS workspace.');
    const job = normalizeCapturedJob(message.job),
      createdAt = new Date().toISOString();
    const capture: JobCapture = {
      format: 'fats-sidekick',
      version: 1,
      id: crypto.randomUUID(),
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + CAPTURE_TTL_MS).toISOString(),
      origin: message.origin,
      job,
    };
    await chrome.storage.session.set({ [KEY]: capture });
    await chrome.tabs.create({
      url: `${capture.origin}/sidekick#${capture.id}`,
    });
    return { ok: true };
  }
  if (
    message.type === 'sidekick:get' &&
    isAppSender(sender, chrome.runtime.id) &&
    isCaptureId(message.id)
  ) {
    const stored = (await chrome.storage.session.get(KEY))[KEY];
    if (
      !stored ||
      typeof stored !== 'object' ||
      !('id' in stored) ||
      stored.id !== message.id
    )
      throw new Error(
        'This capture is unavailable. Open FATS from Sidekick again.',
      );
    let capture: JobCapture;
    try {
      capture = validateJobCapture(stored, new Date().toISOString());
    } catch (error) {
      await chrome.storage.session.remove(KEY);
      throw error;
    }
    if (capture.origin !== sender.origin)
      throw new Error('This capture belongs to another FATS workspace.');
    return { ok: true, capture };
  }
  throw new Error('This request is not permitted.');
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void handle(message, sender).then(respond, (error: unknown) =>
    respond({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Sidekick could not complete this request.',
    }),
  );
  return true;
});
