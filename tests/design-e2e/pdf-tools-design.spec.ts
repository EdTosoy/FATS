import { test, expect, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({
    path: info.outputPath(`${info.project.name}-${name}.png`),
    animations: 'disabled',
    scale: 'css',
  });
}
async function start(page: Page, form = false) {
  await page.goto('/design/pdf-tools');
  await page
    .getByRole('button', {
      name: form ? 'Open sample form' : 'Open sample offer',
      exact: true,
    })
    .click();
  await expect(page.getByTestId('design-paper')).toBeVisible();
  await expect(page.locator('.topbar')).toBeHidden();
}
async function runtime(page: Page) {
  const errors: string[] = [];
  const writes: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()))
      writes.push(new URL(request.url()).pathname);
    if (new URL(request.url()).hostname !== '127.0.0.1')
      external.push(new URL(request.url()).hostname);
  });
  return { errors, writes, external };
}
async function noOverflow(page: Page) {
  expect(
    await page
      .getByRole('region', { name: 'PDF Tools 2 design prototype' })
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
}

test('Quick Sign: creation, placement, drag, resize, keyboard history and simulated download', async ({
  page,
  context,
}, info) => {
  const events = await runtime(page);
  await start(page);
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('light');
  await capture(page, info, 'light');
  const signatureTool = page.getByRole('button', {
    name: 'Signature',
    exact: true,
  });
  await signatureTool.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alex Rivera');
  await capture(page, info, 'signature-creation');
  // Modal focus is contained in both directions.
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(signatureTool).toBeFocused();
  await signatureTool.click();
  await expect(
    page.getByLabel('Name for signature', { exact: true }),
  ).toHaveValue('');
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alex Rivera');
  await dialog
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  const placement = page.getByRole('button', {
    name: 'Place on signature line',
    exact: true,
  });
  await expect(placement).toBeFocused();
  await placement.click();
  const mark = page.getByRole('button', {
    name: 'Signature: Alex Rivera',
    exact: true,
  });
  await expect(mark).toBeFocused();
  await capture(page, info, 'signature-selected');
  const left = page.getByLabel('Mark x', { exact: true });
  const before = Number(await left.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(left).toHaveValue(String(before + 1));
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await mark.click();
  await expect(left).toHaveValue(String(before + 1));
  await page.getByLabel('Document zoom', { exact: true }).selectOption('1');
  await mark.scrollIntoViewIfNeeded();
  const box = (await mark.boundingBox())!;
  if (info.project.use.hasTouch) {
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: box.x + box.width / 2 + 20, y: box.y + box.height / 2 + 10 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 20,
      box.y + box.height / 2 + 10,
      { steps: 5 },
    );
    await page.mouse.up();
  }
  await expect(left).toHaveValue(String(before + 21));
  const width = page.getByLabel('Mark width', { exact: true });
  const oldWidth = Number(await width.inputValue());
  const resize = page.getByRole('button', {
    name: 'Resize selected mark',
    exact: true,
  });
  await resize.scrollIntoViewIfNeeded();
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 30,
    handle.y + handle.height / 2 + 10,
    { steps: 4 },
  );
  await capture(page, info, 'signature-resizing');
  await page.mouse.up();
  await expect(width).toHaveValue(String(oldWidth + 30));
  await resize.focus();
  await page.keyboard.press('ArrowRight');
  await expect(width).toHaveValue(String(oldWidth + 35));
  await mark.focus();
  await page.keyboard.press('Delete');
  await expect(mark).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(mark).toBeVisible();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await dialog.getByLabel('Design review: simulate export failure').check();
  await dialog.getByRole('button', { name: 'Simulate download' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Your copy could not be prepared' }),
  ).toBeVisible();
  await dialog.getByLabel('Keep simulating failure').uncheck();
  await dialog.getByRole('button', { name: 'Retry simulation' }).click();
  await expect(
    dialog.getByText('Prototype simulation complete.', { exact: false }),
  ).toBeVisible();
  await capture(page, info, 'export-feedback');
  await dialog
    .getByRole('button', { name: 'Back to document', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await page.getByLabel('Document zoom', { exact: true }).selectOption('page');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, info, 'dark');
  await noOverflow(page);
  expect(events).toEqual({ errors: [], writes: [], external: [] });
});

test('Edit PDF: supported fields, contextual text properties, pages, removal and undo', async ({
  page,
}, info) => {
  const events = await runtime(page);
  await start(page, true);
  const name = page.getByLabel('Full name', { exact: true });
  await name.fill('Alex Rivera (Synthetic)');
  await page.getByLabel('Preferred name', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page', exact: true })
    .click();
  const text = page.getByLabel('Selected mark text', { exact: true });
  await text.fill('Excited for my first day.');
  await text.press('Enter');
  await page.getByLabel('Text size', { exact: true }).selectOption('18');
  await page.getByRole('button', { name: 'Bold text', exact: true }).click();
  await page.getByRole('radio', { name: 'Black', exact: true }).check();
  await capture(page, info, 'text-editing');
  await expect(
    page.getByRole('button', {
      name: 'Text: Excited for my first day.',
      exact: true,
    }),
  ).toHaveCSS('font-weight', '700');
  await page
    .getByRole('button', { name: 'Deselect mark', exact: true })
    .click();
  await page.getByRole('button', { name: 'Initials', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Name for signature', { exact: true })
    .fill('AR');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Use initials', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place on page', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Initials: AR', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Deselect mark', exact: true })
    .click();
  await page
    .getByLabel('Current page', { exact: true })
    .selectOption('checklist');
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Deselect mark', exact: true })
    .click();
  await page
    .getByLabel('Current page', { exact: true })
    .selectOption('details');
  await expect(name).toHaveValue('Alex Rivera (Synthetic)');
  await capture(page, info, 'multi-page');
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Show page thumbnails' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Move page earlier' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close dialog' })
      .click();
  } else {
    await page
      .getByRole('button', { name: 'Organize pages', exact: true })
      .click();
    await page.getByRole('button', { name: 'Move page earlier' }).click();
  }
  await expect(
    page.getByLabel('Current page', { exact: true }).locator('option').first(),
  ).toHaveText('1');
  expect(
    await page
      .getByLabel('Current page', { exact: true })
      .locator('option')
      .first()
      .getAttribute('value'),
  ).toBe('details');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(
    await page
      .getByLabel('Current page', { exact: true })
      .locator('option')
      .first()
      .getAttribute('value'),
  ).toBe('offer');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Show page thumbnails' }).click();
  await page.getByRole('button', { name: 'Remove page', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove page', exact: true })
    .click();
  await expect(
    page.getByLabel('Current page', { exact: true }).locator('option'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByLabel('Current page', { exact: true }).locator('option'),
  ).toHaveCount(3);
  await page
    .getByLabel('Current page', { exact: true })
    .selectOption('details');
  await expect(name).toHaveValue('Alex Rivera (Synthetic)');
  await page
    .getByRole('link', { name: 'Leave prototype for existing PDF Tools' })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('heading', { name: 'Keep working on your changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(name).toHaveValue('Alex Rivera (Synthetic)');
  await noOverflow(page);
  expect(events).toEqual({ errors: [], writes: [], external: [] });
});

test('review states preserve the sample; System theme and pointer drawing work without file access', async ({
  page,
}, info) => {
  const events = await runtime(page);
  await start(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const state of [
    'loading',
    'unsupported',
    'password',
    'error',
    'empty',
  ]) {
    await page.getByLabel('Review state', { exact: true }).selectOption(state);
    await capture(page, info, state);
    await noOverflow(page);
  }
  await page.getByLabel('Review state', { exact: true }).selectOption('ready');
  await expect(page.getByTestId('design-paper')).toBeVisible();
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  const drawing = page.getByRole('img', { name: 'Signature drawing area' });
  const box = (await drawing.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 95, box.y + 40, { steps: 5 });
  await page.mouse.move(box.x + 140, box.y + 90, { steps: 5 });
  await page.mouse.move(box.x + 210, box.y + 65, { steps: 5 });
  await page.mouse.up();
  await capture(page, info, 'draw-signature');
  await expect(
    page.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place on signature line', exact: true })
    .click();
  await expect(
    page
      .getByRole('button', { name: 'Signature: Drawn signature', exact: true })
      .locator('svg path'),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Deselect mark', exact: true })
    .click();
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Date: 20 Oct 2026', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Review state', { exact: true }).selectOption('empty');
  await page
    .getByRole('button', { name: 'Open sample form', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('heading', { name: 'Keep working on your changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.getByLabel('Review state', { exact: true }).selectOption('ready');
  await expect(
    page.getByRole('button', {
      name: 'Signature: Drawn signature',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key !== 'fats.appearance.v1'),
    ),
  ).toEqual([]);
  expect(events).toEqual({ errors: [], writes: [], external: [] });
});
