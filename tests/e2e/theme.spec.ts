import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pdfToolsFixture } from '../helpers/pdf-tools-fixtures';

async function theme(page: Page, value: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  expect(
    await page
      .locator('html')
      .evaluate((el) => getComputedStyle(el).colorScheme),
  ).toBe(value);
}
function runtime(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
test('System follows the device; explicit choices persist across navigation, reloads, and tabs', async ({
  page,
  context,
}) => {
  const errors = runtime(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/settings');
  await theme(page, 'dark');
  await expect(
    page.getByRole('radio', { name: 'System', exact: true }),
  ).toBeChecked();
  const light = page.getByRole('radio', { name: 'Light', exact: true });
  await light.focus();
  await page.keyboard.press('Space');
  await theme(page, 'light');
  await expect(light).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.appearance.v1')),
  ).toBe('light');
  await page.evaluate(() => {
    (window as Window & { appearanceProbe?: string }).appearanceProbe =
      'same-document';
  });
  await page
    .locator('.brand-link:visible, .mobile-brand:visible')
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to your workspace.' }),
  ).toBeVisible();
  await theme(page, 'light');
  expect(
    await page.evaluate(
      () => (window as Window & { appearanceProbe?: string }).appearanceProbe,
    ),
  ).toBe('same-document');
  await page.reload();
  await theme(page, 'light');
  await page.getByRole('link', { name: 'Appearance settings' }).click();
  await page.getByRole('radio', { name: 'System', exact: true }).check();
  await theme(page, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await theme(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await theme(page, 'dark');
  const other = await context.newPage();
  await other.goto('/settings');
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await theme(other, 'light');
  await other.evaluate(() => localStorage.removeItem('fats.appearance.v1'));
  await theme(page, 'dark');
  await other.close();
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBeNull();
  expect(errors).toEqual([]);
});

test('saved theme is applied before the body is observed and hydrates without warnings', async ({
  page,
}) => {
  const errors = runtime(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('fats.appearance.v1', 'dark');
    new MutationObserver((_, observer) => {
      if (document.body) {
        (window as Window & { firstBodyTheme?: string }).firstBodyTheme =
          document.documentElement.dataset.theme;
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/settings');
  await theme(page, 'dark');
  await expect(
    page.getByRole('radio', { name: 'Dark', exact: true }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => (window as Window & { firstBodyTheme?: string }).firstBodyTheme,
    ),
  ).toBe('dark');
  expect(errors).toEqual([]);
});

test('blocked preference writes keep the current visit usable and report persistence failure', async ({
  page,
}) => {
  const errors = runtime(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fats.appearance.v1')
        throw new DOMException('Blocked', 'SecurityError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await theme(page, 'dark');
  await expect(
    page.locator('.appearance-card').getByRole('alert'),
  ).toContainText('this choice could not be saved');
  await page.reload();
  await theme(page, 'light');
  expect(errors).toEqual([]);
});

test('welcome, all guest routes, and dialogs share a consistent responsive palette', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors = runtime(page);
  const viewports =
    info.project.name === 'desktop'
      ? [
          { width: 1916, height: 952 },
          { width: 1366, height: 768 },
          { width: 820, height: 1180 },
        ]
      : [{ width: 390, height: 844 }];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await theme(page, scheme);
      const welcome = page.getByRole('region', {
        name: 'Your next step',
        exact: true,
      });
      await expect(
        welcome.getByRole('heading', {
          name: 'Keep the right opportunities close.',
        }),
      ).toBeVisible();
      await expect(welcome.getByRole('button')).toHaveCount(1);
      expect(
        await welcome.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeLessThan(300);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (viewport.width === 1916) {
        expect(
          await page
            .locator('.sidebar')
            .evaluate(
              (el) =>
                el.scrollWidth <= el.clientWidth &&
                el.scrollHeight <= el.clientHeight,
            ),
        ).toBe(true);
      }
      await page.screenshot({
        path: info.outputPath(`${scheme}-empty-${viewport.width}.png`),
        fullPage: true,
      });
    }
    for (const path of [
      '/applications',
      '/interviews',
      '/resumes',
      '/resumes/pdf-tools',
      '/career-vault',
      '/settings',
      '/help',
      '/sidekick',
      '/sign-in',
      '/forgot-password',
      '/verify-email',
      '/reset-password',
    ]) {
      await page.goto(path);
      await theme(page, scheme);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        path,
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(
          `${scheme}-${path.slice(1).replaceAll('/', '-')}.png`,
        ),
        fullPage: true,
      });
    }
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Save your first job', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: 'Close form' }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(dialog.getByLabel(/^Job title/)).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`${scheme}-job-dialog.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Save your first job', exact: true }),
    ).toBeFocused();
  }
  // A real persisted application changes the welcome's message and action.
  await page
    .getByRole('button', { name: 'Save your first job', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Synthetic UX opportunity');
  await dialog.getByLabel(/^Company/).fill('Example Studio');
  await dialog.getByLabel(/^Location/).fill('Manila');
  await dialog.getByLabel(/^Source URL/).fill('https://example.test/ux');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Synthetic UX opportunity',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/');
  const welcome = page.getByRole('region', {
    name: 'Your next step',
    exact: true,
  });
  await expect(welcome).toContainText(
    'Synthetic UX opportunity at Example Studio',
  );
  await expect(
    welcome.getByRole('link', { name: 'Review saved job' }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('dark-populated.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('PDF page pixels and exported marks remain unchanged when the interface switches theme', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors = runtime(page);
  await page.goto('/resumes/pdf-tools');
  const bytes = await pdfToolsFixture();
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-theme.pdf',
    mimeType: 'application/pdf',
    buffer: bytes,
  });
  const pdf = page.getByRole('img', { name: 'PDF page 1', exact: true });
  await expect(pdf).toHaveAttribute('data-rendered', 'true', {
    timeout: 30000,
  });
  await page
    .getByRole('combobox', { name: 'What would you like to add?' })
    .selectOption('text');
  await page
    .getByLabel('Text to add', { exact: true })
    .fill('Synthetic theme-independent text');
  await page.getByRole('button', { name: 'Add to page', exact: true }).click();
  const pixels = () => pdf.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const initialPixels = await pixels();
  const mark = page.locator('.pdf-mark-canvas').first();
  const initialMark = await mark.evaluate((el: HTMLCanvasElement) =>
    el.toDataURL(),
  );
  const exports: Buffer[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await theme(page, scheme);
    expect(await pixels()).toBe(initialPixels);
    expect(await mark.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
      initialMark,
    );
    expect(
      await page
        .getByTestId('pdf-edit-page')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(255, 255, 255)');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download completed PDF', exact: true })
      .click();
    const saved = await (await download).path();
    exports.push(await readFile(saved!));
    await page.screenshot({
      path: info.outputPath(`${scheme}-pdf-editor.png`),
      fullPage: true,
    });
  }
  expect(createHash('sha256').update(exports[0]!).digest('hex')).toBe(
    createHash('sha256').update(exports[1]!).digest('hex'),
  );
  expect(errors).toEqual([]);
});
