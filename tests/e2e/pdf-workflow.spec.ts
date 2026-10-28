import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pdfToolsFixture, pdfToolsLib } from '../helpers/pdf-tools-fixtures';
async function ready(page: Page, number = 1) {
  await expect(
    page.getByRole('img', { name: `PDF page ${number}`, exact: true }),
  ).toHaveAttribute('data-rendered', 'true');
}
async function open(page: Page) {
  const bytes = await pdfToolsFixture();
  await page.goto('/resumes/pdf-tools');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-form.pdf',
    mimeType: 'application/pdf',
    buffer: bytes,
  });
  await ready(page);
  return bytes;
}
async function position(page: Page, x: number, y: number) {
  const selected = page.getByRole('region', {
    name: 'Selected mark',
    exact: true,
  });
  await selected.getByLabel('Left', { exact: true }).fill(String(x));
  await selected.getByLabel('Top', { exact: true }).fill(String(y));
}
for (const theme of ['light', 'dark'] as const)
  test(`${theme}: edit, explicit review, marks and download form one continuous local workflow`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    const writes: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.method());
      if (r.url().startsWith('http')) requests.push(r.url());
    });
    for (const width of info.project.name === 'mobile' ? [390, 360] : [1440]) {
      await page.setViewportSize({
        width,
        height: info.project.name === 'mobile' ? 664 : 1100,
      });
      await page.emulateMedia({ colorScheme: theme });
      const original = await open(page);
      const hash = createHash('sha256').update(original).digest('hex');
      await writeFile(info.outputPath(`original-${width}.pdf`), original);
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
      await expect(
        page.getByText('Form changes are waiting to appear in the preview.', {
          exact: true,
        }),
      ).toBeVisible();
      // Review alone deliberately does not apply anything or clear the pending state.
      await page
        .getByRole('button', { name: 'Review page', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Preview page 1', exact: true }),
      ).toBeFocused();
      const completed = page.getByRole('region', {
        name: 'Completed PDF download',
        exact: true,
      });
      await expect(completed).toContainText(
        'Form changes are not shown in this preview yet',
      );
      await page.screenshot({
        path: info.outputPath(`pending-${width}.png`),
        fullPage: true,
      });
      await completed
        .getByRole('button', { name: 'Back to editing', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Edit page 1', exact: true }),
      ).toBeFocused();
      await page
        .getByRole('button', { name: 'Apply fields to preview', exact: true })
        .click();
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Form fields updated in the preview.' }),
      ).toBeVisible();
      await ready(page);
      await expect(
        page.getByRole('heading', { name: 'Preview page 1', exact: true }),
      ).toBeFocused();
      const heading = (await page
        .getByRole('heading', { name: 'Preview page 1', exact: true })
        .boundingBox())!;
      expect(heading.y).toBeGreaterThanOrEqual(0);
      expect(heading.y).toBeLessThan(80);
      await expect(completed).not.toContainText(
        'not shown in this preview yet',
      );
      await page
        .getByRole('button', { name: 'Edit fields and marks', exact: true })
        .click();
      await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
        'Synthetic Graduate',
      );
      await page.getByLabel('Text to add', { exact: true }).fill('F07 note');
      await page
        .getByRole('button', { name: 'Add to page', exact: true })
        .click();
      const selection = page.getByRole('region', {
        name: 'Selected mark',
        exact: true,
      });
      await selection
        .getByLabel('Edit mark text', { exact: true })
        .fill('F07 reviewed note');
      await position(page, 40, 300);
      await page
        .getByRole('button', { name: 'Review page', exact: true })
        .click();
      const mark = page.getByRole('button', {
        name: 'text mark: F07 reviewed note',
        exact: true,
      });
      await expect(mark).toHaveAttribute('aria-pressed', 'true');
      if (info.project.name === 'mobile') await mark.tap();
      else await mark.click();
      await mark.focus();
      await page.keyboard.press('ArrowRight');
      await expect(selection.getByLabel('Left', { exact: true })).toHaveValue(
        '41',
      );
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await mark.click();
      await page
        .getByRole('button', { name: 'Edit selected mark', exact: true })
        .click();
      await expect(selection).toBeFocused();
      await position(page, 40, 300);
      const tool = page.getByRole('combobox', {
        name: 'What would you like to add?',
        exact: true,
      });
      await tool.selectOption('signature');
      await page
        .getByRole('button', { name: 'Create signature mark', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByLabel('Name for signature', { exact: true })
        .fill('Discarded draft');
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', {
          name: 'Create signature mark',
          exact: true,
        }),
      ).toBeFocused();
      await page
        .getByRole('button', { name: 'Create signature mark', exact: true })
        .click();
      await expect(
        dialog.getByLabel('Name for signature', { exact: true }),
      ).toHaveValue('');
      await dialog
        .getByLabel('Name for signature', { exact: true })
        .fill('F07 Graduate');
      await dialog
        .getByRole('button', { name: 'Place signature on page 1', exact: true })
        .click();
      await position(page, 40, 440);
      await page
        .getByRole('button', { name: 'Review page', exact: true })
        .click();
      await page.getByLabel('Zoom', { exact: true }).selectOption('1.5');
      await page.getByLabel('Zoom', { exact: true }).selectOption('1');
      await page
        .getByRole('button', { name: 'Next page', exact: true })
        .click();
      await ready(page, 2);
      await expect(
        page.getByRole('heading', { name: 'Preview page 2', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('No editable form fields on this page.', {
          exact: false,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Previous page', exact: true })
        .click();
      await ready(page);
      await page
        .getByRole('button', { name: 'Close file', exact: true })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Keep editing', exact: true })
        .click();
      await expect(
        page.getByRole('button', {
          name: 'text mark: F07 reviewed note',
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Review page', exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath(`review-${width}.png`),
        fullPage: true,
      });
      const download = page.getByRole('button', {
        name: 'Download completed PDF',
        exact: true,
      });
      await expect(download).toHaveCount(1);
      await expect(
        completed.getByRole('button', {
          name: 'Download completed PDF',
          exact: true,
        }),
      ).toHaveCount(1);
      const metrics = await page.evaluate(() => {
        const top = (e: Element | null) =>
          e!.getBoundingClientRect().top + scrollY;
        return {
          field: top(document.querySelector('.pdf-field input')),
          preview: top(document.querySelector('[data-testid="pdf-edit-page"]')),
          download: top(
            [...document.querySelectorAll('button')].find((e) =>
              e.textContent?.includes('Download completed PDF'),
            )!,
          ),
        };
      });
      if (info.project.name === 'mobile') {
        expect(metrics.field).toBeLessThan(metrics.preview);
        expect(metrics.download).toBeGreaterThan(metrics.preview);
      }
      await writeFile(
        info.outputPath(`metrics-${width}.json`),
        JSON.stringify(metrics, null, 2),
      );
      const pending = page.waitForEvent('download');
      await download.click();
      const file = await pending;
      const output = info.outputPath(`completed-${width}.pdf`);
      await file.saveAs(output);
      expect(file.suggestedFilename()).toBe('synthetic-form-completed.pdf');
      const source = await pdfToolsLib.PDFDocument.load(original);
      const result = await pdfToolsLib.PDFDocument.load(await readFile(output));
      expect(result.getPageCount()).toBe(4);
      expect(result.getForm().getFields()).toHaveLength(0);
      result.getPages().forEach((p, i) => {
        expect(p.getMediaBox()).toEqual(source.getPage(i).getMediaBox());
        expect(p.getCropBox()).toEqual(source.getPage(i).getCropBox());
        expect(p.getRotation()).toEqual(source.getPage(i).getRotation());
      });
      expect(createHash('sha256').update(original).digest('hex')).toBe(hash);
      await expect(completed).toContainText('Current changes downloaded');
      await expect(completed.getByRole('status')).toContainText(
        'Completed copy prepared for download',
      );
      await page.screenshot({
        path: info.outputPath(`downloaded-${width}.png`),
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Close file', exact: true })
        .click();
    }
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      requests.every((u) => new URL(u).origin === new URL(page.url()).origin),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test('failed form preview/export retains inputs and recovers; pending fields still export current edits', async ({
  page,
}, info) => {
  await open(page);
  const field = page.getByLabel('Full name', { exact: true });
  await field.fill('Synthetic 😀');
  await page
    .getByRole('button', { name: 'Apply fields to preview', exact: true })
    .click();
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('Western European');
  await expect(alert).toBeFocused();
  await expect(field).toHaveValue('Synthetic 😀');
  let downloads = 0;
  page.on('download', () => downloads++);
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await expect(alert).toContainText('Western European');
  await expect(alert).toBeFocused();
  expect(downloads).toBe(0);
  await page.screenshot({
    path: info.outputPath('failed-preview-export.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Back to editing', exact: true })
    .click();
  await field.fill('Recovered synthetic graduate');
  await page.getByRole('button', { name: 'Review page', exact: true }).click();
  const completed = page.getByRole('region', {
    name: 'Completed PDF download',
    exact: true,
  });
  await expect(completed).toContainText(
    'downloading still includes your latest edits',
  );
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  const file = await pending;
  await file.saveAs(info.outputPath('pending-fields-completed.pdf'));
  await expect(completed).toContainText('Current changes downloaded');
  // Download intentionally doesn't silently change the preview or discard edits.
  await expect(completed).toContainText('not shown in this preview yet');
  await expect(field).toHaveValue('Recovered synthetic graduate');
  await page.screenshot({
    path: info.outputPath('pending-fields-downloaded.png'),
    fullPage: true,
  });
});
