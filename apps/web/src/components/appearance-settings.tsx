'use client';

import { Moon, Sun, Monitor, SunMoon } from 'lucide-react';
import { useTheme } from './theme-provider';
import { Card } from './ui';
import type { ThemePreference } from '@/lib/theme';

export function AppearanceSettings() {
  const theme = useTheme();
  return (
    <Card className="appearance-card" id="appearance">
      <div className="appearance-heading">
        <SunMoon size={22} aria-hidden="true" />
        <div>
          <h2>Appearance</h2>
          <p>Make this workspace comfortable for you.</p>
        </div>
      </div>
      <fieldset>
        <legend className="sr-only">Color theme</legend>
        <div className="appearance-options">
          {(
            [
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <label key={value} className="appearance-option">
              <input
                type="radio"
                name="appearance"
                value={value}
                checked={theme.preference === value}
                onChange={() => theme.choose(value)}
              />
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="appearance-hint">
        {theme.preference === 'system'
          ? `Following your device’s ${theme.resolved} appearance.`
          : `Using ${theme.resolved} appearance.`}{' '}
        Saved in this browser for guest and account workspaces.
      </p>
      {theme.error && (
        <p className="error-message" role="alert">
          {theme.error}
        </p>
      )}
    </Card>
  );
}

export function AppearanceSelect() {
  const theme = useTheme();
  return (
    <div className="appearance-control">
      <label className="appearance-select">
        <SunMoon size={16} aria-hidden="true" />
        <span className="sr-only">Appearance</span>
        <select
          value={theme.preference}
          onChange={(event) =>
            theme.choose(event.target.value as ThemePreference)
          }
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      {theme.error && (
        <p role="alert" className="appearance-notice">
          {theme.error}
        </p>
      )}
    </div>
  );
}
