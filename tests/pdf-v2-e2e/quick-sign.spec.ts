import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pdfWorkspaceFixture } from '../helpers/pdf-tools-v2-fixtures';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { inspectLocalPdf } from '../../apps/web/src/lib/pdf-tools-engine';
import type { PdfElement } from '../../apps/web/src/lib/pdf-tools-model';
import { verifyPdfWithPoppler } from '../helpers/pdf-tools-independent';
test.use({ actionTimeout: 15000 });
const runtime = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtime.set(page, errors);
  page.on('pageerror', () => errors.push('Unhandled page error'));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('Console error');
  });
});
test.afterEach(({ page }) => {
  expect(runtime.get(page)).toEqual([]);
});

async function ready(page: Page, number = 1) {
  await expect(
    page.getByRole('img', { name: `PDF page ${number}`, exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
}
async function open(page: Page, buffer: Buffer, name = 'synthetic-offer.pdf') {
  await page
    .getByLabel('Choose a local PDF', { exact: true })
    .setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await ready(page);
}
async function typed(page: Page, name: string, style = 'classic') {
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page.getByLabel('Name for signature', { exact: true }).fill(name);
  await page.getByLabel('Signature style', { exact: true }).selectOption(style);
  await expect(
    page.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
}
async function markData(page: Page, number = 1): Promise<PdfElement> {
  return JSON.parse(
    (await page
      .getByTestId('signature-mark')
      .nth(number - 1)
      .getAttribute('data-mark')) ?? '{}',
  ) as PdfElement;
}
async function choosePage(page: Page, number: number) {
  await page
    .getByRole('combobox', { name: 'Current page', exact: true })
    .selectOption({ value: String(number - 1) });
  await ready(page, number);
}
async function placePoint(
  page: Page,
  number: number,
  x: number,
  y: number,
  touch: boolean,
) {
  const canvas = page.getByRole('img', {
    name: `PDF page ${number}`,
    exact: true,
  });
  const point = await canvas.evaluate(
    async (element, value) => {
      const stage = element.closest(
        '[aria-label="PDF document pages; scroll to navigate"]',
      )!;
      let rect = element.getBoundingClientRect();
      const bounds = stage.getBoundingClientRect();
      const target = { x: rect.left + value.x, y: rect.top + value.y };
      stage.scrollBy({
        left:
          target.x < bounds.left + 24
            ? target.x - bounds.left - 24
            : target.x > bounds.right - 24
              ? target.x - bounds.right + 24
              : 0,
        top:
          target.y < bounds.top + 24
            ? target.y - bounds.top - 24
            : target.y > bounds.bottom - 24
              ? target.y - bounds.bottom + 24
              : 0,
      });
      await new Promise(requestAnimationFrame);
      rect = element.getBoundingClientRect();
      const paper = element.closest('[data-page-index]') as HTMLElement;
      const width = Number(paper.style.width.replace('px', '')),
        height = Number(paper.style.height.replace('px', ''));
      return {
        x: rect.left + (rect.width * value.x) / width,
        y: rect.top + (rect.height * value.y) / height,
      };
    },
    { x, y },
  );
  // The caller provides CSS local coordinates calculated from the real page
  // bounds. Placement itself runs through the production PDF.js inverse.
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
async function captureComposite(page: Page, number: number, info: TestInfo) {
  await choosePage(page, number);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('1');
  await ready(page, number);
  const images = await page
    .getByRole('img', { name: `PDF page ${number}`, exact: true })
    .evaluate((element) => {
      const base = element as HTMLCanvasElement;
      const copy = document.createElement('canvas');
      copy.width = base.width;
      copy.height = base.height;
      const context = copy.getContext('2d')!;
      context.drawImage(base, 0, 0);
      const rect = base.getBoundingClientRect();
      const marks = Array.from(
        base
          .closest('[data-page-index]')!
          .querySelectorAll<HTMLElement>('[data-testid="signature-mark"]'),
      );
      for (const mark of marks) {
        const box = mark.getBoundingClientRect();
        const canvas = mark.querySelector('canvas')!;
        context.drawImage(
          canvas,
          ((box.left - rect.left) * base.width) / rect.width,
          ((box.top - rect.top) * base.height) / rect.height,
          (box.width * base.width) / rect.width,
          (box.height * base.height) / rect.height,
        );
      }
      return {
        base: base.toDataURL(),
        composite: copy.toDataURL(),
        marks: marks.map((mark) =>
          JSON.parse(mark.dataset.mark!),
        ) as PdfElement[],
        artwork: marks.map((mark) => mark.querySelector('canvas')!.toDataURL()),
      };
    });
  await writeFile(
    info.outputPath(`preview-page-${number}.png`),
    Buffer.from(images.composite.split(',')[1], 'base64'),
  );
  return images;
}
async function compareExport(
  page: Page,
  number: number,
  images: Awaited<ReturnType<typeof captureComposite>>,
  viewWidth: number,
  viewHeight: number,
) {
  await choosePage(page, number);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('1');
  await ready(page, number);
  return page
    .getByRole('img', { name: `PDF page ${number}`, exact: true })
    .evaluate(
      async (element, input) => {
        const actual = element as HTMLCanvasElement,
          width = actual.width,
          height = actual.height;
        const load = async (data: string) => {
          const image = new Image();
          image.src = data;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        };
        const before = await load(input.images.base),
          expected = await load(input.images.composite),
          after = actual
            .getContext('2d')!
            .getImageData(0, 0, width, height).data;
        const delta = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) =>
          Math.max(
            Math.abs(a[i] - b[i]),
            Math.abs(a[i + 1] - b[i + 1]),
            Math.abs(a[i + 2] - b[i + 2]),
          ) > 32;
        let outside = 0,
          outsideExact = 0;
        const results = input.images.marks.map((mark) => {
          const sx = width / input.viewWidth,
            sy = height / input.viewHeight;
          const x0 = Math.max(0, Math.floor((mark.x - 3) * sx)),
            x1 = Math.min(width, Math.ceil((mark.x + mark.width + 3) * sx));
          const y0 = Math.max(0, Math.floor((mark.y - 3) * sy)),
            y1 = Math.min(height, Math.ceil((mark.y + mark.height + 3) * sy));
          let wanted = 0,
            found = 0,
            covered = 0,
            explained = 0;
          const radius = Math.ceil(Math.max(sx, sy));
          const wantedBounds = [width, height, 0, 0],
            actualBounds = [width, height, 0, 0];
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const i = (y * width + x) * 4;
              const want = delta(before, expected, i),
                got = delta(before, after, i);
              if (want) {
                wanted++;
                wantedBounds[0] = Math.min(wantedBounds[0], x);
                wantedBounds[1] = Math.min(wantedBounds[1], y);
                wantedBounds[2] = Math.max(wantedBounds[2], x);
                wantedBounds[3] = Math.max(wantedBounds[3], y);
              }
              if (got) {
                found++;
                actualBounds[0] = Math.min(actualBounds[0], x);
                actualBounds[1] = Math.min(actualBounds[1], y);
                actualBounds[2] = Math.max(actualBounds[2], x);
                actualBounds[3] = Math.max(actualBounds[3], y);
              }
              if (!want && !got) continue;
              let matchActual = false,
                matchExpected = false;
              for (let dy = -radius; dy <= radius; dy++)
                for (let dx = -radius; dx <= radius; dx++) {
                  const px = x + dx,
                    py = y + dy;
                  if (px < 0 || py < 0 || px >= width || py >= height) continue;
                  const j = (py * width + px) * 4;
                  if (want && delta(before, after, j)) matchActual = true;
                  if (got && delta(before, expected, j)) matchExpected = true;
                }
              if (want && matchActual) covered++;
              if (got && matchExpected) explained++;
            }
          return {
            wanted,
            found,
            recall: covered / Math.max(1, wanted),
            precision: explained / Math.max(1, found),
            boundError: Math.max(
              ...wantedBounds.map(
                (value, i) =>
                  Math.abs(value - actualBounds[i]) / (i % 2 === 0 ? sx : sy),
              ),
            ),
          };
        });
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            if (
              input.images.marks.some(
                (mark) =>
                  x >= ((mark.x - 3) * width) / input.viewWidth &&
                  x <= ((mark.x + mark.width + 3) * width) / input.viewWidth &&
                  y >= ((mark.y - 3) * height) / input.viewHeight &&
                  y <= ((mark.y + mark.height + 3) * height) / input.viewHeight,
              )
            )
              continue;
            if (delta(before, after, (y * width + x) * 4)) outside++;
            const i = (y * width + x) * 4;
            if (
              before[i] !== after[i] ||
              before[i + 1] !== after[i + 1] ||
              before[i + 2] !== after[i + 2]
            )
              outsideExact++;
          }
        return { results, outside, outsideExact, width, height };
      },
      { images, viewWidth, viewHeight },
    );
}

test('real Quick Sign exports typed/drawn marks across crops, rotations and mixed pages with matching pixels', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [],
    writes: string[] = [],
    external: string[] = [];
  page.on('pageerror', () => errors.push('page error'));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console error');
  });
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()))
      writes.push(request.method());
    if (
      !['http:', 'blob:', 'data:'].includes(new URL(request.url()).protocol) ||
      (new URL(request.url()).protocol === 'http:' &&
        !new URL(request.url()).hostname.includes('127.0.0.1'))
    )
      external.push('external');
  });
  const pdf = await pdfToolsLib.PDFDocument.load(await pdfWorkspaceFixture());
  pdf.getPage(0).drawRectangle({
    x: 50,
    y: 95,
    width: 512,
    height: 65,
    color: pdfToolsLib.rgb(0.88, 0.95, 0.92),
  });
  pdf.getPage(0).drawLine({
    start: { x: 50, y: 132 },
    end: { x: 310, y: 132 },
    color: pdfToolsLib.rgb(0.3, 0.4, 0.5),
    thickness: 0.5,
  });
  pdf
    .addPage([500, 700])
    .drawText('SYNTHETIC UNCHANGED PAGE', { x: 40, y: 650, size: 14 });
  pdf.getPage(1).drawRectangle({
    x: 240,
    y: 290,
    width: 110,
    height: 270,
    color: pdfToolsLib.rgb(0.68, 0.88, 0.96),
  });
  const original = Buffer.from(await pdf.save());
  const originalHash = createHash('sha256').update(original).digest('hex');
  const model = await inspectLocalPdf(original);
  await page.goto('/dev/pdf-tools-v2');
  await open(page, original);
  await typed(page, 'Alex Rivera');
  const firstBounds = await page
    .getByRole('img', { name: 'PDF page 1', exact: true })
    .boundingBox();
  await placePoint(
    page,
    1,
    firstBounds!.width / 2,
    firstBounds!.height / 2,
    info.project.name === 'mobile',
  );
  const properties = page.getByRole('complementary', {
    name: 'Selected signature properties',
  });
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('0.5');
  await ready(page);
  if (info.project.name === 'mobile')
    await properties.getByRole('button', { name: 'Edit', exact: true }).click();
  await properties.getByRole('button', { name: 'Larger', exact: true }).click();
  expect((await markData(page)).width).toBeGreaterThan(190);
  await properties.getByText('Advanced', { exact: true }).click();
  await properties.getByLabel('Left', { exact: true }).fill('70');
  await properties.getByLabel('Left', { exact: true }).press('Enter');
  await properties.getByLabel('Top', { exact: true }).fill('620');
  await properties.getByLabel('Top', { exact: true }).press('Enter');
  if (info.project.name === 'mobile')
    await properties.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({ path: info.outputPath('signature-selected.png') });
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await page.screenshot({ path: info.outputPath('quick-sign-dark.png') });
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('light');
  await choosePage(page, 2);
  await expect(
    page.getByRole('combobox', { name: 'Current page', exact: true }),
  ).toHaveValue('1');
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  expect(
    await page.locator('#pdf-v2-controls select').first().inputValue(),
  ).toBe('1');
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  expect(
    await page.locator('#pdf-v2-controls select').first().inputValue(),
  ).toBe('1');
  const pad = page.getByLabel(
    'Draw your signature with a pointer. You can also choose Type a signature.',
  );
  const box = await pad.boundingBox();
  expect(box).not.toBeNull();
  if (info.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    const points = Array.from({ length: 25 }, (_, i) => ({
      x: box!.x + box!.width * (0.1 + i * 0.03),
      y: box!.y + box!.height * (0.5 + Math.sin(i * 0.7) * 0.2),
    }));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [points[0]],
    });
    for (const point of points.slice(1))
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point],
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(
      box!.x + box!.width * 0.1,
      box!.y + box!.height * 0.5,
    );
    await page.mouse.down();
    for (let i = 1; i < 25; i++)
      await page.mouse.move(
        box!.x + box!.width * (0.1 + i * 0.03),
        box!.y + box!.height * (0.5 + Math.sin(i * 0.7) * 0.2),
      );
    await page.mouse.up();
  }
  await page.screenshot({ path: info.outputPath('drawn-signature.png') });
  expect(
    await page.locator('#pdf-v2-controls select').first().inputValue(),
  ).toBe('1');
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Current page', exact: true }),
  ).toHaveValue('1');
  await page
    .getByRole('button', { name: 'Place on page 2', exact: true })
    .click();
  await choosePage(page, 3);
  await typed(page, 'Alexandria Remedios Santiago Villanueva', 'simple');
  await page
    .getByRole('button', { name: 'Place on page 3', exact: true })
    .click();
  await choosePage(page, 4);
  await typed(page, 'María José de la Cruz');
  await page
    .getByRole('button', { name: 'Place on page 4', exact: true })
    .click();
  const snapshots = [];
  for (let number = 1; number <= 5; number++)
    snapshots.push(await captureComposite(page, number, info));
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('synthetic-offer-completed.pdf');
  const path = info.outputPath('synthetic-completed.pdf');
  await download.saveAs(path);
  await expect(
    page.getByRole('status').filter({ hasText: 'handed to your browser' }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: info.outputPath('download-feedback.png') });
  const bytes = await readFile(path);
  await verifyPdfWithPoppler(page, info, original, model, snapshots);
  const reopened = await pdfToolsLib.PDFDocument.load(bytes);
  expect(reopened.getPageCount()).toBe(5);
  expect(reopened.getForm().getTextField('Synthetic full name').getText()).toBe(
    'Alex Rivera',
  );
  expect(createHash('sha256').update(original).digest('hex')).toBe(
    originalHash,
  );
  // A fresh document session renders only the exported PDF bytes: no editing
  // overlays or original-byte painter participates in the following comparison.
  await open(page, bytes, 'synthetic-completed.pdf');
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  const measurements = [];
  for (let number = 1; number <= 5; number++) {
    const metrics = await compareExport(
      page,
      number,
      snapshots[number - 1],
      model.pages[number - 1].viewWidth,
      model.pages[number - 1].viewHeight,
    );
    for (const mark of metrics.results) {
      expect(mark.wanted).toBeGreaterThan(30);
      expect(mark.found).toBeGreaterThan(30);
      expect(mark.recall).toBeGreaterThan(0.94);
      expect(mark.precision).toBeGreaterThan(0.94);
      expect(mark.boundError).toBeLessThanOrEqual(1.1);
    }
    expect(metrics.outside).toBe(0);
    if (number === 5) expect(metrics.outsideExact).toBe(0);
    measurements.push({ page: number, ...metrics });
    await page.screenshot({
      path: info.outputPath(`export-page-${number}.png`),
    });
    const png = await page
      .getByRole('img', { name: `PDF page ${number}`, exact: true })
      .evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await writeFile(
      info.outputPath(`export-canvas-${number}.png`),
      Buffer.from(png.split(',')[1], 'base64'),
    );
  }
  await writeFile(
    info.outputPath('pixel-comparison.json'),
    JSON.stringify(measurements, null, 2),
  );
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toMatch(/María José|Alexandria|Alex Rivera|synthetic-offer/);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
});

test('single-page keyboard signing, undo/redo, readable names and failed-export retry preserve work', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const Original = window.Worker;
    let fail = true;
    window.Worker = class extends Original {
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if ((message as { action?: string }).action === 'stamp' && fail) {
          fail = false;
          queueMicrotask(() => this.dispatchEvent(new Event('error')));
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/dev/pdf-tools-v2');
  await open(page, await pdfWorkspaceFixture(true));
  await page.getByRole('button', { name: 'Signature', exact: true }).focus();
  await page.keyboard.press('Enter');
  const name = page.getByLabel('Name for signature', { exact: true });
  await name.fill('Alex 漢');
  await expect(
    page.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Typed styles support basic Latin/),
  ).toBeVisible();
  await name.fill('Alexandria Remedios Santiago Villanueva '.repeat(3));
  await expect(
    page.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeDisabled();
  await expect(name).toHaveValue(
    'Alexandria Remedios Santiago Villanueva '.repeat(3),
  );
  await page.screenshot({ path: info.outputPath('signature-overflow.png') });
  await name.fill('Li');
  await page.screenshot({ path: info.outputPath('typed-creation.png') });
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Place on page 1', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Place or cancel your pending signature' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  const mark = page.getByRole('button', { name: 'Signature: Li', exact: true });
  await expect(mark).toBeFocused();
  const before = await markData(page);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await markData(page)).toMatchObject({
    x: before.x + 10,
    y: before.y + 1,
  });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('signature-mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const saved = await markData(page);
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'completed PDF could not be verified' }),
  ).toBeVisible();
  expect(await markData(page)).toEqual(saved);
  await page.screenshot({ path: info.outputPath('export-failure.png') });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await markData(page)).not.toEqual(saved);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await markData(page)).toEqual(saved);
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  const download = await event;
  await download.saveAs(info.outputPath('synthetic-single-completed.pdf'));
  await expect(
    page.getByRole('status').filter({ hasText: 'handed to your browser' }),
  ).toBeVisible();
  expect(
    (
      await pdfToolsLib.PDFDocument.load(
        await readFile(info.outputPath('synthetic-single-completed.pdf')),
      )
    ).getPageCount(),
  ).toBe(1);
});

test('form-widget overlap is rejected without changing signatures or the completed PDF', async ({
  page,
}, info) => {
  const original = await pdfWorkspaceFixture(true);
  await page.goto('/dev/pdf-tools-v2');
  await open(page, original);
  await typed(page, 'Li');
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  const properties = page.getByRole('complementary', {
    name: 'Selected signature properties',
  });
  if (info.project.name === 'mobile')
    await properties.getByRole('button', { name: 'Edit', exact: true }).click();
  await properties.getByText('Advanced', { exact: true }).click();
  await properties.getByLabel('Left', { exact: true }).fill('70');
  await properties.getByLabel('Left', { exact: true }).press('Enter');
  const saved = await markData(page);
  await properties.getByLabel('Top', { exact: true }).fill('575');
  await properties.getByLabel('Top', { exact: true }).press('Enter');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'cannot cover an existing form field' }),
  ).toBeVisible();
  expect(await markData(page)).toEqual(saved);
  if (info.project.name === 'mobile')
    await properties.getByRole('button', { name: 'Done', exact: true }).click();
  await typed(page, 'Li');
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('fit-page');
  await ready(page);
  const box = await page
    .getByRole('img', { name: 'PDF page 1', exact: true })
    .boundingBox();
  await placePoint(
    page,
    1,
    (box!.width * 150) / 612,
    (box!.height * 605) / 792,
    info.project.name === 'mobile',
  );
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'cannot cover an existing form field' }),
  ).toBeVisible();
  await expect(page.getByTestId('signature-mark')).toHaveCount(1);
  expect(await markData(page)).toEqual(saved);
  await page.screenshot({ path: info.outputPath('form-overlap-blocked.png') });
  await page
    .getByRole('button', { name: 'Cancel placement', exact: true })
    .click();
  const snapshots = [await captureComposite(page, 1, info)];
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await (
    await downloadEvent
  ).saveAs(info.outputPath('synthetic-completed.pdf'));
  await verifyPdfWithPoppler(
    page,
    info,
    original,
    await inspectLocalPdf(original),
    snapshots,
  );
});
