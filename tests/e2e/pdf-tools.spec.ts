import { browserTestOrigin } from '../helpers/browser-origin';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  pdfToolsFixture,
  imageOnlyPdfFixture,
  pdfToolsLib,
} from '../helpers/pdf-tools-fixtures';

async function ready(page: Page, number = 1) {
  await expect(
    page.getByRole('img', { name: `PDF page ${number}`, exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
}
async function open(page: Page, buffer: Buffer, name = 'synthetic-form.pdf') {
  await page
    .getByLabel('Choose a local PDF', { exact: true })
    .setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await ready(page);
}
async function position(
  page: Page,
  x: number,
  y: number,
  width?: number,
  height?: number,
) {
  const selection = page.getByRole('region', { name: 'Selected mark' });
  await selection.getByLabel('Left', { exact: true }).fill(String(x));
  await selection.getByLabel('Top', { exact: true }).fill(String(y));
  if (width)
    await selection.getByLabel('Width', { exact: true }).fill(String(width));
  if (height)
    await selection.getByLabel('Height', { exact: true }).fill(String(height));
}
async function addText(page: Page, text: string, x: number, y: number) {
  await page
    .getByRole('combobox', { name: 'What would you like to add?' })
    .selectOption('text');
  await page.getByLabel('Text to add', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Add to page', exact: true }).click();
  await position(page, x, y);
}
// Inspect the exported page pixels, independent of HTML editing overlays. This
// catches incorrect rotation/crop/zoom transforms, absent marks and clipping.
async function inkBox(
  page: Page,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return page.getByRole('img', { name: /^PDF page/ }).evaluate(
    (canvas, box) => {
      const element = canvas as HTMLCanvasElement,
        context = element.getContext('2d')!;
      const sx = element.width / box.viewWidth,
        sy = element.height / box.viewHeight;
      const data = context.getImageData(
        Math.floor(box.x * sx),
        Math.floor(box.y * sy),
        Math.ceil(box.width * sx),
        Math.ceil(box.height * sy),
      );
      let pixels = 0,
        minX = data.width,
        minY = data.height,
        maxX = -1,
        maxY = -1;
      for (let row = 0; row < data.height; row++)
        for (let col = 0; col < data.width; col++) {
          const i = (row * data.width + col) * 4,
            r = data.data[i],
            g = data.data[i + 1],
            b = data.data[i + 2];
          if (r < 100 && b > r + 20 && b > g + 10) {
            pixels++;
            minX = Math.min(minX, col);
            maxX = Math.max(maxX, col);
            minY = Math.min(minY, row);
            maxY = Math.max(maxY, row);
          }
        }
      return { pixels, minX, minY, maxX, maxY, w: data.width, h: data.height };
    },
    {
      x,
      y,
      width,
      height,
      viewWidth: await page
        .getByTestId('pdf-edit-page')
        .evaluate((element) => Number(element.style.aspectRatio.split('/')[0])),
      viewHeight: await page
        .getByTestId('pdf-edit-page')
        .evaluate((element) => Number(element.style.aspectRatio.split('/')[1])),
    },
  );
}
test('complete a local employment form, signatures and multi-page export without uploading or changing the original', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    writes: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()))
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
    requests.push(request.url());
  });
  const original = await pdfToolsFixture(),
    hash = createHash('sha256').update(original).digest('hex');
  await page.goto('/resumes');
  await page.getByRole('link', { name: 'Open PDF Tools' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF Tools');
  await open(page, original);
  await page
    .getByLabel('Full name', { exact: true })
    .fill('Synthetic Graduate');
  await page.getByLabel('Available', { exact: true }).check();
  await page
    .getByRole('combobox', { name: 'Preferred role', exact: true })
    .selectOption('Trainee');
  await page
    .getByRole('combobox', { name: 'Work arrangement', exact: true })
    .selectOption('Hybrid');
  await page.getByRole('button', { name: 'Apply fields to preview' }).click();
  await ready(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'Form fields updated' }),
  ).toBeVisible();
  await addText(page, 'Graduate notes', 40, 300);
  const mark = page.getByRole('button', {
    name: 'text mark: Graduate notes',
    exact: true,
  });
  await mark.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page
      .getByRole('region', { name: 'Selected mark' })
      .getByLabel('Left', { exact: true }),
  ).toHaveValue('41');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await mark.click();
  await position(page, 40, 300);
  // Drag at a different zoom, then restore the exact position for export checks.
  await page.getByLabel('Zoom', { exact: true }).selectOption('1.5');
  await mark.scrollIntoViewIfNeeded();
  const before = await mark.boundingBox();
  if (info.project.name === 'desktop') {
    await page.mouse.move(before!.x + 5, before!.y + 5);
    await page.mouse.down();
    await page.mouse.move(before!.x + 30, before!.y + 20, { steps: 5 });
    await page.mouse.up();
    expect(
      Number(
        await page
          .getByRole('region', { name: 'Selected mark' })
          .getByLabel('Left', { exact: true })
          .inputValue(),
      ),
    ).toBeGreaterThan(40);
  }
  await position(page, 40, 300, 180, 30);
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page
    .getByRole('combobox', { name: 'What would you like to add?' })
    .selectOption('date');
  await page.getByLabel('Date to add', { exact: true }).fill('2026-10-17');
  await page.getByRole('button', { name: 'Add to page', exact: true }).click();
  await position(page, 40, 350);
  await page
    .getByRole('combobox', { name: 'What would you like to add?' })
    .selectOption('check');
  await page.getByRole('button', { name: 'Add to page', exact: true }).click();
  await position(page, 40, 400);
  await page
    .getByRole('combobox', { name: 'What would you like to add?' })
    .selectOption('signature');
  await page.getByRole('button', { name: 'Create signature mark' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Name for signature')
    .fill('Discarded synthetic draft');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Create signature mark' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Create signature mark' }).click();
  await expect(dialog.getByLabel('Name for signature')).toHaveValue('');
  await dialog.getByLabel('Name for signature').fill('Synthetic Graduate');
  await expect(dialog.getByText('Preview', { exact: true })).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Place signature on page 1' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Create signature mark' }),
  ).toBeFocused();
  await position(page, 300, 430, 210, 70);
  await expect(
    page.getByText('Changes not downloaded', { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('editor.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await ready(page, 2);
  await addText(page, 'Rotated page note', 70, 100);
  await page
    .getByRole('combobox', { name: 'What would you like to add?' })
    .selectOption('signature');
  await page.getByRole('button', { name: 'Create signature mark' }).click();
  await dialog
    .getByRole('combobox', { name: 'How would you like to make it?' })
    .selectOption('draw');
  const pad = dialog.locator('canvas').first(),
    box = await pad.boundingBox();
  await page.mouse.move(box!.x + 25, box!.y + 60);
  await page.mouse.down();
  await page.mouse.move(box!.x + 70, box!.y + 25, { steps: 8 });
  await page.mouse.move(box!.x + 140, box!.y + 85, { steps: 8 });
  await page.mouse.move(box!.x + 250, box!.y + 40, { steps: 8 });
  await page.mouse.up();
  await dialog
    .getByRole('button', { name: 'Place signature on page 2' })
    .click();
  await position(page, 70, 200);
  for (const number of [3, 4]) {
    await page
      .getByLabel('Page number')
      .selectOption({ value: String(number - 1) });
    await ready(page, number);
    await addText(page, 'Page ' + number + ' note', 70, 100);
  }
  // Add/remove/undo covers removable editable marks, then export latest state.
  await page.getByRole('button', { name: 'Remove mark', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download completed PDF' }).click();
  const download = await downloadPromise,
    path = info.outputPath('synthetic-completed.pdf');
  await download.saveAs(path);
  expect(download.suggestedFilename()).toBe('synthetic-form-completed.pdf');
  const completed = await readFile(path),
    parsed = await pdfToolsLib.PDFDocument.load(completed);
  expect(parsed.getPageCount()).toBe(4);
  expect(parsed.getForm().getFields()).toHaveLength(0);
  expect(createHash('sha256').update(original).digest('hex')).toBe(hash);
  await expect(
    page.getByText('Current changes downloaded', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close file', exact: true }).click();
  await open(page, completed, 'synthetic-completed.pdf');
  for (const region of [
    [40, 300, 180, 30],
    [40, 350, 180, 30],
    [40, 400, 24, 24],
    [300, 430, 210, 70],
  ]) {
    const ink = await inkBox(
      page,
      ...(region as [number, number, number, number]),
    );
    expect(ink.pixels).toBeGreaterThan(30);
    expect(ink.minX).toBeGreaterThan(0);
    expect(ink.minY).toBeGreaterThan(0);
    expect(ink.maxX).toBeLessThan(ink.w - 1);
    expect(ink.maxY).toBeLessThan(ink.h - 1);
  }
  await page.screenshot({
    path: info.outputPath('export-page-1.png'),
    fullPage: true,
  });
  for (const number of [2, 3, 4]) {
    await page
      .getByLabel('Page number')
      .selectOption({ value: String(number - 1) });
    await ready(page, number);
    expect((await inkBox(page, 70, 100, 180, 30)).pixels).toBeGreaterThan(30);
    if (number === 2)
      expect((await inkBox(page, 70, 200, 190, 64)).pixels).toBeGreaterThan(
        100,
      );
    await page.screenshot({
      path: info.outputPath('export-page-' + number + '.png'),
      fullPage: true,
    });
  }
  expect(writes).toEqual([]);
  expect(
    requests.every(
      (url) =>
        url.startsWith(browserTestOrigin + '/') ||
        url.startsWith('blob:') ||
        url.startsWith('data:'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toMatch(
    /Graduate notes|Synthetic Graduate|Rotated page note|signature|synthetic-form\.pdf/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('unsupported files, limits, scanned-page guidance and discarding changes are clear', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto('/resumes/pdf-tools');
  const input = page.getByLabel('Choose a local PDF', { exact: true });
  await input.setInputFiles({
    name: 'wrong.docx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('synthetic'),
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Choose a PDF',
  );
  await input.setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nbroken\n%%EOF'),
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'malformed',
  );
  await input.setInputFiles({
    name: 'large.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '10 MiB',
  );
  const many = await pdfToolsLib.PDFDocument.create();
  for (let i = 0; i < 51; i++) many.addPage();
  await input.setInputFiles({
    name: 'many.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await many.save()),
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('1–50');
  await open(page, await imageOnlyPdfFixture(), 'synthetic-scan.pdf');
  await expect(
    page.getByText(/This page has no selectable text/),
  ).toBeVisible();
  await addText(page, 'Scan mark', 50, 150);
  await page.getByRole('link', { name: 'FATS dashboard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(
    'Close without downloading?',
  );
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\/pdf-tools$/);
  await page.getByRole('button', { name: 'Close file', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Close without downloading?');
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(
    page.getByRole('button', { name: 'text mark: Scan mark' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close file', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard and close' }).click();
  await expect(input).toBeEnabled();
  await expect(page.getByTestId('pdf-edit-page')).toHaveCount(0);
  // Opening the original again demonstrates that the prior mark was not saved.
  await open(page, await imageOnlyPdfFixture(), 'synthetic-scan.pdf');
  await expect(
    page.getByRole('button', { name: 'text mark: Scan mark' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('scanned-guidance.png'),
    fullPage: true,
  });
});
