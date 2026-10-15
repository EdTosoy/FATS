import { isFatsCapturePage } from '@fats/domain';
export function isPanelSender(
  sender: { id?: string; url?: string },
  extensionId: string,
): boolean {
  return (
    sender.id === extensionId &&
    sender.url === `chrome-extension://${extensionId}/sidepanel.html`
  );
}
export function isAppSender(
  sender: {
    id?: string;
    url?: string;
    origin?: string;
    frameId?: number;
    tab?: { url?: string };
  },
  extensionId: string,
): boolean {
  if (
    sender.id !== extensionId ||
    sender.frameId !== 0 ||
    !sender.url ||
    !sender.tab?.url
  )
    return false;
  return (
    isFatsCapturePage(sender.url) &&
    isFatsCapturePage(sender.tab.url) &&
    new URL(sender.url).origin === new URL(sender.tab.url).origin &&
    sender.origin === new URL(sender.url).origin
  );
}
