import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import {
  organizationFixture,
  annotatedOrganizationFixture,
} from '../helpers/pdf-tools-organization-fixtures';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import {
  inspectLocalPdf,
  exportLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';
import type {
  PdfElement,
  PdfInfo,
  PdfPageEdit,
} from '../../apps/web/src/lib/pdf-tools-model';
import { pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { verifyPdfWithPoppler } from '../helpers/pdf-tools-independent';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const run = promisify(execFile);
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
async function open(page: Page, buffer: Buffer) {
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-pages.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await ready(page);
}
async function choose(page: Page, source: number, number = source + 1) {
  await page
    .getByRole('combobox', { name: 'Current page', exact: true })
    .selectOption({ value: String(source) });
  await ready(page, number);
}
async function organize(page: Page) {
  const button = page.getByRole('button', {
    name: 'Organize pages',
    exact: true,
  });
  if (!(await button.isVisible()))
    await page
      .getByRole('button', { name: 'Choose a page', exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Organize pages', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Organize pages', exact: true });
}
async function text(page: Page, value: string, number: number) {
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
async function snapshot(page: Page, source: number, number: number) {
  await choose(page, source, number);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption({ value: '1' });
  await ready(page, number);
  return page
    .getByRole('img', { name: `PDF page ${number}`, exact: true })
    .evaluate((el) => {
      const base = el as HTMLCanvasElement,
        canvas = document.createElement('canvas');
      canvas.width = base.width;
      canvas.height = base.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(base, 0, 0);
      const r = base.getBoundingClientRect();
      const marks = [
        ...base
          .closest('[data-page-index]')!
          .querySelectorAll<HTMLElement>('[data-mark]'),
      ];
      for (const mark of marks) {
        const b = mark.getBoundingClientRect();
        context.drawImage(
          mark.querySelector('canvas')!,
          ((b.left - r.left) * base.width) / r.width,
          ((b.top - r.top) * base.height) / r.height,
          (b.width * base.width) / r.width,
          (b.height * base.height) / r.height,
        );
      }
      return {
        base: base.toDataURL(),
        composite: canvas.toDataURL(),
        marks: marks.map((m) => JSON.parse(m.dataset.mark!) as PdfElement),
        artwork: marks.map((m) => m.querySelector('canvas')!.toDataURL()),
      };
    });
}
async function download(page: Page, path: string) {
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await (await downloaded).saveAs(path);
  return readFile(path);
}
async function verifyOrder(
  page: Page,
  testInfo: TestInfo,
  original: Buffer,
  baseline: Uint8Array,
  plan: PdfPageEdit[],
) {
  const bin = process.env.PDF_TOOLS_POPPLER_BIN;
  if (!bin) {
    testInfo.annotations.push({
      type: 'independent-renderer-not-run',
      description: 'Existing Poppler binary required.',
    });
    return;
  }
  const source = testInfo.outputPath('original.pdf'),
    output = testInfo.outputPath('arranged-baseline.pdf');
  await writeFile(source, original);
  await writeFile(output, baseline);
  for (const [label, file] of [
    ['source', source],
    ['arranged', output],
  ]) {
    const result = await run(
      join(bin, 'pdftoppm'),
      ['-r', '144', '-cropbox', '-png', file, testInfo.outputPath(label)],
      { timeout: 30000 },
    );
    expect(result.stderr).toBe('');
  }
  const measurements = [];
  for (let index = 0; index < plan.length; index++) {
    const extracted = [];
    for (const [path, number] of [
      [source, plan[index].source + 1],
      [output, index + 1],
    ] as const) {
      const text = await run(join(bin, 'pdftotext'), [
        '-f',
        String(number),
        '-l',
        String(number),
        '-raw',
        '-cropbox',
        path,
        '-',
      ]);
      expect(text.stderr).toBe('');
      extracted.push(text.stdout.trim().split(/\s+/u).sort());
    }
    expect(extracted[1]).toEqual(extracted[0]);
    const input = {
      before: (
        await readFile(
          testInfo.outputPath(`source-${plan[index].source + 1}.png`),
        )
      ).toString('base64'),
      after: (
        await readFile(testInfo.outputPath(`arranged-${index + 1}.png`))
      ).toString('base64'),
      rotation: plan[index].rotation,
    };
    const metrics = await page.evaluate(async ({ before, after, rotation }) => {
      const load = async (data: string) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + data;
        await image.decode();
        return image;
      };
      const a = await load(before),
        b = await load(after);
      const canvas = document.createElement('canvas');
      canvas.width = rotation % 180 ? a.height : a.width;
      canvas.height = rotation % 180 ? a.width : a.height;
      const ctx = canvas.getContext('2d')!;
      if (rotation === 90) ctx.translate(canvas.width, 0);
      else if (rotation === 180) ctx.translate(canvas.width, canvas.height);
      else if (rotation === 270) ctx.translate(0, canvas.height);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(a, 0, 0);
      const expected = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.resetTransform();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(b, 0, 0);
      const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let changed = 0,
        total = 0;
      let wanted = 0,
        found = 0,
        lost = 0,
        extra = 0;
      const ink = (pixels: Uint8ClampedArray, i: number) =>
        Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 223;
      for (let i = 0; i < expected.length; i += 4) {
        const diff = Math.max(
          Math.abs(actual[i] - expected[i]),
          Math.abs(actual[i + 1] - expected[i + 1]),
          Math.abs(actual[i + 2] - expected[i + 2]),
        );
        if (diff > 32) changed++;
        total += diff;
        const want = ink(expected, i),
          got = ink(actual, i);
        if (want) wanted++;
        if (got) found++;
        if (!want && !got) continue;
        const x = (i / 4) % canvas.width,
          y = Math.floor(i / 4 / canvas.width);
        let covered = false,
          explained = false;
        // One PDF point at this independent renderer's 144 dpi.
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const px = x + dx,
              py = y + dy;
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height)
              continue;
            const j = (py * canvas.width + px) * 4;
            covered ||= ink(actual, j);
            explained ||= ink(expected, j);
          }
        if (want && !covered) lost++;
        if (got && !explained) extra++;
      }
      return {
        width: b.width,
        height: b.height,
        expectedWidth: canvas.width,
        expectedHeight: canvas.height,
        changedRatio: changed / (expected.length / 4),
        meanError: total / (expected.length / 4),
        wanted,
        found,
        lost,
        extra,
      };
    }, input);
    measurements.push(metrics);
    await writeFile(
      testInfo.outputPath('organization-pixels.json'),
      JSON.stringify(measurements, null, 2),
    );
    expect(metrics.width).toBe(metrics.expectedWidth);
    expect(metrics.height).toBe(metrics.expectedHeight);
    expect(metrics.wanted).toBeGreaterThan(100);
    expect(metrics.lost).toBe(0);
    expect(metrics.extra).toBe(0);
    if (!plan[index].rotation) expect(metrics.changedRatio).toBe(0);
  }
  await writeFile(
    testInfo.outputPath('organization-pixels.json'),
    JSON.stringify(measurements, null, 2),
  );
}

test('reorders, rotates, removes, restores mixed edits and independently verifies the actual download', async ({
  page,
}, testInfo) => {
  const original = await organizationFixture();
  await open(page, original);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
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
  await choose(page, 2);
  await text(page, 'Retained synthetic text', 3);
  await page.getByRole('button', { name: 'Initials', exact: true }).click();
  await page.getByLabel('Initials', { exact: true }).fill('AS');
  await page.getByRole('button', { name: 'Use initials', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 3', exact: true })
    .click();
  await choose(page, 3);
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 4', exact: true })
    .click();
  const dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Rotate left', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Remove page', exact: true })
    .click();
  await page.getByRole('button', { name: 'Keep page', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: /^Select page / }),
  ).toHaveCount(5);
  await dialog
    .getByRole('button', { name: 'Remove page', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remove this page', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: /^Select page / }),
  ).toHaveCount(4);
  await dialog
    .getByRole('button', { name: 'Undo page or content change', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: /^Select page / }),
  ).toHaveCount(5);
  await dialog
    .getByRole('button', { name: 'Redo page or content change', exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: 'Select page 3, original page 3',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('button', { name: 'Move earlier', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Move earlier', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Move earlier', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('button', { name: 'Rotate right', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Move later', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Move to position' })
    .selectOption({ value: '0' });
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
      name: 'Select page 3, original page 2',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('button', { name: 'Rotate left', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Rotate left', exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: 'Select page 4, original page 5',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('button', { name: 'Rotate right', exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: 'Select page 1, original page 3, rotated',
      exact: true,
    })
    .click();
  const assets = 'docs/assets/pdf-tools-2-phase-4a';
  await mkdir(assets, { recursive: true });
  await page.screenshot({
    path: `${assets}/organize-${testInfo.project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await ready(page, 1);
  // New additions after a rotation must be upright in the current viewport.
  await text(page, 'Added after rotation', 1);
  const snapshots = [];
  const plan = [
    { source: 2, rotation: 90 },
    { source: 0, rotation: 270 },
    { source: 1, rotation: 180 },
    { source: 4, rotation: 90 },
  ];
  for (let index = 0; index < plan.length; index++)
    snapshots.push(await snapshot(page, plan[index].source, index + 1));
  expect(snapshots[0].marks).toHaveLength(3);
  expect(
    snapshots[0].marks.filter((mark) => mark.contentRotation === 90),
  ).toHaveLength(2);
  expect(
    snapshots[0].marks.find((mark) => mark.text === 'Added after rotation')
      ?.contentRotation ?? 0,
  ).toBe(0);
  const completed = await download(
    page,
    testInfo.outputPath('synthetic-completed.pdf'),
  );
  const output = await pdfToolsLib.PDFDocument.load(completed);
  expect(output.getPageCount()).toBe(4);
  const originalInfo = await inspectLocalPdf(original);
  const baseline = await exportLocalPdf(
    original,
    originalInfo,
    { fields: {}, elements: [], pages: plan },
    [],
    { preserveFields: true },
  );
  await verifyOrder(page, testInfo, original, baseline, plan);
  const orderedInfo: PdfInfo = await inspectLocalPdf(baseline);
  await verifyPdfWithPoppler(
    page,
    testInfo,
    Buffer.from(baseline),
    orderedInfo,
    snapshots,
  );
  const bin = process.env.PDF_TOOLS_POPPLER_BIN;
  if (bin)
    await copyFile(
      testInfo.outputPath('poppler-completed-1.png'),
      `${assets}/poppler-organized-${testInfo.project.name}.png`,
    );
  await choose(page, 2, 1);
  await page
    .getByRole('combobox', { name: 'PDF zoom' })
    .selectOption('fit-page');
  await ready(page, 1);
  await page.screenshot({
    path: `${assets}/workspace-${testInfo.project.name}.png`,
  });
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'completed.pdf',
    mimeType: 'application/pdf',
    buffer: completed,
  });
  await ready(page);
  await expect(
    page.getByRole('combobox', { name: 'Current page' }).locator('option'),
  ).toHaveCount(4);
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
});

test('keyboard and touch movement, final-page protection, view-only history and unsaved work', async ({
  page,
}, testInfo) => {
  await open(page, await organizationFixture(2));
  await choose(page, 1);
  await page.getByRole('combobox', { name: 'PDF zoom' }).selectOption('0.5');
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
  let dialog = await organize(page);
  const earlier = dialog.getByRole('button', {
    name: 'Move earlier',
    exact: true,
  });
  if (testInfo.project.name === 'mobile') await earlier.tap();
  else {
    await earlier.focus();
    await earlier.press('Enter');
  }
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 1, original page 2',
      exact: true,
    }),
  ).toBeFocused();
  await dialog
    .getByRole('button', { name: 'Rotate right', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Remove page', exact: true })
    .click();
  await page.getByRole('button', { name: 'Remove this page' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Remove page', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Move earlier', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Move later', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  dialog = await organize(page);
  await dialog
    .getByRole('button', { name: 'Undo page or content change' })
    .click();
  await expect(
    dialog.getByRole('button', { name: /^Select page / }),
  ).toHaveCount(2);
  // A cancelled drag and a move to the current position leave redo intact.
  await dialog
    .getByRole('combobox', { name: 'Move to position' })
    .selectOption({ value: '1' });
  await expect(
    dialog.getByRole('button', { name: 'Redo page or content change' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await page
    .getByRole('button', { name: 'Discard changes and continue', exact: true })
    .click();
  await open(page, await organizationFixture(1));
  dialog = await organize(page);
  await expect(
    dialog.getByRole('button', { name: 'Remove page', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('button', { name: 'Rotate left', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Undo page or content change' })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Undo page or content change' }),
  ).toBeDisabled();
});

test('desktop drag creates one reorder transaction', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Native desktop drag; touch uses the movement controls.',
  );
  await open(page, await organizationFixture(5));
  const dialog = await organize(page);
  const first = dialog.getByRole('button', { name: /^Drag page 1;/ });
  const target = dialog.getByRole('button', {
    name: 'Select page 3, original page 3',
    exact: true,
  });
  await first.dragTo(target);
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 3, original page 1',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog
    .getByRole('button', { name: 'Undo page or content change' })
    .click();
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 1, original page 1',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    dialog.getByRole('button', { name: 'Undo page or content change' }),
  ).toBeDisabled();
});

test('keyboard-only organization uses one history step per shortcut and restores focus', async ({
  page,
}, testInfo) => {
  await open(page, await organizationFixture(2));
  const enter = async (button: ReturnType<Page['getByRole']>) => {
    await button.focus();
    await button.press('Enter');
  };
  let opener = page.getByRole('button', {
    name: 'Organize pages',
    exact: true,
  });
  if (testInfo.project.name === 'mobile') {
    const chooser = page.getByRole('button', {
      name: 'Choose a page',
      exact: true,
    });
    await enter(chooser);
    await enter(
      page.getByRole('button', { name: 'Organize pages', exact: true }),
    );
    opener = chooser;
  } else await enter(opener);
  const dialog = page.getByRole('dialog', {
    name: 'Organize pages',
    exact: true,
  });
  await enter(dialog.getByRole('button', { name: 'Move later', exact: true }));
  await enter(
    dialog.getByRole('button', { name: 'Rotate right', exact: true }),
  );
  await enter(dialog.getByRole('button', { name: 'Remove page', exact: true }));
  await enter(
    page.getByRole('button', { name: 'Remove this page', exact: true }),
  );
  // Radix restores focus after unmounting the confirmation. Verify the actual
  // keyboard target before sending a shortcut into the restored organizer.
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 1, original page 2',
      exact: true,
    }),
  ).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('removal-focus.png') });
  await page.keyboard.press('Control+z');
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 2, original page 1, rotated',
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 2, original page 1',
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(
    dialog.getByRole('button', { name: 'Undo page or content change' }),
  ).toBeDisabled();
  await page.keyboard.press('Control+Shift+z');
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 2, original page 1',
      exact: true,
    }),
  ).toBeVisible();
  await enter(dialog.getByRole('button', { name: 'Done', exact: true }));
  await expect(opener).toBeFocused();
});

test('preserves live repeated form fields through page moves and rotation, with safe removal rejection', async ({
  page,
}, testInfo) => {
  const original = await employmentEditingFixture();
  await open(page, original);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 1);
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: /^Full name/ })
    .click();
  await page
    .getByRole('textbox', { name: 'Full name *', exact: true })
    .fill('Alex Synthetic');
  await page
    .getByRole('textbox', { name: 'Full name *', exact: true })
    .press('Enter');
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: 'Onboarding contact', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Onboarding contact', exact: true })
    .fill('Repeated contact');
  await page
    .getByRole('textbox', { name: 'Onboarding contact', exact: true })
    .press('Enter');
  let dialog = await organize(page);
  await expect(
    dialog.getByRole('button', { name: 'Remove page', exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByText(/Pages cannot be removed/)).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Move earlier', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Rotate right' }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await ready(page);
  await expect(page.getByText('Updating form preview…')).toHaveCount(0);
  const completed = await download(
    page,
    testInfo.outputPath('forms-arranged.pdf'),
  );
  const output = await pdfToolsLib.PDFDocument.load(completed);
  expect(output.getForm().getTextField('Full name').getText()).toBe(
    'Alex Synthetic',
  );
  expect(
    output.getForm().getTextField('Onboarding contact').acroField.getWidgets(),
  ).toHaveLength(2);
  expect(output.getPage(0).getRotation().angle).toBe(90);
  expect(output.getForm().getTextField('Onboarding contact').getText()).toBe(
    'Repeated contact',
  );
  const originalInfo = await inspectLocalPdf(original);
  const formBaseline = await exportLocalPdf(
    original,
    originalInfo,
    {
      fields: {
        'Full name': 'Alex Synthetic',
        'Onboarding contact': 'Repeated contact',
      },
      elements: [],
    },
    [],
    { preserveFields: true, editFields: true, requireFields: true },
  );
  await verifyOrder(page, testInfo, Buffer.from(formBaseline), completed, [
    { source: 1, rotation: 90 },
    { source: 0, rotation: 0 },
    { source: 2, rotation: 0 },
    { source: 3, rotation: 0 },
    { source: 4, rotation: 0 },
  ]);
  await page.getByLabel('Choose a local PDF').setInputFiles({
    name: 'form-copy.pdf',
    mimeType: 'application/pdf',
    buffer: completed,
  });
  await ready(page);
  dialog = await organize(page);
  await expect(
    dialog.getByRole('button', { name: 'Rotate right' }),
  ).toBeEnabled();
});

test('explains unsafe structures, retains source content and allows independent editing', async ({
  page,
}, testInfo) => {
  for (const kind of ['link', 'unknown', 'tagged', 'printRange'] as const) {
    await open(page, await annotatedOrganizationFixture(kind));
    const dialog = await organize(page);
    await expect(
      dialog.getByText(/Page organization is unavailable/),
    ).toBeVisible();
    for (const name of [
      'Move earlier',
      'Move later',
      'Rotate left',
      'Rotate right',
      'Remove page',
    ])
      await expect(
        dialog.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    if (kind === 'printRange')
      await page.screenshot({
        path: testInfo.outputPath('print-range-blocked.png'),
      });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
  }
});

test('failed organized export retains arrangement and history for a real retry', async ({
  page,
}, testInfo) => {
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
  await open(page, await organizationFixture(2));
  let dialog = await organize(page);
  await dialog.getByRole('button', { name: 'Move later', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Rotate right', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await ready(page, 2);
  let downloads = 0;
  page.on('download', () => downloads++);
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: /could not be verified/ }),
  ).toBeVisible();
  expect(downloads).toBe(0);
  dialog = await organize(page);
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 2, original page 1, rotated',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    dialog.getByRole('button', { name: 'Undo page or content change' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  const bytes = await download(
    page,
    testInfo.outputPath('retry-completed.pdf'),
  );
  const output = await pdfToolsLib.PDFDocument.load(bytes);
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(1).getRotation().angle).toBe(90);
  expect(downloads).toBe(1);
});

test('organizer controls and thumbnails remain reachable at 320 pixels', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page, await organizationFixture(5));
  const dialog = await organize(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Move later', exact: true }),
  ).toBeInViewport();
  await dialog
    .getByRole('button', {
      name: 'Select page 5, original page 5',
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole('button', {
      name: 'Select page 5, original page 5',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog
    .getByRole('button', { name: 'Rotate left', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Undo page or content change', exact: true })
    .click();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('organizer-320.png') });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
});
