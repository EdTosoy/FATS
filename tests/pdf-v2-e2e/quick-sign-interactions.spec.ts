import { test, expect, type Page } from '@playwright/test';
import { pdfWorkspaceFixture } from '../helpers/pdf-tools-v2-fixtures';
import type { PdfElement } from '../../apps/web/src/lib/pdf-tools-model';
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

async function data(page: Page): Promise<PdfElement> {
  return JSON.parse(
    (await page.getByTestId('signature-mark').getAttribute('data-mark')) ??
      '{}',
  ) as PdfElement;
}
async function ready(page: Page) {
  await expect(
    page.getByRole('img', { name: 'PDF page 1', exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
}
test('pointer cancellation, fixed touch targets, one-step moves/resizes and discard protection', async ({
  page,
}, info) => {
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-interactions.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(true),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alex Rivera');
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  const canvas = page.getByRole('img', { name: 'PDF page 1', exact: true });
  const box = await canvas.boundingBox();
  if (info.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box!.x + 30, y: box!.y + 30 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(box!.x + 30, box!.y + 30);
    await page.mouse.down();
    await canvas.dispatchEvent('pointercancel', {
      pointerId: 1,
      isPrimary: true,
    });
    await page.mouse.up();
  }
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  await ready(page);
  const original = await data(page);
  for (const zoom of ['0.25', '0.5', '1', '2']) {
    await page
      .getByRole('combobox', { name: 'PDF zoom', exact: true })
      .selectOption(zoom);
    await ready(page);
    for (const target of [
      page.getByRole('button', { name: 'Signature: Alex Rivera', exact: true }),
      page.getByRole('button', {
        name: 'Resize signature proportionally',
        exact: true,
      }),
    ]) {
      const bounds = await target.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(43.9);
      expect(bounds!.height).toBeGreaterThanOrEqual(43.9);
    }
    expect(await data(page)).toEqual(original);
  }
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('0.25');
  await ready(page);
  const target = page.getByRole('button', {
    name: 'Signature: Alex Rivera',
    exact: true,
  });
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  const start = {
    x: bounds!.x + bounds!.width / 2,
    y: bounds!.y + bounds!.height / 2,
  };
  if (info.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x + 12, y: start.y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y, { steps: 6 });
    await page.mouse.up();
  }
  const moved = await data(page);
  expect(moved.x - original.x).toBeCloseTo(48, 1);
  expect(moved.width).toBe(original.width);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await data(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await data(page)).toEqual(moved);
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents' })
    .getByRole('button', { name: 'Alex Rivera', exact: true })
    .click();
  await expect(target).toBeFocused();
  const resize = page.getByRole('button', {
    name: 'Resize signature proportionally',
    exact: true,
  });
  await resize.scrollIntoViewIfNeeded();
  await expect(resize).toBeInViewport({ ratio: 1 });
  const sizeBox = await resize.boundingBox();
  const point = { x: sizeBox!.x + 22, y: sizeBox!.y + 22 };
  if (info.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x + 10, y: point.y + 5 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 10, point.y + 5, { steps: 5 });
    await page.mouse.up();
  }
  const resized = await data(page);
  expect(resized.width).toBeGreaterThan(moved.width);
  expect(resized.width / resized.height).toBeCloseTo(
    original.width / original.height,
    8,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await data(page)).toEqual(moved);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await data(page)).toEqual(resized);
  await page.screenshot({ path: info.outputPath('touch-targets-25.png') });
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  expect(await data(page)).toEqual(resized);
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await page
    .getByRole('button', { name: 'Discard changes and continue', exact: true })
    .click();
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
});

test('mobile signature input follows a simulated keyboard viewport and restores layout', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'VisualViewport keyboard simulation is for the mobile layout.',
  );
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    const proto = Object.getPrototypeOf(viewport);
    const originalHeight = Object.getOwnPropertyDescriptor(
      proto,
      'height',
    )!.get!;
    const originalOffset = Object.getOwnPropertyDescriptor(
      proto,
      'offsetTop',
    )!.get!;
    let height: number | null = null,
      offset: number | null = null;
    Object.defineProperty(viewport, 'height', {
      get: () => height ?? originalHeight.call(viewport),
    });
    Object.defineProperty(viewport, 'offsetTop', {
      get: () => offset ?? originalOffset.call(viewport),
    });
    (
      window as unknown as {
        simulatePdfKeyboard: (value: number | null) => void;
      }
    ).simulatePdfKeyboard = (value) => {
      height = value;
      offset = value === null ? null : 12;
      viewport.dispatchEvent(new Event('resize'));
    };
  });
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-keyboard.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(true),
  });
  await ready(page);
  const create = page.getByRole('button', {
    name: 'Create signature',
    exact: true,
  });
  await create.click();
  const input = page.getByLabel('Name for signature', { exact: true });
  await input.focus();
  await page.evaluate(() =>
    (
      window as unknown as {
        simulatePdfKeyboard: (value: number | null) => void;
      }
    ).simulatePdfKeyboard(380),
  );
  await input.fill('María José');
  const bounds = await input.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(12);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(392);
  const dialog = page.getByRole('dialog', {
    name: 'Create your signature',
    exact: true,
  });
  const area = await dialog.boundingBox();
  expect(area!.height).toBeLessThanOrEqual(348.1);
  await page.screenshot({
    path: info.outputPath('mobile-keyboard-simulation.png'),
  });
  await page.evaluate(() =>
    (
      window as unknown as {
        simulatePdfKeyboard: (value: number | null) => void;
      }
    ).simulatePdfKeyboard(null),
  );
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await create.click();
  await expect(
    page.getByLabel('Name for signature', { exact: true }),
  ).toHaveValue('');
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Clear drawing', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-320.png') });
});

test('rejected replacement files preserve signatures and the unsaved-work guard', async ({
  page,
}) => {
  await page.goto('/dev/pdf-tools-v2');
  const input = page.getByLabel('Choose a local PDF', { exact: true });
  const original = await pdfWorkspaceFixture(true);
  await input.setInputFiles({
    name: 'synthetic-original.pdf',
    mimeType: 'application/pdf',
    buffer: original,
  });
  await ready(page);
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alex Rivera');
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  const saved = await data(page);
  const confirmation = page.getByRole('dialog', {
    name: 'Keep your changes?',
  });
  for (const file of [
    {
      name: 'synthetic-wrong-extension.txt',
      buffer: original,
      error: 'Choose a PDF file',
    },
    {
      name: 'synthetic-empty.pdf',
      buffer: Buffer.alloc(0),
      error: 'Choose a nonempty PDF',
    },
  ]) {
    await input.setInputFiles({
      name: file.name,
      mimeType: 'application/pdf',
      buffer: file.buffer,
    });
    await expect(confirmation).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Discard changes and continue',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: file.error }),
    ).toBeVisible();
    expect(await data(page)).toEqual(saved);
    await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await page
      .getByRole('button', { name: 'Keep editing', exact: true })
      .click();
  }
});

test('undo and redo survive page changes and accepted replacement requires explicit discard', async ({
  page,
}) => {
  await page.goto('/dev/pdf-tools-v2');
  const input = page.getByLabel('Choose a local PDF', { exact: true });
  await input.setInputFiles({
    name: 'synthetic-multiple-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alex Rivera');
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  const saved = await data(page);
  const pages = page.getByRole('combobox', {
    name: 'Current page',
    exact: true,
  });
  await pages.selectOption('2');
  await expect(
    page.getByRole('img', { name: 'PDF page 3', exact: true }),
  ).toHaveAttribute('data-rendered', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await pages.selectOption('0');
  await ready(page);
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await data(page)).toEqual(saved);
  await pages.selectOption('1');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await pages.selectOption('0');
  await ready(page);
  expect(await data(page)).toEqual(saved);
  const replacement = {
    name: 'synthetic-replacement.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWorkspaceFixture(true),
  };
  const confirmation = page.getByRole('dialog', {
    name: 'Keep your changes?',
  });
  await input.setInputFiles(replacement);
  await expect(confirmation).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  expect(await data(page)).toEqual(saved);
  await expect(pages.locator('option')).toHaveCount(4);
  await input.setInputFiles(replacement);
  await expect(confirmation).toBeVisible();
  await page
    .getByRole('button', { name: 'Discard changes and continue', exact: true })
    .click();
  await ready(page);
  await expect(pages.locator('option')).toHaveCount(1);
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Redo', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open PDF', exact: true }),
  ).toBeVisible();
});
