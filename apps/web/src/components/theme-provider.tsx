'use client';

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  applyTheme,
  parseThemePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
  type ResolvedTheme,
} from '@/lib/theme';

function snapshot() {
  const root = document.documentElement;
  return `${parseThemePreference(root.dataset.themePreference)}:${root.dataset.theme === 'dark' ? 'dark' : 'light'}`;
}
function subscribe(notify: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const systemChanged = () => {
    applyTheme(
      parseThemePreference(document.documentElement.dataset.themePreference),
    );
    notify();
  };
  const storageChanged = (event: StorageEvent) => {
    if (
      event.storageArea === localStorage &&
      (event.key === THEME_STORAGE_KEY || event.key === null)
    ) {
      applyTheme(parseThemePreference(event.newValue));
      notify();
    }
  };
  if (!document.documentElement.dataset.theme)
    applyTheme(readThemePreference(localStorage));
  media.addEventListener('change', systemChanged);
  window.addEventListener('storage', storageChanged);
  window.addEventListener(THEME_CHANGE_EVENT, notify);
  return () => {
    media.removeEventListener('change', systemChanged);
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener(THEME_CHANGE_EVENT, notify);
  };
}
interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  error: string;
  choose: (preference: ThemePreference) => void;
}
const Context = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'system:light');
  const [error, setError] = useState('');
  const [preference, resolved] = state.split(':') as [
    ThemePreference,
    ResolvedTheme,
  ];
  return (
    <Context.Provider
      value={{
        preference,
        resolved,
        error,
        choose: (value) => {
          try {
            localStorage.setItem(THEME_STORAGE_KEY, value);
            setError('');
          } catch {
            setError(
              'Appearance changed for this visit. Browser storage is unavailable, so this choice could not be saved.',
            );
          }
          applyTheme(value);
          window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useTheme() {
  const theme = useContext(Context);
  if (!theme) throw new Error('ThemeProvider is required.');
  return theme;
}
