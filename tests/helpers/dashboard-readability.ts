import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Measure the actual theme colors and visible supporting text, including
// backgrounds inherited through transparent wrappers. No screenshot sampling.
export async function checkDashboardReadability(page: Page, info: TestInfo) {
  const samples = await page.locator('.dashboard').evaluate((dashboard) => {
    const selectors = [
      '.eyebrow',
      '.page-heading .muted',
      '.welcome-description',
      '.welcome-action > span',
      '.dashboard-start-hint',
      '.stat-card p',
      '.stat-line > span',
      '.compact-empty p',
      '.table-head',
      '.role-link',
      '.company-name',
      '.location-cell',
      '.date-cell',
      '.count-pill',
      '.button-primary',
      '.text-link',
      '.document-next-step p',
      '.status',
    ];
    function rgb(value: string) {
      return value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    }
    function luminance(channels: number[]) {
      return channels
        .map((channel) => {
          const srgb = channel / 255;
          return srgb <= 0.04045
            ? srgb / 12.92
            : ((srgb + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, channel, index) =>
            sum + channel * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    }
    return selectors.flatMap((selector) =>
      Array.from(dashboard.querySelectorAll<HTMLElement>(selector))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const style = getComputedStyle(el);
          let surface: Element | null = el;
          while (
            surface &&
            getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)'
          )
            surface = surface.parentElement;
          const background = getComputedStyle(
            surface ?? document.documentElement,
          ).backgroundColor;
          const fg = luminance(rgb(style.color)),
            bg = luminance(rgb(background));
          return {
            selector,
            text: el.textContent?.trim().slice(0, 60),
            fontSize: parseFloat(style.fontSize),
            contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            color: style.color,
            background,
          };
        }),
    );
  });
  expect(samples.length).toBeGreaterThan(4);
  for (const sample of samples) {
    expect(
      sample.contrast,
      `${sample.selector}: ${sample.text}`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(sample.fontSize, sample.selector).toBeGreaterThanOrEqual(13);
  }
  for (const label of await page.locator('.dashboard .eyebrow').all()) {
    expect(
      await label.evaluate((el) => getComputedStyle(el).textTransform),
    ).toBe('none');
    expect(
      await label.evaluate((el) => getComputedStyle(el).letterSpacing),
    ).toBe('normal');
  }
  const state = samples.some((sample) => sample.selector === '.stat-card p')
    ? 'populated'
    : 'empty';
  const scheme = await page.locator('html').getAttribute('data-theme');
  const path = info.outputPath(`readability-${state}-${scheme}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(samples, null, 2));
  await info.attach('dashboard-readability', {
    path,
    contentType: 'application/json',
  });
}
