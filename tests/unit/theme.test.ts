import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import postcss from 'postcss';
import {
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_BOOTSTRAP,
  THEME_STORAGE_KEY,
} from '../../apps/web/src/lib/theme';

describe('appearance preference and first paint', () => {
  it('defaults to System for missing, corrupt, and inaccessible storage', () => {
    for (const value of [null, undefined, '', 'sepia', {}, '"dark"'])
      expect(parseThemePreference(value)).toBe('system');
    expect(
      readThemePreference({
        getItem() {
          throw new Error('Blocked');
        },
      }),
    ).toBe('system');
    expect(
      readThemePreference({
        getItem(key) {
          expect(key).toBe(THEME_STORAGE_KEY);
          return 'dark';
        },
      }),
    ).toBe('dark');
  });
  it.each(['light', 'dark', 'system'] as const)(
    'resolves %s against either system appearance',
    (preference) => {
      for (const systemDark of [true, false])
        expect(resolveTheme(preference, systemDark)).toBe(
          preference === 'system'
            ? systemDark
              ? 'dark'
              : 'light'
            : preference,
        );
    },
  );
  it.each([null, 'system', 'light', 'dark', 'invalid'])(
    'initializes %s before body/hydration without account state',
    (value) => {
      for (const systemDark of [true, false]) {
        const root = { dataset: {} as Record<string, string> };
        runInNewContext(THEME_BOOTSTRAP, {
          document: { documentElement: root },
          localStorage: { getItem: () => value },
          matchMedia: () => ({ matches: systemDark }),
        });
        expect(root.dataset.themePreference).toBe(parseThemePreference(value));
        expect(root.dataset.theme).toBe(
          resolveTheme(parseThemePreference(value), systemDark),
        );
      }
    },
  );
  it('still initializes to the system preference when storage access throws', () => {
    const root = { dataset: {} as Record<string, string> };
    runInNewContext(THEME_BOOTSTRAP, {
      document: { documentElement: root },
      localStorage: {
        getItem() {
          throw new Error('Blocked');
        },
      },
      matchMedia: () => ({ matches: true }),
    });
    expect(root.dataset).toEqual({ themePreference: 'system', theme: 'dark' });
  });
});

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
describe('semantic theme palette', () => {
  const css = postcss.parse(readFileSync('apps/web/src/app/theme.css', 'utf8'));
  const light: Record<string, string> = {},
    dark: Record<string, string> = {};
  css.walkRules((rule) =>
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--'))
        (rule.selector === ':root' ? light : dark)[decl.prop] = decl.value;
    }),
  );
  for (const [name, palette] of [
    ['light', light],
    ['dark', { ...light, ...dark }],
  ] as const) {
    it(`${name} text/status/action pairs meet WCAG AA`, () => {
      const pairs = [
        ['--ink', '--canvas'],
        ['--ink', '--surface'],
        ['--secondary', '--surface'],
        ['--muted', '--canvas'],
        ['--muted', '--surface-muted'],
        ['--placeholder', '--input-bg'],
        ['--action', '--surface'],
        ['--action', '--surface-hover'],
        ['--on-primary', '--button-primary-bg'],
        ['--on-primary', '--button-primary-hover'],
        ['--success-text', '--success-bg'],
        ['--info-text', '--info-bg'],
        ['--warning-text', '--warning-bg'],
        ['--danger-text', '--danger-bg'],
        ['--neutral-text', '--neutral-bg'],
        ['--amber', '--surface-muted'],
      ];
      for (const [text, background] of pairs)
        expect(
          contrast(palette[text!]!, palette[background!]!),
          `${name}: ${text} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      for (const surface of ['--surface', '--input-bg', '--surface-raised'])
        expect(
          contrast(palette['--control-border']!, palette[surface]!),
          `${name} control boundary on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      expect(palette['--document-paper']).toBe('#ffffff');
      expect(palette['--document-ink']).toBe('#172c45');
    });
  }
  it('keeps application color values in the shared palette instead of page overrides', () => {
    const global = readFileSync('apps/web/src/app/globals.css', 'utf8');
    expect(global).not.toMatch(/#[a-f\d]{3,8}\b|rgba?\(/i);
    expect(global).not.toContain('prefers-color-scheme');
    expect(global).not.toContain('.welcome-art');
  });
});
