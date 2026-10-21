import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  mergeFixture,
  paddedMergeFixture,
} from '../helpers/pdf-tools-merge-fixtures';
import { annotatedOrganizationFixture } from '../helpers/pdf-tools-organization-fixtures';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import {
  encryptedPdfFixture,
  signedPdfFixture,
} from '../helpers/pdf-tools-security-fixtures';
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
    if (!['GET', 'HEAD'].includes(request.method()))
      errors.push('Unexpected non-read request');
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== '127.0.0.1'
    )
      errors.push('Unexpected external request');
  });
  await page.addInitScript(() => {
    const state = window as unknown as {
      mergeWorkers: number;
      mergeRevokes: number;
    };
    state.mergeWorkers = 0;
    state.mergeRevokes = 0;
    const Original = window.Worker;
    window.Worker = class extends Original {
      private live = true;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.mergeWorkers++;
      }
      override terminate() {
        if (this.live) {
          this.live = false;
          state.mergeWorkers--;
        }
        super.terminate();
      }
    };
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      state.mergeRevokes++;
      revoke.call(URL, url);
    };
  });
});
test.afterEach(({ page }) => expect(runtime.get(page)).toEqual([]));
const file = (name: string, buffer: Buffer) => ({
  name,
  mimeType: 'application/pdf',
  buffer,
});
async function open(page: Page, buffer?: Buffer) {
  await page.goto('/dev/pdf-tools-v2');
  await page
    .getByLabel('Choose a local PDF', { exact: true })
    .setInputFiles(
      file('active.pdf', buffer ?? (await mergeFixture('ACTIVE', 1))),
    );
  await expect(
    page.getByRole('img', { name: 'PDF page 1', exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
}
async function organizer(page: Page) {
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
async function mergeMode(page: Page) {
  const dialog = await organizer(page);
  await dialog.getByRole('button', { name: 'Merge PDFs', exact: true }).click();
  return dialog.getByRole('region', { name: 'Merge PDFs', exact: true });
}
async function add(page: Page, inputs: ReturnType<typeof file>[]) {
  await page
    .getByLabel('Add local PDFs to merge', { exact: true })
    .setInputFiles(inputs);
  await expect(
    page.getByRole('button', { name: 'Add PDFs', exact: true }),
  ).toBeEnabled({ timeout: 60000 });
}
async function prepare(page: Page) {
  await page
    .getByRole('button', { name: 'Preview combined PDF', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download combined PDF', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByRole('heading', { name: 'Verified combined PDF', exact: true }),
  ).toBeFocused();
}
async function download(page: Page, info: TestInfo, name: string) {
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download combined PDF', exact: true })
    .click();
  const result = await event;
  expect(result.suggestedFilename()).toMatch(/-combined\.pdf$/);
  const path = info.outputPath(name);
  await result.saveAs(path);
  return path;
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png');
  await page.screenshot({ path });
  await mkdir('docs/assets/pdf-tools-2-phase-4c', { recursive: true });
  await copyFile(
    path,
    `docs/assets/pdf-tools-2-phase-4c/${name}-${info.project.name}.png`,
  );
}
async function verify(
  page: Page,
  info: TestInfo,
  output: string,
  sources: { bytes: Buffer; originals: number[]; outputs: number[] }[],
) {
  const count = sources.reduce((sum, source) => sum + source.outputs.length, 0);
  expect(
    (await pdfToolsLib.PDFDocument.load(await readFile(output))).getPageCount(),
  ).toBe(count);
  for (const [index, source] of sources.entries()) {
    const path = info.outputPath(`source-${index + 1}.pdf`);
    await writeFile(path, source.bytes);
    await verifyPageCopyWithPoppler(
      page,
      info,
      path,
      output,
      source.originals,
      `source-${index + 1}`,
      source.outputs,
    );
  }
}

test('three PDFs with duplicate filenames: file/page ordering, remove/undo, mixed geometry and exact Poppler correspondence', async ({
  page,
}, info) => {
  await open(page);
  const a = await mergeFixture('ALPHA', 5),
    b = await mergeFixture('BETA', 2),
    c = await mergeFixture('GAMMA', 1);
  const merge = await mergeMode(page);
  await add(page, [
    file('same-name.pdf', a),
    file('same-name.pdf', b),
    file('third.pdf', c),
  ]);
  await expect(
    merge.getByRole('heading', { name: 'Files · 3', exact: true }),
  ).toBeVisible();
  await expect(
    merge.getByRole('heading', {
      name: 'Final page order · 8 pages',
      exact: true,
    }),
  ).toBeVisible();
  await merge
    .getByRole('button', { name: 'Move file 3 up', exact: true })
    .click();
  await merge
    .getByRole('button', { name: 'Move file 3 up', exact: true })
    .click();
  await merge
    .getByRole('button', {
      name: 'Select combined page 4, file 1, original page 3',
      exact: true,
    })
    .click();
  await merge
    .getByRole('button', { name: 'Move selected page up', exact: true })
    .click();
  await merge
    .getByRole('button', { name: 'Move selected page up', exact: true })
    .click();
  await expect(
    merge.getByRole('button', {
      name: 'Select combined page 2, file 1, original page 3',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await merge
    .getByRole('button', { name: 'Remove selected page', exact: true })
    .click();
  await expect(
    merge.getByRole('heading', {
      name: 'Final page order · 7 pages',
      exact: true,
    }),
  ).toBeVisible();
  await merge
    .getByRole('button', { name: 'Undo merge change', exact: true })
    .click();
  await merge
    .getByRole('button', { name: 'Remove file 2', exact: true })
    .click();
  await expect(
    merge.getByRole('heading', {
      name: 'Final page order · 6 pages',
      exact: true,
    }),
  ).toBeVisible();
  await merge
    .getByRole('button', { name: 'Undo merge change', exact: true })
    .click();
  await screenshot(page, info, 'arranged');
  let downloads = 0;
  page.on('download', () => downloads++);
  await prepare(page);
  expect(downloads).toBe(0);
  await merge
    .getByLabel('Preview combined page', { exact: true })
    .selectOption('1');
  await expect(
    merge.getByRole('img', { name: 'PDF page 2', exact: true }),
  ).toHaveAttribute('data-rendered', 'true');
  await screenshot(page, info, 'combined-preview');
  const path = await download(page, info, 'three-combined.pdf');
  await verify(page, info, path, [
    { bytes: a, originals: [3, 1, 2, 4, 5], outputs: [2, 3, 4, 5, 6] },
    { bytes: b, originals: [1, 2], outputs: [7, 8] },
    { bytes: c, originals: [1], outputs: [1] },
  ]);
  await expect(merge.getByRole('status')).toContainText(
    'device saving cannot be confirmed',
  );
  await page
    .getByRole('button', { name: 'Close organize pages', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { mergeWorkers: number }).mergeWorkers,
      ),
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { mergeWorkers: number }).mergeWorkers,
      ),
    )
    .toBe(0);
});

test('two-PDF keyboard and touch workflow preserves the main history and original bytes', async ({
  page,
}, info) => {
  const a = await mergeFixture('FIRST', 1),
    b = await mergeFixture('SECOND', 1);
  await open(page, a);
  const merge = await mergeMode(page);
  const choose = page.waitForEvent('filechooser');
  await merge.getByRole('button', { name: 'Add PDFs', exact: true }).focus();
  await page.keyboard.press('Enter');
  await (await choose).setFiles([file('first.pdf', a), file('second.pdf', b)]);
  await expect(
    merge.getByRole('heading', { name: 'Files · 2', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    merge.getByRole('button', { name: 'Add PDFs', exact: true }),
  ).toBeEnabled();
  for (const name of ['Move file 1 down', 'Move file 1 up']) {
    const button = merge.getByRole('button', { name, exact: true });
    if (info.project.name === 'mobile') await button.tap();
    else {
      await button.focus();
      await page.keyboard.press('Enter');
    }
  }
  const select = merge.getByRole('button', {
    name: 'Select combined page 1, file 1, original page 1',
    exact: true,
  });
  if (info.project.name === 'mobile') await select.tap();
  else {
    await select.focus();
    await page.keyboard.press('Enter');
  }
  const move = merge.getByRole('button', {
    name: 'Move selected page down',
    exact: true,
  });
  if (info.project.name === 'mobile') await move.tap();
  else {
    await move.focus();
    await page.keyboard.press('Enter');
  }
  await expect(
    merge.getByRole('button', {
      name: 'Select combined page 2, file 1, original page 1',
      exact: true,
    }),
  ).toBeFocused();
  await merge
    .getByRole('button', { name: 'Remove selected page', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await merge
    .getByRole('button', { name: 'Undo merge change', exact: true })
    .focus();
  await page.keyboard.press('Control+z');
  await expect(
    merge.getByRole('heading', {
      name: 'Final page order · 2 pages',
      exact: true,
    }),
  ).toBeVisible();
  await merge
    .getByRole('button', { name: 'Preview combined PDF', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    merge.getByRole('button', { name: 'Download combined PDF', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const path = await download(page, info, 'two-combined.pdf');
  await verify(page, info, path, [
    { bytes: a, originals: [1], outputs: [2] },
    { bytes: b, originals: [1], outputs: [1] },
  ]);
  await page.keyboard.press('Escape');
  const dialog = await organizer(page);
  await expect(
    dialog.getByRole('button', {
      name: 'Undo page or content change',
      exact: true,
    }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
});

test('rejected later sources name each file and retain accepted inputs, including duplicate detection and signed/form rejection', async ({
  page,
}, info) => {
  await open(page);
  const merge = await mergeMode(page);
  const first = await mergeFixture('SAFE', 1),
    third = await mergeFixture('THIRD', 1);
  await add(page, [
    file('safe.pdf', first),
    file('bad-second.pdf', Buffer.from('%PDF-1.7\ninvalid\n%%EOF')),
    file('third.pdf', third),
  ]);
  await expect(merge.getByRole('alert')).toContainText('bad-second.pdf:');
  await expect(
    merge.getByRole('heading', { name: 'Files · 2', exact: true }),
  ).toBeVisible();
  await add(page, [file('renamed-duplicate.pdf', first)]);
  await expect(merge.getByRole('alert')).toContainText('already loaded');
  const certified = await pdfToolsLib.PDFDocument.load(
    await mergeFixture('CERTIFIED', 1),
  );
  certified.catalog.set(
    pdfToolsLib.PDFName.of('Perms'),
    certified.context.obj({}),
  );
  for (const [name, bytes] of [
    ['live-form.pdf', await employmentEditingFixture()],
    ['link.pdf', await annotatedOrganizationFixture('link')],
    ['encrypted.pdf', encryptedPdfFixture()],
    ['signed.pdf', await signedPdfFixture()],
    ['certified-marker.pdf', Buffer.from(await certified.save())],
    ['oversized.pdf', Buffer.alloc(10 * 1024 * 1024 + 1)],
  ] as const) {
    await add(page, [file(name, bytes)]);
    await expect(merge.getByRole('alert')).toContainText(name + ':');
    await expect(
      merge.getByRole('heading', { name: 'Files · 2', exact: true }),
    ).toBeVisible();
  }
  await screenshot(page, info, 'rejected-source');
  await prepare(page);
  await expect(merge.getByRole('alert')).toHaveCount(0);
});

test('aggregate file, byte and page limits reject new sources without clearing the plan', async ({
  page,
}, info) => {
  await open(page);
  let merge = await mergeMode(page);
  const files = await Promise.all(
    Array.from({ length: 9 }, async (_, index) =>
      file(`file-${index + 1}.pdf`, await mergeFixture(`FILE ${index + 1}`, 1)),
    ),
  );
  await add(page, files);
  await expect(
    merge.getByRole('heading', { name: 'Files · 8', exact: true }),
  ).toBeVisible();
  await expect(merge.getByRole('alert')).toContainText('file-9.pdf:');
  await expect(merge.getByRole('alert')).toContainText('8 PDFs');
  await page.getByRole('button', { name: 'Organize', exact: true }).click();
  await page.getByRole('button', { name: 'Merge PDFs', exact: true }).click();
  merge = page.getByRole('region', { name: 'Merge PDFs', exact: true });
  const many = await mergeFixture('TWENTY SIX', 26),
    other = await mergeFixture('OTHER TWENTY SIX', 26);
  await add(page, [
    file('twenty-six.pdf', many),
    file('too-many-pages.pdf', other),
  ]);
  await expect(
    merge.getByRole('heading', { name: 'Files · 1', exact: true }),
  ).toBeVisible();
  await expect(merge.getByRole('alert')).toContainText('50 source pages');
  await page.getByRole('button', { name: 'Organize', exact: true }).click();
  await page.getByRole('button', { name: 'Merge PDFs', exact: true }).click();
  const padded = await Promise.all(
    ['LARGE ONE', 'LARGE TWO', 'LARGE THREE'].map(async (label, index) =>
      file(
        `large-${index + 1}.pdf`,
        paddedMergeFixture(await mergeFixture(label, 1), 8 * 1024 * 1024),
      ),
    ),
  );
  await add(page, padded);
  await expect(
    merge.getByRole('heading', { name: 'Files · 2', exact: true }),
  ).toBeVisible();
  await expect(merge.getByRole('alert')).toContainText('large-3.pdf:');
  await expect(merge.getByRole('alert')).toContainText('20 MiB');
  await screenshot(page, info, 'aggregate-limit');
});

test('unsaved edits are explained and preserved; an explicitly completed copy merges with its marks intact', async ({
  page,
}, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .fill('Synthetic current edit');
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .press('Control+Enter');
  let merge = await mergeMode(page);
  await expect(merge.getByRole('note')).toContainText(
    'Download its completed PDF first',
  );
  await expect(
    merge.getByRole('heading', { name: 'Files · 0', exact: true }),
  ).toBeVisible();
  await screenshot(page, info, 'unsaved-session');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  const completed = info.outputPath('explicit-completed-copy.pdf');
  await (await event).saveAs(completed);
  const bytes = await readFile(completed),
    other = await mergeFixture('OTHER', 1);
  merge = await mergeMode(page);
  await add(page, [file('completed.pdf', bytes), file('other.pdf', other)]);
  await prepare(page);
  const path = await download(page, info, 'edited-combined.pdf');
  await verify(page, info, path, [
    { bytes, originals: [1], outputs: [1] },
    { bytes: other, originals: [1], outputs: [2] },
  ]);
  await page.keyboard.press('Escape');
  const dialog = await organizer(page);
  await expect(
    dialog.getByRole('button', {
      name: 'Undo page or content change',
      exact: true,
    }),
  ).toBeEnabled();
});

test('cancel, export failure and download failure retain the merge plan for real retries and discard stale copies', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const state = window as unknown as { heldMerge: boolean };
    state.heldMerge = false;
    const Original = window.Worker;
    let attempts = 0;
    window.Worker = class extends Original {
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if ((message as { action?: string }).action === 'merge') {
          attempts++;
          if (attempts === 1) {
            state.heldMerge = true;
            return;
          }
          if (attempts === 2) {
            queueMicrotask(() => this.dispatchEvent(new Event('error')));
            return;
          }
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
        throw new Error('Synthetic handoff failure');
      }
      return click.call(this);
    };
  });
  await open(page);
  const merge = await mergeMode(page);
  await add(page, [
    file('a.pdf', await mergeFixture('A', 1)),
    file('b.pdf', await mergeFixture('B', 1)),
  ]);
  await merge
    .getByRole('button', { name: 'Preview combined PDF', exact: true })
    .click();
  await page.waitForFunction(
    () => (window as unknown as { heldMerge: boolean }).heldMerge,
  );
  await merge
    .getByRole('button', { name: 'Cancel preparation', exact: true })
    .click();
  await expect(
    merge.getByRole('button', { name: 'Preview combined PDF', exact: true }),
  ).toBeEnabled();
  await merge
    .getByRole('button', { name: 'Preview combined PDF', exact: true })
    .click();
  await expect(merge.getByRole('alert')).toContainText(
    'plan and edits are kept',
  );
  await expect(
    merge.getByRole('heading', { name: 'Files · 2', exact: true }),
  ).toBeVisible();
  await prepare(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await merge
    .getByRole('button', { name: 'Download combined PDF', exact: true })
    .click();
  await expect(merge.getByRole('alert')).toContainText(
    'could not start the download',
  );
  expect(downloads).toBe(0);
  await download(page, info, 'retry-combined.pdf');
  expect(downloads).toBe(1);
  const revokes = await page.evaluate(
    () => (window as unknown as { mergeRevokes: number }).mergeRevokes,
  );
  await merge
    .getByRole('button', { name: 'Move selected page down', exact: true })
    .click();
  await expect(
    merge.getByRole('button', { name: 'Download combined PDF', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { mergeRevokes: number }).mergeRevokes,
    ),
  ).toBeGreaterThan(revokes);
  await prepare(page);
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { mergeWorkers: number }).mergeWorkers,
      ),
    )
    .toBe(1);
});

test('desktop file and page drag use insertion feedback and the same isolated plan', async ({
  page,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'Native desktop drag; touch alternatives covered separately.',
  );
  await open(page);
  const merge = await mergeMode(page);
  await add(page, [
    file('first.pdf', await mergeFixture('FIRST', 1)),
    file('second.pdf', await mergeFixture('SECOND', 1)),
    file('third.pdf', await mergeFixture('THIRD', 1)),
  ]);
  await merge
    .getByRole('button', {
      name: 'Drag file 1; Move up and Move down are available',
      exact: true,
    })
    .dragTo(
      merge.getByRole('button', {
        name: 'Select file 3: third.pdf',
        exact: true,
      }),
      { targetPosition: { x: 30, y: 45 } },
    );
  const order = merge
    .getByRole('region', { name: 'Source PDFs', exact: true })
    .locator('article');
  await expect(order.first()).toContainText('File 2');
  await expect(order.last()).toContainText('File 1');
  await merge
    .getByRole('button', {
      name: 'Drag combined page 3; Move up and Move down are available',
      exact: true,
    })
    .dragTo(
      merge.getByRole('button', {
        name: 'Select combined page 1, file 2, original page 1',
        exact: true,
      }),
      { targetPosition: { x: 5, y: 10 } },
    );
  await expect(
    merge.getByRole('button', {
      name: 'Select combined page 1, file 1, original page 1',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await merge
    .getByRole('button', { name: 'Undo merge change', exact: true })
    .click();
  await expect(
    merge.getByRole('button', {
      name: 'Select combined page 1, file 2, original page 1',
      exact: true,
    }),
  ).toBeVisible();
});

test('320px merge keeps the file, page and preview/download actions reachable', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page);
  const merge = await mergeMode(page);
  await add(page, [
    file('one.pdf', await mergeFixture('ONE', 1)),
    file('two.pdf', await mergeFixture('TWO', 1)),
  ]);
  await expect(
    merge.getByRole('button', { name: 'Preview combined PDF', exact: true }),
  ).toBeInViewport();
  await screenshot(page, info, 'merge-320');
  await prepare(page);
  await expect(
    merge.getByRole('button', { name: 'Download combined PDF', exact: true }),
  ).toBeInViewport();
  const primary = merge.getByRole('button', {
    name: 'Download combined PDF',
    exact: true,
  });
  await primary.hover();
  const contrast = await primary.evaluate((button) => {
    const style = getComputedStyle(button);
    const luminance = (color: string) => {
      const values = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map((value) => Number(value) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    };
    const foreground = luminance(style.color),
      background = luminance(style.backgroundColor);
    return {
      foreground: style.color,
      background: style.backgroundColor,
      ratio:
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
    };
  });
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
  await writeFile(
    info.outputPath('primary-contrast.json'),
    JSON.stringify(contrast, null, 2),
  );
  const dialog = page.getByRole('dialog', {
    name: 'Organize pages',
    exact: true,
  });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await screenshot(page, info, 'verified-320');
});

test('start from the empty workspace, drop two PDFs, preview and download without opening an editing document', async ({
  page,
}, info) => {
  await page.goto('/dev/pdf-tools-v2');
  const launcher = page.getByRole('button', {
    name: 'Merge PDFs',
    exact: true,
  });
  await launcher.click();
  const dialog = page.getByRole('dialog', { name: 'Merge PDFs', exact: true });
  const a = await mergeFixture('DROP ONE', 1),
    b = await mergeFixture('DROP TWO', 1);
  const dataTransfer = await page.evaluateHandle(
    (inputs) => {
      const transfer = new DataTransfer();
      for (const input of inputs) {
        const bytes = Uint8Array.from(atob(input.data), (character) =>
          character.charCodeAt(0),
        );
        transfer.items.add(
          new File([bytes], input.name, { type: 'application/pdf' }),
        );
      }
      return transfer;
    },
    [
      { name: 'one.pdf', data: a.toString('base64') },
      { name: 'two.pdf', data: b.toString('base64') },
    ],
  );
  await dialog
    .getByRole('group', { name: 'Add PDF files', exact: true })
    .dispatchEvent('drop', { dataTransfer });
  await dataTransfer.dispose();
  await expect(
    dialog.getByRole('heading', { name: 'Files · 2', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    dialog.getByRole('button', { name: 'Add PDFs', exact: true }),
  ).toBeEnabled();
  await screenshot(page, info, 'empty-workspace-merge');
  await prepare(page);
  const path = await download(page, info, 'empty-workspace-combined.pdf');
  await verify(page, info, path, [
    { bytes: a, originals: [1], outputs: [1] },
    { bytes: b, originals: [1], outputs: [2] },
  ]);
  await dialog
    .getByRole('button', { name: 'Close merge PDFs', exact: true })
    .click();
  await expect(launcher).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { mergeWorkers: number }).mergeWorkers,
      ),
    )
    .toBe(0);
  await expect(
    page.getByRole('button', { name: 'Download completed PDF', exact: true }),
  ).toBeDisabled();
});
