import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  organizationFixture,
  annotatedOrganizationFixture,
} from '../helpers/pdf-tools-organization-fixtures';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { verifyPageCopyWithPoppler } from '../helpers/pdf-tools-page-output-independent';

test.setTimeout(180000);
test.use({ actionTimeout: 15000 });
const runtime = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtime.set(page, errors);
  page.on('pageerror', () => errors.push('Unhandled page error'));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('Console error');
  });
  page.on('request', (request) => {
    if (
      /\/api\//.test(request.url()) &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
    )
      errors.push('Unexpected API mutation');
  });
  await page.addInitScript(() => {
    const state = window as unknown as { inspectedHashes: string[] };
    state.inspectedHashes = [];
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (event.data.bytes instanceof Uint8Array)
            void crypto.subtle
              .digest('SHA-256', new Uint8Array(event.data.bytes))
              .then((digest) =>
                state.inspectedHashes.push(
                  Array.from(new Uint8Array(digest))
                    .map((byte) => byte.toString(16).padStart(2, '0'))
                    .join(''),
                ),
              );
        });
      }
    };
  });
});
test.afterEach(({ page }) => expect(runtime.get(page)).toEqual([]));
const ready = (page: Page, number = 1) =>
  expect(
    page.getByRole('img', { name: `PDF page ${number}`, exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
async function open(page: Page, bytes: Buffer) {
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-pages.pdf',
    mimeType: 'application/pdf',
    buffer: bytes,
  });
  await ready(page);
}
async function organize(page: Page) {
  if (
    !(await page
      .getByRole('button', { name: 'Organize pages', exact: true })
      .isVisible())
  )
    await page
      .getByRole('button', { name: 'Choose a page', exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Organize pages', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Organize pages', exact: true });
}
async function addText(page: Page, value: string, number = 1) {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: `Place on page ${number}`, exact: true })
    .click();
  const editor = page.getByRole('textbox', {
    name: 'Edit added text',
    exact: true,
  });
  await editor.fill(value);
  await editor.press('Control+Enter');
}
async function download(
  page: Page,
  info: TestInfo,
  button: string,
  name: string,
) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await event;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const path = info.outputPath(name);
  await file.saveAs(path);
  return path;
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png');
  await page.screenshot({ path });
  await mkdir('docs/assets/pdf-tools-2-phase-4b', { recursive: true });
  await copyFile(
    path,
    `docs/assets/pdf-tools-2-phase-4b/${name}-${info.project.name}.png`,
  );
}

test('extracts noncontiguous edited pages and splits multiple sections with exact independent pixels', async ({
  page,
}, info) => {
  const original = await organizationFixture();
  await open(page, original);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await addText(page, 'Synthetic copied text');
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alex Synthetic');
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Choose a date' })
    .getByLabel('Date', { exact: true })
    .fill('2026-10-21');
  await page.getByRole('button', { name: 'Use date', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Date: 21 Oct 2026', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('combobox', { name: 'Current page', exact: true })
    .selectOption({ value: '2' });
  await expect(
    page.getByRole('combobox', { name: 'Current page', exact: true }),
  ).toHaveValue('2');
  await ready(page, 3);
  await page.getByRole('button', { name: 'Initials', exact: true }).click();
  await page.getByLabel('Initials', { exact: true }).fill('AS');
  await page.getByRole('button', { name: 'Use initials', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 3', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Initials: AS', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('combobox', { name: 'Current page', exact: true })
    .selectOption({ value: '4' });
  await ready(page, 5);
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 5', exact: true })
    .click();
  let dialog = await organize(page);
  await dialog
    .getByRole('button', {
      name: 'Select page 3, original page 3',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Move to position', exact: true })
    .selectOption('0');
  await dialog
    .getByRole('button', { name: 'Rotate right', exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: 'Select page 2, original page 1',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('button', { name: 'Rotate left', exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: 'Select page 5, original page 5',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('button', { name: 'Rotate right', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await ready(page, 5);
  const complete = await download(
    page,
    info,
    'Download completed PDF',
    'complete-edited.pdf',
  );
  dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Extract pages', exact: true })
    .click();
  await dialog
    .getByRole('textbox', { name: 'Include pages', exact: true })
    .fill('5, 1-2');
  await dialog
    .getByRole('button', { name: 'Apply range', exact: true })
    .click();
  await expect(
    dialog.getByText('3 pages selected', { exact: true }),
  ).toBeVisible();
  await dialog.getByText('Preview pages 1–2, 5', { exact: true }).click();
  await expect(
    dialog.getByText('Output page 3 · Document page 5', { exact: true }),
  ).toBeVisible();
  await screenshot(page, info, 'extract-preview');
  let downloads = 0;
  page.on('download', () => downloads++);
  await dialog
    .getByRole('button', { name: 'Prepare extracted PDF', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 1', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  expect(downloads).toBe(0);
  const extracted = await download(
    page,
    info,
    'Download PDF 1',
    'noncontiguous-extracted.pdf',
  );
  await verifyPageCopyWithPoppler(
    page,
    info,
    complete,
    extracted,
    [1, 2, 5],
    'extract',
  );
  await dialog
    .getByRole('button', { name: 'Split document', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'One page per PDF', exact: true })
    .click();
  await expect(
    dialog.getByText('5 PDFs planned', { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Clear splits', exact: true })
    .click();
  await dialog
    .getByRole('checkbox', { name: 'Split after page 2', exact: true })
    .check();
  await dialog
    .getByRole('checkbox', { name: 'Split after page 4', exact: true })
    .check();
  await expect(
    dialog.getByText('3 PDFs planned', { exact: true }),
  ).toBeVisible();
  await screenshot(page, info, 'split-boundaries');
  await dialog.getByText('Preview pages 1–2', { exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Prepare split PDFs', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 3', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  expect(downloads).toBe(1);
  for (const [index, positions] of [[1, 2], [3, 4], [5]].entries()) {
    const path = await download(
      page,
      info,
      `Download PDF ${index + 1}`,
      `split-${index + 1}.pdf`,
    );
    await verifyPageCopyWithPoppler(
      page,
      info,
      complete,
      path,
      positions,
      `split-${index + 1}`,
    );
  }
  await screenshot(page, info, 'split-ready');
  const hashes = await page.evaluate(
    () => (window as unknown as { inspectedHashes: string[] }).inspectedHashes,
  );
  expect(
    hashes.filter(
      (hash) => hash === createHash('sha256').update(original).digest('hex'),
    ).length,
  ).toBeGreaterThanOrEqual(5);
  await dialog.getByRole('button', { name: 'Organize', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Undo page or content change', exact: true })
    .click();
  // Output planning, preparation and downloads did not add history: one undo
  // reverses the last actual page rotation, retaining its identity and edits.
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 5, original page 5',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    dialog.getByRole('button', {
      name: 'Redo page or content change',
      exact: true,
    }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
});

test('one-page extraction, native keyboard and touch selection, range errors and safe cancellation', async ({
  page,
}, info) => {
  const original = await organizationFixture(1);
  const originalPath = info.outputPath('single-page-original.pdf');
  await writeFile(originalPath, original);
  await open(page, original);
  let dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Split document', exact: true })
    .click();
  await expect(dialog.getByText(/at least two pages to split/)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Prepare split PDFs', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('button', { name: 'Extract pages', exact: true })
    .click();
  const check = dialog.getByRole('checkbox', {
    name: 'Include page 1',
    exact: true,
  });
  if (info.project.name === 'mobile') await check.tap();
  else {
    await check.focus();
    await check.press('Space');
  }
  await expect(
    dialog.getByText('1 page selected', { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Include pages', exact: true })
    .fill('2');
  await dialog
    .getByRole('button', { name: 'Apply range', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('between 1 and 1');
  await expect(check).toBeChecked();
  await dialog
    .getByRole('textbox', { name: 'Include pages', exact: true })
    .fill('1');
  await dialog
    .getByRole('textbox', { name: 'Include pages', exact: true })
    .press('Enter');
  await dialog
    .getByRole('button', { name: 'Prepare extracted PDF', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 1', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const path = await download(page, info, 'Download PDF 1', 'single-page.pdf');
  expect(
    (await pdfToolsLib.PDFDocument.load(await readFile(path))).getPageCount(),
  ).toBe(1);
  await verifyPageCopyWithPoppler(
    page,
    info,
    originalPath,
    path,
    [1],
    'single-page',
  );
  await dialog.getByRole('button', { name: 'Organize', exact: true }).click();
  await expect(
    dialog.getByRole('button', {
      name: 'Undo page or content change',
      exact: true,
    }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toHaveCount(0);
  await open(page, await organizationFixture(2));
  dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Extract pages', exact: true })
    .click();
  const first = dialog.getByRole('checkbox', {
    name: 'Include page 1',
    exact: true,
  });
  await first.focus();
  await first.press('Space');
  await page.keyboard.press('Escape');
  dialog = await organize(page);
  await expect(
    dialog.getByRole('button', {
      name: 'Undo page or content change',
      exact: true,
    }),
  ).toBeDisabled();
  const splitMode = dialog.getByRole('button', {
    name: 'Split document',
    exact: true,
  });
  await splitMode.focus();
  await splitMode.press('Enter');
  const boundary = dialog.getByRole('checkbox', {
    name: 'Split after page 1',
    exact: true,
  });
  if (info.project.name === 'mobile') await boundary.tap();
  else {
    await boundary.focus();
    await boundary.press('Space');
  }
  await expect(
    dialog.getByText('2 PDFs planned', { exact: true }),
  ).toBeVisible();
  const preview = dialog.getByText('Preview pages 2', { exact: true });
  await preview.focus();
  await preview.press('Enter');
  await expect(
    dialog.getByText('Output page 1 · Document page 2', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('partial preparation and browser download failures keep ready files and edits for retry', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    let copies = 0;
    window.Worker = class extends Original {
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (
          (message as { action?: string }).action === 'extract' &&
          ++copies === 2
        ) {
          queueMicrotask(() => this.dispatchEvent(new Event('error')));
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
    const click = HTMLAnchorElement.prototype.click;
    let fail = true;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith('blob:') && fail) {
        fail = false;
        throw new Error('Synthetic download failure');
      }
      return click.call(this);
    };
  });
  await open(page, await organizationFixture(3));
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await addText(page, 'Retained unsaved synthetic text');
  const dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Split document', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'One page per PDF', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Prepare split PDFs', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'could not be verified',
    { timeout: 30000 },
  );
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 1', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 2', exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Prepare remaining PDFs', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 3', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  let downloads = 0;
  page.on('download', () => downloads++);
  await dialog
    .getByRole('button', { name: 'Download PDF 1', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'could not start this download',
  );
  expect(downloads).toBe(0);
  const path = await download(page, info, 'Download PDF 1', 'retry-part.pdf');
  expect(
    (await pdfToolsLib.PDFDocument.load(await readFile(path))).getPageCount(),
  ).toBe(1);
  await expect(
    dialog.getByText(/device saving cannot be confirmed here/),
  ).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Organize', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeEnabled();
});

test('cancelled preparation and changed choices cannot expose a stale copy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    let hold = true;
    const timing = window as unknown as { heldCopy: boolean };
    timing.heldCopy = false;
    window.Worker = class extends Original {
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if ((message as { action?: string }).action === 'extract' && hold) {
          hold = false;
          timing.heldCopy = true;
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
    const state = window as unknown as { revokedCopies: number };
    state.revokedCopies = 0;
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      state.revokedCopies++;
      revoke.call(URL, url);
    };
  });
  await open(page, await organizationFixture(2));
  const dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Extract pages', exact: true })
    .click();
  await dialog
    .getByRole('checkbox', { name: 'Include page 1', exact: true })
    .check();
  await dialog
    .getByRole('button', { name: 'Prepare extracted PDF', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Cancel preparation', exact: true }),
  ).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { heldCopy: boolean }).heldCopy,
  );
  await dialog
    .getByRole('button', { name: 'Cancel preparation', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Prepare extracted PDF', exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 1', exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Prepare extracted PDF', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 1', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const revoked = await page.evaluate(
    () => (window as unknown as { revokedCopies: number }).revokedCopies,
  );
  await dialog
    .getByRole('checkbox', { name: 'Include page 2', exact: true })
    .check();
  await expect(
    dialog.getByRole('button', { name: 'Download PDF 1', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { revokedCopies: number }).revokedCopies,
    ),
  ).toBeGreaterThan(revoked);
  await dialog.getByRole('button', { name: 'Organize', exact: true }).click();
  await expect(
    dialog.getByRole('button', {
      name: 'Undo page or content change',
      exact: true,
    }),
  ).toBeDisabled();
});

test('unsafe forms, annotations and page-dependent structures explain rejection without affecting editing', async ({
  page,
}, info) => {
  for (const original of [
    await employmentEditingFixture(),
    await annotatedOrganizationFixture('link'),
    await annotatedOrganizationFixture('tagged'),
    await annotatedOrganizationFixture('printRange'),
  ]) {
    await open(page, original);
    const dialog = await organize(page);
    await dialog
      .getByRole('button', { name: 'Extract pages', exact: true })
      .click();
    await expect(dialog.getByRole('note')).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', { name: 'Include page 1', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', {
        name: 'Prepare extracted PDF',
        exact: true,
      }),
    ).toBeDisabled();
    await screenshot(page, info, 'unsupported-output');
    await dialog
      .getByRole('button', { name: 'Split document', exact: true })
      .click();
    await expect(
      dialog.getByRole('button', { name: 'Prepare split PDFs', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Organize', exact: true }).click();
    await expect(
      dialog.getByRole('button', {
        name: 'Undo page or content change',
        exact: true,
      }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  }
});

test('extract and split controls remain reachable at 320 pixels', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page, await organizationFixture(2));
  const dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Extract pages', exact: true })
    .click();
  await dialog
    .getByRole('checkbox', { name: 'Include page 1', exact: true })
    .check();
  await expect(
    dialog.getByRole('button', { name: 'Prepare extracted PDF', exact: true }),
  ).toBeInViewport();
  await screenshot(page, info, 'extract-320');
  await dialog
    .getByRole('button', { name: 'Split document', exact: true })
    .click();
  await dialog
    .getByRole('checkbox', { name: 'Split after page 1', exact: true })
    .check();
  await expect(
    dialog.getByRole('button', { name: 'Prepare split PDFs', exact: true }),
  ).toBeInViewport();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await screenshot(page, info, 'split-320');
});
