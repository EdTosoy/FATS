import { offerContinuationId } from './offer-continuation';
export function accountReturnPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/settings';
  if (value.startsWith('/continue-offer/'))
    return offerContinuationId(value) ? value : '/settings';
  try {
    const url = new URL(value, 'https://fats.invalid');
    if (
      url.origin !== 'https://fats.invalid' ||
      !/^\/(?:$|settings$|sidekick$|help$|career-vault$|resumes(?:\/pdf-tools)?$|applications(?:\/[^/]+)?$|interviews(?:\/[^/]+)?$)/.test(
        url.pathname,
      )
    )
      return '/settings';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/settings';
  }
}
