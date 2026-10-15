export function accountReturnPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/settings';
  try {
    const url = new URL(value, 'https://fats.invalid');
    if (
      url.origin !== 'https://fats.invalid' ||
      !/^\/(?:$|settings$|sidekick$|applications(?:\/[^/]+)?$|interviews(?:\/[^/]+)?$)/.test(
        url.pathname,
      )
    )
      return '/settings';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/settings';
  }
}
