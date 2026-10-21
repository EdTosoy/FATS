import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import {
  pdfWorkspaceFixture,
  rejectedWorkspaceFixture,
} from '../helpers/pdf-tools-v2-fixtures';

type Metrics = {
  workers: { url: string; active: boolean; terminate: () => void }[];
  actions: string[];
  hashes: string[];
  failInspect: boolean;
  killRenderer: boolean;
  points: { page: number; point: { x: number; y: number } }[];
};
declare global {
  interface Window {
    pdfV2Metrics: Metrics;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const metrics: Metrics = {
      workers: [],
      actions: [],
      hashes: [],
      failInspect: false,
      killRenderer: false,
      points: [],
    };
    window.pdfV2Metrics = metrics;
    window.Worker = class extends NativeWorker {
      record: Metrics['workers'][number];
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.record = {
          url: String(url),
          active: true,
          terminate: () => this.terminate(),
        };
        metrics.workers.push(this.record);
        this.addEventListener('message', (event) => {
          if (!(event.data?.bytes instanceof Uint8Array)) return;
          void crypto.subtle
            .digest('SHA-256', new Uint8Array(event.data.bytes))
            .then((buffer) => {
              metrics.hashes.push(
                Array.from(new Uint8Array(buffer), (value) =>
                  value.toString(16).padStart(2, '0'),
                ).join(''),
              );
            });
        });
      }
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        const action = (message as { action?: string })?.action;
        if (action === 'GetDocRequest' && metrics.killRenderer) {
          metrics.killRenderer = false;
          this.terminate();
          return;
        }
        if (action === 'inspect' || action === 'open' || action === 'export') {
          metrics.actions.push(action);
          if (metrics.failInspect) {
            metrics.failInspect = false;
            queueMicrotask(() => this.dispatchEvent(new Event('error')));
            return;
          }
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        this.record.active = false;
        super.terminate();
      }
    };
    document.addEventListener('pdf-tools-point', (event) => {
      metrics.points.push((event as CustomEvent).detail);
    });
  });
});

async function ready(page: Page, number = 1) {
  await expect(
    page.getByRole('img', { name: `PDF page ${number}`, exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
}
async function open(
  page: Page,
  buffer: Buffer,
  name = 'synthetic-harborlight.pdf',
) {
  await page
    .getByLabel('Choose a local PDF', { exact: true })
    .setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await ready(page);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test('real pages, original bytes, thumbnails, coordinates, themes and local-only lifetime', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    writes: string[] = [],
    external: string[] = [];
  page.on('pageerror', () => errors.push('page error'));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console error');
  });
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()))
      writes.push(request.method());
    if (!new URL(request.url()).origin.includes('127.0.0.1:'))
      external.push('external request');
  });
  await page.goto('/dev/pdf-tools-v2');
  await expect(
    page.getByRole('heading', { name: 'Your document, with room to work.' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('empty.png') });
  const bytes = await pdfWorkspaceFixture();
  await open(page, bytes);
  await expect
    .poll(() => page.evaluate(() => window.pdfV2Metrics.hashes))
    .toContain(createHash('sha256').update(bytes).digest('hex'));
  await expect(
    page.getByRole('button', { name: 'Download completed PDF' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Create signature', exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('light');
  await ready(page);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('real-pdf-light.png') });
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const canvas = page.getByRole('img', { name: 'PDF page 1', exact: true });
  expect(
    await canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      return Array.from(
        target.getContext('2d')!.getImageData(target.width - 2, 2, 1, 1).data,
      );
    }),
  ).toEqual([255, 255, 255, 255]);
  await page.screenshot({ path: info.outputPath('real-pdf-dark.png') });
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('button', { name: 'Document information', exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Document information' }),
  ).toContainText('1 · Available in Edit PDF');
  await page.screenshot({ path: info.outputPath('document-information.png') });
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Choose a page', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog', { name: 'Choose a page' })
      .getByTestId('pdf-v2-thumbnail')
      .first(),
  ).toHaveAttribute('data-rendered', 'true');
  await page.screenshot({ path: info.outputPath('page-chooser.png') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Go to page 2', exact: true })
    .click();
  await ready(page, 2);
  await expect(
    page.getByRole('combobox', { name: 'Current page', exact: true }),
  ).toHaveValue('1');
  await page.screenshot({ path: info.outputPath('rotated-cropped.png') });
  // Locate the known colored PDF landmark in actual bitmap pixels. Click its
  // CSS-space centroid; the public canvas boundary must report its PDF point.
  for (const number of [2, 3, 4]) {
    await page
      .getByRole('combobox', { name: 'Current page', exact: true })
      .selectOption({ value: String(number - 1) });
    await ready(page, number);
    for (const zoom of ['0.25', '1', '2']) {
      await page
        .getByRole('combobox', { name: 'PDF zoom', exact: true })
        .selectOption(zoom);
      await ready(page, number);
      const target = page.getByRole('img', {
        name: `PDF page ${number}`,
        exact: true,
      });
      const landmark = await target.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const data = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let x = 0,
          y = 0,
          count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (
            data[i] > 150 &&
            data[i + 1] < 70 &&
            data[i + 2] > 60 &&
            data[i + 2] < 150
          ) {
            const pixel = i / 4;
            x += pixel % canvas.width;
            y += Math.floor(pixel / canvas.width);
            count++;
          }
        }
        return {
          x: (x / count + 0.5) / canvas.width,
          y: (y / count + 0.5) / canvas.height,
          count,
        };
      });
      expect(landmark.count).toBeGreaterThan(0);
      await target.evaluate((element, point) => {
        const stage = element
          .closest('section')!
          .querySelector(
            '[aria-label="PDF document pages; scroll to navigate"]',
          )!;
        const rect = element.getBoundingClientRect(),
          bounds = stage.getBoundingClientRect();
        stage.scrollBy(
          rect.left + rect.width * point.x - bounds.left - bounds.width / 2,
          rect.top + rect.height * point.y - bounds.top - bounds.height / 2,
        );
      }, landmark);
      const rect = await target.boundingBox();
      expect(rect).not.toBeNull();
      const point = {
        x: rect!.x + rect!.width * landmark.x,
        y: rect!.y + rect!.height * landmark.y,
      };
      if (info.project.name === 'mobile')
        await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect
        .poll(() =>
          page.evaluate(() => window.pdfV2Metrics.points.at(-1)?.page),
        )
        .toBe(number - 1);
      const mapped = await page.evaluate(
        () => window.pdfV2Metrics.points.at(-1)!.point,
      );
      expect(Math.abs(mapped.x - 126)).toBeLessThan(2.1);
      expect(Math.abs(mapped.y - 146)).toBeLessThan(2.1);
      expect(
        await target.evaluate(
          (element) =>
            (element as HTMLCanvasElement).width *
            (element as HTMLCanvasElement).height,
        ),
      ).toBeLessThanOrEqual(4_000_000);
    }
    await page
      .getByRole('combobox', { name: 'PDF zoom', exact: true })
      .selectOption('fit-page');
  }
  await page
    .getByRole('combobox', { name: 'Current page', exact: true })
    .selectOption({ value: '0' });
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('fit-width');
  await ready(page);
  await page.screenshot({ path: info.outputPath('fit-width.png') });
  await noOverflow(page);
  expect(await page.getByTestId('pdf-v2-canvas').count()).toBeLessThanOrEqual(
    3,
  );
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pdfV2Metrics.workers.filter((worker) => worker.active).length,
      ),
    )
    .toBe(0);
  expect(await page.evaluate(() => window.pdfV2Metrics.actions)).toEqual([
    'inspect',
  ]);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toMatch(/Alex Rivera|synthetic-harborlight|harborlight labs/i);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
});

test('keyboard navigation, fit controls, scroll, replacement and narrow layout', async ({
  page,
}, info) => {
  await page.goto('/dev/pdf-tools-v2');
  await open(page, await pdfWorkspaceFixture());
  const current = page.getByRole('combobox', {
    name: 'Current page',
    exact: true,
  });
  await current.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await ready(page, 2);
  await page.getByRole('button', { name: 'Next page', exact: true }).focus();
  await page.keyboard.press('Enter');
  await ready(page, 3);
  await page
    .getByRole('button', { name: 'Previous page', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await ready(page, 2);
  const zoom = page.getByRole('combobox', { name: 'PDF zoom', exact: true });
  await zoom.selectOption({ value: '1' });
  await ready(page, 2);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(zoom).toHaveValue('1.25');
  await ready(page, 2);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(zoom).toHaveValue('1');
  await page
    .getByRole('button', { name: 'Choose a page', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Choose a page', exact: true }),
  ).toBeFocused();
  await zoom.selectOption('fit-page');
  await page
    .getByLabel('PDF document pages; scroll to navigate', { exact: true })
    .focus();
  await page.keyboard.press('Control+End');
  await expect(current).toHaveValue('3');
  await ready(page, 4);
  await open(page, await pdfWorkspaceFixture(true), 'synthetic-single.pdf');
  await expect(current).toHaveValue('0');
  await expect(
    page.getByRole('button', { name: 'Next page', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pdfV2Metrics.workers.filter((worker) => worker.active).length,
      ),
    )
    .toBe(1);
  await page.setViewportSize({ width: 320, height: 568 });
  await noOverflow(page);
  for (const label of [
    'Choose a page',
    'Next page',
    'Previous page',
    'Zoom in',
    'Zoom out',
  ]) {
    const box = await page
      .getByRole('button', { name: label, exact: true })
      .boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(43.9);
    expect(box!.height).toBeGreaterThanOrEqual(43.9);
  }
  await page.screenshot({ path: info.outputPath('narrow-320.png') });
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pdfV2Metrics.workers.filter((worker) => worker.active).length,
      ),
    )
    .toBe(0);
});

test('fixed validation errors, processing-worker failure, renderer failure and recovery', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const runtimeErrors: string[] = [];
  page.on('pageerror', () => runtimeErrors.push('Unhandled page error'));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push('Console error');
  });
  await page.goto('/dev/pdf-tools-v2');
  const input = page.getByLabel('Choose a local PDF', { exact: true });
  const cases: [string, Buffer, RegExp][] = [
    ['wrong.txt', Buffer.from('synthetic'), /Choose a PDF file/],
    ['empty.pdf', Buffer.alloc(0), /nonempty PDF/],
    ['large.pdf', Buffer.alloc(10 * 1024 * 1024 + 1), /10 MiB/],
    ['malformed.pdf', Buffer.from('%PDF-1.7\ninvalid\n%%EOF'), /malformed/],
    ['encrypted.pdf', await rejectedWorkspaceFixture('encrypted'), /encrypted/],
    ['active.pdf', await rejectedWorkspaceFixture('active'), /unsupported/],
    ['pages.pdf', await rejectedWorkspaceFixture('pages'), /1–50 pages/],
    [
      'dimensions.pdf',
      await rejectedWorkspaceFixture('dimensions'),
      /dimensions/,
    ],
  ];
  for (const [name, buffer, message] of cases) {
    await input.setInputFiles({ name, mimeType: 'application/pdf', buffer });
    await expect(
      page.locator('[data-pdf-v2-workspace]').getByRole('alert'),
    ).toContainText(message);
    await expect(page.getByTestId('pdf-v2-canvas')).toHaveCount(0);
  }
  await page.screenshot({ path: info.outputPath('unsupported.png') });
  await page.evaluate(() => {
    window.pdfV2Metrics.failInspect = true;
  });
  await input.setInputFiles({
    name: 'worker-failure.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(true),
  });
  await expect(
    page.locator('[data-pdf-v2-workspace]').getByRole('alert'),
  ).toContainText('worker stopped');
  // Terminate the actual PDF.js worker while it is opening the document,
  // before thumbnails can cache page operators. Exercise the real deadline.
  await page.evaluate(() => {
    window.pdfV2Metrics.killRenderer = true;
  });
  await input.setInputFiles({
    name: 'renderer-worker-failure.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(true),
  });
  await expect(
    page.locator('[data-pdf-v2-workspace]').getByRole('alert'),
  ).toContainText('renderer took too long', { timeout: 25000 });
  await page.screenshot({ path: info.outputPath('renderer-failure.png') });
  await open(page, await pdfWorkspaceFixture(true), 'synthetic-recovered.pdf');
  await ready(page);
  // A transient canvas allocation failure supports an in-place retry.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      if (this.dataset.testid === 'pdf-v2-canvas') {
        HTMLCanvasElement.prototype.getContext = original;
        return null;
      }
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption({ value: '1' });
  await expect(
    page.getByRole('button', { name: 'Retry page 1', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('page-render-failure.png') });
  await page.getByRole('button', { name: 'Retry page 1', exact: true }).click();
  await ready(page);
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pdfV2Metrics.workers.filter((worker) => worker.active).length,
      ),
    )
    .toBe(0);
  expect(runtimeErrors).toEqual([]);
});

test('replacement and close cancel a delayed local read without reviving a stale document', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'synthetic-delayed.pdf')
        await new Promise((resolve) => setTimeout(resolve, 300));
      return original.call(this);
    };
  });
  await page.goto('/dev/pdf-tools-v2');
  const buffer = await pdfWorkspaceFixture(true);
  const input = page.getByLabel('Choose a local PDF', { exact: true });
  await input.setInputFiles({
    name: 'synthetic-delayed.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await open(page, buffer, 'synthetic-replacement.pdf');
  await expect(page.locator('[data-pdf-v2-workspace] header')).toContainText(
    'synthetic-replacement.pdf',
  );
  await expect
    .poll(() => page.evaluate(() => window.pdfV2Metrics.actions))
    .toEqual(['inspect']);
  await page.waitForTimeout(350); // Beyond the deliberately delayed cancelled read.
  await expect(page.locator('[data-pdf-v2-workspace] header')).toContainText(
    'synthetic-replacement.pdf',
  );
  await page
    .getByRole('link', { name: 'Return to current PDF Tools', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'PDF Tools', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pdfV2Metrics.workers.filter((worker) => worker.active).length,
      ),
    )
    .toBe(0);
});
