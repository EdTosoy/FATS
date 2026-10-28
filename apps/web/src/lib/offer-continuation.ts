// Carry only the application identifier, never browser records or credentials.
export function offerContinuationPath(applicationId: string): string {
  return '/continue-offer/' + encodeURIComponent(applicationId);
}
export function offerContinuationId(path: string): string | null {
  const match = /^\/continue-offer\/([^/?#]+)$/.exec(path);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return id.length > 0 &&
      id.length <= 256 &&
      !/[\u0000-\u001f\u007f]/.test(id) &&
      id !== '.' &&
      id !== '..' &&
      offerContinuationPath(id) === path
      ? id
      : null;
  } catch {
    return null;
  }
}
