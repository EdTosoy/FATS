export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'fats.appearance.v1';
export const THEME_CHANGE_EVENT = 'fats:appearance-changed';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function readThemePreference(
  storage: Pick<Storage, 'getItem'>,
): ThemePreference {
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(
    preference,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

// First-party, parser-blocking initialization in the root head, before body paint.
// This deliberately contains no user data, network access, or account state.
export const THEME_BOOTSTRAP = `(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
})();`;
