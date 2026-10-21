import {
  test,
  expect,
  type Page,
  type Locator,
  type TestInfo,
} from '@playwright/test';

async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  clipHeight?: number,
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });
  await page.screenshot({
    path: info.outputPath(`${info.project.name}-${name}.png`),
    animations: 'disabled',
    scale: 'css',
    ...(clipHeight
      ? {
          clip: {
            x: 0,
            y: 0,
            width: page.viewportSize()!.width,
            height: clipHeight,
          },
        }
      : {}),
  });
}
function runtime(page: Page) {
  const events = { errors: 0, external: 0, writes: 0 };
  page.on('pageerror', () => events.errors++);
  page.on('console', (m) => {
    if (m.type() === 'error') events.errors++;
  });
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') events.external++;
    if (!['GET', 'HEAD'].includes(r.method())) events.writes++;
  });
  return events;
}
async function start(page: Page, form = false) {
  await page.goto('/design/pdf-tools');
  await page
    .getByRole('button', {
      name: form ? 'Open sample form' : 'Open sample offer',
      exact: true,
    })
    .click();
}
async function properties(page: Page) {
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible()) await edit.click();
}
async function advanced(page: Page) {
  await properties(page);
  if (!(await page.getByLabel('Mark width', { exact: true }).isVisible()))
    await page.getByText('Advanced', { exact: true }).click();
}
async function tabTo(page: Page, target: Locator) {
  await target.waitFor({ state: 'visible' });
  for (let i = 0; i < 140; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(
    'Keyboard target was not reachable in the editor focus order.',
  );
}
async function signature(page: Page, name = 'Alex Rivera') {
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page.getByLabel('Name for signature', { exact: true }).fill(name);
  await page
    .getByRole('button', { name: 'Use signature', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place on signature line', exact: true })
    .click();
}

test('keyboard-only signing, named object selection, precision edits, delete, undo and preview', async ({
  page,
}, info) => {
  const events = runtime(page);
  await page.goto('/design/pdf-tools');
  await tabTo(
    page,
    page.getByRole('button', { name: 'Open sample offer', exact: true }),
  );
  await page.keyboard.press('Enter');
  await tabTo(
    page,
    page.getByRole('button', { name: 'Create signature', exact: true }),
  );
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByLabel('Name for signature', { exact: true }));
  await page.keyboard.insertText('Alex Rivera');
  await tabTo(
    page,
    page.getByRole('button', { name: 'Use signature', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Place on signature line', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  const mark = page.getByRole('button', {
    name: 'Signature: Alex Rivera',
    exact: true,
  });
  await expect(mark).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(
    page.getByLabel('Selected mark text', { exact: true }),
  ).toBeFocused();
  await tabTo(page, page.getByText('Advanced', { exact: true }));
  await page.keyboard.press('Enter');
  const width = page.getByLabel('Mark width', { exact: true });
  await tabTo(page, width);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('220');
  await page.keyboard.press('Tab');
  await expect(width).toHaveValue('220');
  await tabTo(
    page,
    page.getByRole('button', { name: 'Delete element', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(mark).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Page contents', exact: true }),
  ).toBeFocused();
  await tabTo(page, page.getByRole('button', { name: 'Undo', exact: true }));
  await page.keyboard.press('Enter');
  await expect(mark).toBeVisible();
  await tabTo(
    page,
    page.getByRole('button', { name: 'Page contents', exact: true }),
  );
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('not printed PDF content');
  await capture(page, info, 'page-contents');
  await tabTo(
    page,
    dialog.getByRole('button', { name: /1\. Signature.*Alex Rivera/ }),
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByLabel('Selected mark text', { exact: true }),
  ).toBeFocused();
  await tabTo(
    page,
    page.getByRole('button', { name: 'Download', exact: true }),
  );
  await page.keyboard.press('Enter');
  await tabTo(
    page,
    dialog.getByRole('button', { name: 'Preview download', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(
    dialog.getByRole('heading', { name: 'Preview complete', exact: true }),
  ).toBeVisible();
  await tabTo(
    page,
    dialog.getByRole('button', { name: 'Keep editing', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Download', exact: true }),
  ).toBeFocused();
  const tree = await page
    .getByRole('region', { name: 'PDF Tools 2 design prototype', exact: true })
    .ariaSnapshot();
  expect(tree).toContain('Document navigation');
  expect(tree).not.toContain('A place to begin.');
  await info.attach('editor-accessibility-tree', {
    body: tree,
    contentType: 'text/plain',
  });
  await tabTo(page, page.getByLabel('Current page', { exact: true }));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Current page', { exact: true })).toHaveValue(
    'details',
  );
  await tabTo(
    page,
    page.getByRole('button', { name: 'Page contents', exact: true }),
  );
  await page.keyboard.press('Enter');
  await tabTo(
    page,
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Full name Empty', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByLabel('Selected field value', { exact: true }),
  ).toBeFocused();
  await page.keyboard.insertText('Alex Rivera (Synthetic)');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
    'Alex Rivera (Synthetic)',
  );

  expect(events).toEqual({ errors: 0, external: 0, writes: 0 });
});

test('typed signatures preserve short, long and accented names in both styles; overflow is explicit', async ({
  page,
}, info) => {
  const events = runtime(page);
  await start(page);
  for (const style of ['Classic', 'Simple']) {
    for (const name of [
      'Li',
      'Alex Rivera',
      'María José de la Cruz',
      'Alexandria Remedios Santiago Villanueva',
    ]) {
      await page
        .getByRole('button', { name: 'Signature', exact: true })
        .click();
      await page.getByLabel('Name for signature', { exact: true }).fill(name);
      await page.getByRole('radio', { name: style, exact: true }).check();
      await expect(
        page.getByRole('button', { name: 'Use signature', exact: true }),
      ).toBeEnabled();
      if (name.startsWith('Alexandria'))
        await capture(page, info, `long-signature-${style.toLowerCase()}`);
      if (name.startsWith('María') && style === 'Simple')
        await capture(page, info, 'accented-signature');
      const preview = page.getByRole('region', {
        name: 'Signature preview, scroll horizontally for the full name',
        exact: true,
      });
      await preview.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await page
        .getByRole('button', { name: 'Use signature', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Place on signature line', exact: true })
        .click();
      const mark = page.getByRole('button', {
        name: `Signature: ${name}`,
        exact: true,
      });
      await expect(mark.locator('..')).toHaveAttribute(
        'data-signature-fits',
        'true',
      );
      expect(
        await mark.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(18);
      const fits = await mark.evaluate((el) => {
        const artwork = el.firstElementChild!;
        const text = artwork.firstElementChild!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return (
          range.getBoundingClientRect().width <=
          artwork.getBoundingClientRect().width
        );
      });
      expect(fits).toBe(true);
      await properties(page);
      await page
        .getByRole('button', { name: 'Delete element', exact: true })
        .click();
    }
  }
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page
    .getByLabel('Name for signature', { exact: true })
    .fill('Alexandria Remedios Santiago Villanueva '.repeat(3).trim());
  await expect(
    page.getByRole('button', { name: 'Use signature', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('status').filter({ hasText: 'cannot fit at 18 pt' }),
  ).toBeVisible();
  await capture(page, info, 'signature-overflow');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await signature(page);
  await advanced(page);
  const width = page.getByLabel('Mark width', { exact: true });
  const original = await width.inputValue();
  await width.fill('40');
  await width.press('Tab');
  await expect(width).toHaveValue(original);
  await expect(
    page.getByRole('status').filter({ hasText: 'unreadable' }),
  ).toHaveCount(1);
  const editedName = page.getByLabel('Selected mark text', { exact: true });
  await editedName.fill(
    'Alexandria Remedios Santiago Villanueva '.repeat(3).trim(),
  );
  await editedName.press('Enter');
  await expect(page.locator('[data-signature-fits="false"]')).toContainText(
    'Needs more space',
  );
  await capture(page, info, 'signature-needs-space');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Preview download', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Back to document', exact: true })
    .click();
  await editedName.fill('Alex Rivera');
  await editedName.press('Enter');
  await expect(page.locator('[data-signature-fits="false"]')).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await capture(page, info, 'readable-signature-dark');
  expect(events).toEqual({ errors: 0, external: 0, writes: 0 });
});

test('touch at 25, 50, 100 and 200 percent keeps hit targets and physical mark geometry separate', async ({
  page,
  context,
}, info) => {
  test.skip(
    !info.project.use.hasTouch,
    'Touch-emulated Chromium projects only.',
  );
  const events = runtime(page);
  await start(page);
  const cdp = await context.newCDPSession(page);
  const results: Record<string, unknown>[] = [];
  for (const kind of ['Signature', 'Initials', 'Text', 'Checkmark']) {
    if (kind === 'Signature') await signature(page);
    else {
      await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
      await page.getByRole('button', { name: kind, exact: true }).click();
      if (kind === 'Initials') {
        await page.getByLabel('Name for signature', { exact: true }).fill('AR');
        await page
          .getByRole('button', { name: 'Use initials', exact: true })
          .click();
      }
      await page
        .getByRole('button', {
          name:
            kind === 'Initials' ? 'Place on signature line' : 'Place on page',
          exact: true,
        })
        .click();
    }
    const mark = page.getByRole('button', {
      name:
        kind === 'Signature'
          ? 'Signature: Alex Rivera'
          : kind === 'Initials'
            ? 'Initials: AR'
            : kind === 'Text'
              ? 'Text: Your text'
              : 'Checkmark: ✓',
      exact: true,
    });
    const originalDimensions = await mark.locator('..').evaluate((el) => ({
      width: (el as HTMLElement).style.width,
      height: (el as HTMLElement).style.height,
    }));
    for (const zoom of ['0.25', '0.5', '1', '2']) {
      await page
        .getByLabel('Document zoom', { exact: true })
        .selectOption(zoom);
      await mark.scrollIntoViewIfNeeded();
      const dimensions = await mark.locator('..').evaluate((el) => ({
        width: (el as HTMLElement).style.width,
        height: (el as HTMLElement).style.height,
      }));
      expect(dimensions).toEqual(originalDimensions);
      const target = (await mark.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(43.9);
      expect(target.height).toBeGreaterThanOrEqual(43.9);
      results.push({
        kind,
        zoom,
        width: target.width,
        height: target.height,
        dimensions,
      });
      expect(
        await mark.locator('..').evaluate((el) => ({
          width: (el as HTMLElement).style.width,
          height: (el as HTMLElement).style.height,
        })),
      ).toEqual(dimensions);
    }
    await page
      .getByLabel('Document zoom', { exact: true })
      .selectOption('0.25');
    const done = page.getByRole('button', { name: 'Done', exact: true });
    if (await done.isVisible()) await done.tap();
    await mark.scrollIntoViewIfNeeded();
    const before = await mark
      .locator('..')
      .evaluate((el) => parseFloat((el as HTMLElement).style.left));
    const b = (await mark.boundingBox())!;
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 12, y: y - 8 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() =>
        mark
          .locator('..')
          .evaluate((el) => parseFloat((el as HTMLElement).style.left)),
      )
      .toBeCloseTo(before + 48, 0);
    const handle = page.getByRole('button', {
      name: 'Resize selected mark',
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const hb = (await handle.boundingBox())!;
    expect(hb.width).toBeGreaterThanOrEqual(43.9);
    expect(hb.height).toBeGreaterThanOrEqual(43.9);
    const oldWidth = await mark
      .locator('..')
      .evaluate((el) => parseFloat((el as HTMLElement).style.width));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: hb.x + hb.width / 2 + 8, y: hb.y + hb.height / 2 + 8 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() =>
        mark
          .locator('..')
          .evaluate((el) => parseFloat((el as HTMLElement).style.width)),
      )
      .toBeGreaterThan(oldWidth);
    await capture(page, info, `touch-${kind.toLowerCase()}-25`);
    await properties(page);
    await page
      .getByRole('button', { name: 'Delete element', exact: true })
      .tap();
  }
  await page
    .getByLabel('Current page', { exact: true })
    .selectOption('details');
  for (const zoom of ['0.25', '0.5', '1', '2']) {
    await page.getByLabel('Document zoom', { exact: true }).selectOption(zoom);
    if (zoom === '0.25') {
      const fields = page.getByRole('button', {
        name: '3 fields · Edit',
        exact: true,
      });
      expect((await fields.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await fields.tap();
      await expect(page.getByRole('dialog')).toContainText('Supported fields');
      await page
        .getByRole('button', { name: 'Close dialog', exact: true })
        .tap();
    } else {
      for (const name of ['Full name', 'Preferred name', 'Emergency contact']) {
        const field = page.getByLabel(name, { exact: true });
        const b = (await field.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(43.9);
        results.push({ field: name, zoom, width: b.width, height: b.height });
      }
    }
  }
  for (const name of ['Previous page', 'Next page', 'Page contents']) {
    const b = (await page
      .getByRole('button', { name, exact: true })
      .boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(43.9);
    expect(b.height).toBeGreaterThanOrEqual(43.9);
    results.push({ navigation: name, width: b.width, height: b.height });
  }
  const current = (await page
    .getByLabel('Current page', { exact: true })
    .boundingBox())!;
  expect(current.width).toBeGreaterThanOrEqual(43.9);
  expect(current.height).toBeGreaterThanOrEqual(43.9);
  await info.attach('touch-target-measurements', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  await cdp.detach();
  expect(events).toEqual({ errors: 0, external: 0, writes: 0 });
});

test('visual viewport keyboard simulation keeps the field and live draft visible and restores the tray', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'Mobile viewport/keyboard simulation.',
  );
  const events = runtime(page);
  await page.addInitScript(() => {
    const visual = window.visualViewport!;
    let height: number | null = null;
    let top = 0;
    Object.defineProperty(visual, 'height', {
      get: () => height ?? window.innerHeight,
    });
    Object.defineProperty(visual, 'offsetTop', { get: () => top });
    window.addEventListener('design-test-viewport', (e) => {
      const detail = (e as CustomEvent<{ height: number | null; top: number }>)
        .detail;
      height = detail.height;
      top = detail.top;
      visual.dispatchEvent(new Event('resize'));
    });
  });
  await start(page, true);
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Full name Empty', exact: true })
    .click();
  const field = page.getByLabel('Selected field value', { exact: true });
  await expect(field).toBeFocused();
  await field.fill('María José Rivera (Synthetic)');
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('design-test-viewport', {
        detail: { height: 480, top: 20 },
      }),
    ),
  );
  const workspace = page.getByRole('region', {
    name: 'PDF Tools 2 design prototype',
    exact: true,
  });
  await expect(workspace).toHaveAttribute('data-keyboard-open', 'true');
  await expect
    .poll(async () => Math.round((await workspace.boundingBox())!.height))
    .toBe(480);
  const inputBox = (await field.boundingBox())!;
  expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(500);
  const visible = await page
    .getByLabel('Full name', { exact: true })
    .boundingBox();
  const stage = (await page
    .getByRole('region', { name: 'Document canvas', exact: true })
    .boundingBox())!;
  expect(visible!.y + visible!.height).toBeGreaterThan(stage.y);
  expect(visible!.y).toBeLessThan(stage.y + stage.height);
  await capture(page, info, 'keyboard-field', 500);
  await page
    .getByRole('region', { name: 'Document canvas', exact: true })
    .evaluate((el) => (el.scrollTop += 35));
  await expect(field).toHaveValue('María José Rivera (Synthetic)');
  await expect(
    page.getByRole('complementary', {
      name: 'Selected element properties',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('design-test-viewport', {
        detail: { height: 844, top: 0 },
      }),
    ),
  );
  await field.press('Enter');
  await expect(workspace).toHaveAttribute('data-keyboard-open', 'false');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page', exact: true })
    .click();
  const text = page.getByLabel('Selected mark text', { exact: true });
  await expect(text).toBeFocused();
  await text.fill('Live synthetic draft');
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('design-test-viewport', {
        detail: { height: 480, top: 0 },
      }),
    ),
  );
  await expect(workspace).toHaveAttribute('data-keyboard-open', 'true');
  await expect(
    page.getByRole('button', { name: 'Text: Your text', exact: true }),
  ).toContainText('Live synthetic draft');
  await capture(page, info, 'keyboard-text', 480);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('design-test-viewport', {
        detail: { height: 844, top: 0 },
      }),
    ),
  );
  await text.press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Text: Live synthetic draft',
      exact: true,
    }),
  ).toBeFocused();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('design-test-viewport', {
        detail: { height: null, top: 0 },
      }),
    ),
  );
  await page.setViewportSize({ width: 320, height: 560 });
  await expect
    .poll(async () => Math.round((await workspace.boundingBox())!.height))
    .toBe(560);
  const download = (await page
    .getByRole('button', { name: 'Download', exact: true })
    .boundingBox())!;
  const edit = (await page
    .getByRole('button', { name: 'Edit', exact: true })
    .boundingBox())!;
  expect(download.y + download.height).toBeLessThanOrEqual(560);
  expect(edit.y + edit.height).toBeLessThanOrEqual(560);
  await capture(page, info, 'narrow-restored');
  expect(
    await workspace.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await properties(page);
  await advanced(page);
  const width = page.getByLabel('Mark width', { exact: true });
  await width.focus();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('design-test-viewport', {
        detail: { height: 420, top: 0 },
      }),
    ),
  );
  await expect(workspace).toHaveAttribute('data-keyboard-open', 'true');
  await expect(width).toBeFocused();
  await expect
    .poll(async () => {
      const b = (await width.boundingBox())!;
      return b.y + b.height;
    })
    .toBeLessThanOrEqual(420);
  expect(events).toEqual({ errors: 0, external: 0, writes: 0 });
});
