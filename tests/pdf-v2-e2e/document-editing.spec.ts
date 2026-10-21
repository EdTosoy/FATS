import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { employmentEditingFixture } from '../helpers/pdf-tools-editing-fixtures';
import {
  inspectLocalPdf,
  exportLocalPdf,
} from '../../apps/web/src/lib/pdf-tools-engine';
import type { PdfElement } from '../../apps/web/src/lib/pdf-tools-model';
import { verifyPdfWithPoppler } from '../helpers/pdf-tools-independent';
import { verifyFormRegionsWithPoppler } from '../helpers/pdf-tools-form-independent';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
async function ready(page: Page, number = 1) {
  await expect(
    page.getByRole('img', { name: `PDF page ${number}`, exact: true }),
  ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
}
async function choose(page: Page, number: number) {
  await page
    .getByRole('combobox', { name: 'Current page', exact: true })
    .selectOption({ value: String(number - 1) });
  await ready(page, number);
}
async function at(
  page: Page,
  number: number,
  x: number,
  y: number,
  touch = false,
) {
  const point = await page
    .getByRole('img', { name: `PDF page ${number}`, exact: true })
    .evaluate(
      async (el, p) => {
        const stage = el.closest(
          '[aria-label="PDF document pages; scroll to navigate"]',
        )!;
        let r = el.getBoundingClientRect();
        const initialScale =
          Number(
            (
              el.closest('[data-page-index]') as HTMLElement
            ).style.width.replace('px', ''),
          ) / p.width;
        const bounds = stage.getBoundingClientRect();
        const point = {
          x: r.left + p.x * initialScale,
          y: r.top + p.y * initialScale,
        };
        stage.scrollBy({
          left:
            point.x < bounds.left + 24
              ? point.x - bounds.left - 24
              : point.x > bounds.right - 24
                ? point.x - bounds.right + 24
                : 0,
          top:
            point.y < bounds.top + 24
              ? point.y - bounds.top - 24
              : point.y > bounds.bottom - 24
                ? point.y - bounds.bottom + 24
                : 0,
        });
        await new Promise(requestAnimationFrame);
        r = el.getBoundingClientRect();
        const paper = el.closest('[data-page-index]') as HTMLElement;
        const scale = Number(paper.style.width.replace('px', '')) / p.width;
        return { x: r.left + p.x * scale, y: r.top + p.y * scale };
      },
      {
        x,
        y,
        width:
          number === 3 ? 780 : number === 4 ? 792 : number === 5 ? 600 : 612,
      },
    );
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
async function field(page: Page, name: string) {
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
  return page.getByRole('complementary', {
    name: 'Selected form field',
    exact: true,
  });
}
async function snapshot(page: Page, number: number) {
  await choose(page, number);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('1');
  await ready(page, number);
  return page
    .getByRole('img', { name: `PDF page ${number}`, exact: true })
    .evaluate((el) => {
      const base = el as HTMLCanvasElement,
        copy = document.createElement('canvas');
      copy.width = base.width;
      copy.height = base.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(base, 0, 0);
      const r = base.getBoundingClientRect();
      const marks = Array.from(
        base
          .closest('[data-page-index]')!
          .querySelectorAll<HTMLElement>('[data-mark]'),
      );
      for (const mark of marks) {
        const b = mark.getBoundingClientRect();
        ctx.drawImage(
          mark.querySelector('canvas')!,
          ((b.left - r.left) * base.width) / r.width,
          ((b.top - r.top) * base.height) / r.height,
          (b.width * base.width) / r.width,
          (b.height * base.height) / r.height,
        );
      }
      return {
        base: base.toDataURL(),
        composite: copy.toDataURL(),
        marks: marks.map(
          (mark) => JSON.parse(mark.dataset.mark!) as PdfElement,
        ),
        artwork: marks.map((mark) => mark.querySelector('canvas')!.toDataURL()),
      };
    });
}
const values = {
  'Full name': 'María José Rivera',
  Available: true,
  'Preferred role': 'Trainee',
  'Work arrangement': 'Hybrid',
  'Onboarding contact': 'Alex Rivera',
};
test('complete employment document: fields, direct text, date, initials, marks and independent export', async ({
  page,
  isMobile,
}, info) => {
  const runtime: string[] = [];
  page.on('pageerror', () => runtime.push('pageerror'));
  page.on('console', (m) => {
    if (m.type() === 'error') runtime.push('console error');
  });
  const original = await employmentEditingFixture(),
    model = await inspectLocalPdf(original);
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-onboarding.pdf',
    mimeType: 'application/pdf',
    buffer: original,
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 2);
  let props = await field(page, 'Full name');
  await props.getByRole('textbox').fill(String(values['Full name']));
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  props = await field(page, 'Available');
  await props.getByRole('checkbox').check();
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  props = await field(page, 'Preferred role');
  await props.getByRole('combobox').selectOption('Trainee');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  props = await field(page, 'Work arrangement');
  await props.getByRole('radio', { name: 'Hybrid', exact: true }).check();
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  props = await field(page, 'Onboarding contact');
  await props.getByRole('textbox').fill('Alex Rivera');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  props = await field(page, 'Document reference');
  await expect(props.getByRole('textbox')).toHaveAttribute('readonly', '');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page, 2);
  await page.screenshot({
    path: info.outputPath(
      `completed-fields-${isMobile ? 'mobile' : 'desktop'}.png`,
    ),
  });
  await choose(page, 1);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption(isMobile ? 'fit-width' : '1');
  await ready(page);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await at(page, 1, 60, 210, isMobile);
  const text = page.getByRole('textbox', {
    name: 'Edit added text',
    exact: true,
  });
  await expect(text).toBeFocused();
  await text.fill(
    'María José Rivera accepts the offer.\nAvailable for onboarding — ₱1,000 allowance.',
  );
  await page.screenshot({
    path: info.outputPath(`direct-text-${isMobile ? 'mobile' : 'desktop'}.png`),
  });
  await text.press('Control+Enter');
  let selected = page.getByRole('complementary', {
    name: 'Selected text properties',
    exact: true,
  });
  await selected
    .getByRole('combobox', { name: 'Font weight', exact: true })
    .selectOption('700');
  await selected
    .getByRole('combobox', { name: 'Ink color', exact: true })
    .selectOption('#244e80');
  const savedText = JSON.parse(
    (await page.getByTestId('signature-mark').getAttribute('data-mark'))!,
  ) as PdfElement;
  const handle = page.getByRole('button', { name: 'Resize text', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + 22, handleBox.y + 22);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 42, handleBox.y + 28, { steps: 5 });
  await page.mouse.up();
  expect(
    JSON.parse(
      (await page.getByTestId('signature-mark').getAttribute('data-mark'))!,
    ).width,
  ).toBeGreaterThan(savedText.width);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(
    JSON.parse(
      (await page.getByTestId('signature-mark').getAttribute('data-mark'))!,
    ),
  ).toEqual(savedText);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: savedText.text, exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .press('Control+Enter');
  await selected
    .getByRole('button', {
      name: isMobile ? 'Done' : 'Close text properties',
      exact: true,
    })
    .first()
    .click();
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Choose a date', exact: true })
      .getByLabel('Date', { exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('dialog', { name: 'Choose a date', exact: true })
    .getByLabel('Date', { exact: true })
    .fill('2026-10-21');
  await page.getByRole('button', { name: 'Use date', exact: true }).click();
  await at(page, 1, 390, 580, isMobile);
  const dateProps = page.getByRole('complementary', {
    name: 'Selected date properties',
    exact: true,
  });
  if (isMobile)
    await dateProps.getByRole('button', { name: 'Edit', exact: true }).click();
  await dateProps
    .getByRole('combobox', { name: 'Date format', exact: true })
    .selectOption('iso');
  await dateProps.getByLabel('Date', { exact: true }).fill('2026-10-22');
  const dateMark = page.locator('[data-mark]').filter({
    has: page.getByRole('button', { name: 'Date: 2026-10-22', exact: true }),
  });
  await expect(dateMark).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Date: 2026-10-21', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();

  await page.getByRole('button', { name: 'Initials', exact: true }).click();
  await page.getByLabel('Initials', { exact: true }).fill('MJR');
  await page.getByRole('button', { name: 'Use initials', exact: true }).click();
  await at(page, 1, 120, 580, isMobile);
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await at(page, 1, 500, 450, isMobile);
  await page.getByRole('button', { name: 'Quick Sign', exact: true }).click();
  await expect(page.getByTestId('signature-mark')).toHaveCount(4);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 3);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 3', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .fill('Rotated, cropped onboarding page');
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .press('Control+Enter');
  await page.getByRole('button', { name: 'Initials', exact: true }).click();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  const pad = page.locator('.pdf-signature-pad');
  const padBox = (await pad.boundingBox())!;
  await page.mouse.move(padBox.x + 20, padBox.y + 90);
  await page.mouse.down();
  for (const [x, y] of [
    [40, 30],
    [60, 90],
    [80, 30],
    [100, 90],
    [130, 45],
    [150, 75],
  ])
    await page.mouse.move(padBox.x + x, padBox.y + y, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Use initials', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 3', exact: true })
    .click();
  await choose(page, 5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 5', exact: true })
    .click();
  selected = page.getByRole('complementary', {
    name: 'Selected checkmark properties',
    exact: true,
  });
  if (isMobile)
    await selected.getByRole('button', { name: 'Edit', exact: true }).click();
  await selected
    .getByRole('combobox', { name: 'Mark style', exact: true })
    .selectOption('cross');
  await choose(page, 1);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('fit-page');
  await ready(page);
  await page.screenshot({
    path: info.outputPath(`phase-3-${isMobile ? 'mobile' : 'desktop'}.png`),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const snapshots = [];
  for (let n = 1; n <= 5; n++) snapshots.push(await snapshot(page, n));
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  const download = await downloadEvent;
  await download.saveAs(info.outputPath('synthetic-completed.pdf'));
  const output = await readFile(info.outputPath('synthetic-completed.pdf')),
    after = await inspectLocalPdf(output);
  for (const [name, value] of Object.entries(values))
    expect(after.fields.find((f) => f.name === name)?.value).toBe(value);
  expect(after.pages).toEqual(model.pages);
  expect(after.fields.find((f) => f.name === 'Document reference')?.value).toBe(
    'DEMO-2026',
  );
  const formsOnly = Buffer.from(
    await exportLocalPdf(
      original,
      model,
      { fields: values, elements: [] },
      [],
      { preserveFields: true, editFields: true, requireFields: true },
    ),
  );
  await writeFile(info.outputPath('synthetic-source.pdf'), original);
  await verifyFormRegionsWithPoppler(
    page,
    info,
    original,
    formsOnly,
    model,
    Object.keys(values),
  );
  await verifyPdfWithPoppler(page, info, formsOnly, model, snapshots);
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'completed-reopened.pdf',
    mimeType: 'application/pdf',
    buffer: output,
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 2);
  props = await field(page, 'Full name');
  await expect(props.getByRole('textbox')).toHaveValue('María José Rivera');
  expect(runtime).toEqual([]);
});

test('field and text recovery, coherent history, keyboard placement, low zoom and failed export', async ({
  page,
  isMobile,
}, info) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    let preview = true,
      complete = true;
    window.Worker = class extends Original {
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        const action = (message as { action?: string }).action;
        if (
          (action === 'preview' && preview) ||
          (action === 'complete' && complete)
        ) {
          if (action === 'preview') preview = false;
          else complete = false;
          queueMicrotask(() => this.dispatchEvent(new Event('error')));
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  const runtime: string[] = [];
  page.on('pageerror', () => runtime.push('pageerror'));
  page.on('console', (m) => {
    if (m.type() === 'error') runtime.push('console error');
  });
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-recovery.pdf',
    mimeType: 'application/pdf',
    buffer: await employmentEditingFixture(),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Complete all required' }),
  ).toBeVisible();
  await choose(page, 2);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('0.25');
  await ready(page, 2);
  await page
    .getByRole('button', { name: '6 fields · Edit', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: /^Full name/ })
    .click();
  let props = page.getByRole('complementary', {
    name: 'Selected form field',
    exact: true,
  });
  await props.getByRole('textbox').fill('Alex Rivera');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Form preview could not be updated' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Retry form preview', exact: true })
    .click();
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page, 2);
  await choose(page, 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await choose(page, 2);
  props = await field(page, 'Full name');
  await expect(props.getByRole('textbox')).toHaveValue('');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  props = await field(page, 'Full name');
  await expect(props.getByRole('textbox')).toHaveValue('Alex Rivera');
  await props.getByRole('textbox').fill('漢 unsupported');
  await expect(props.getByRole('textbox')).toHaveValue('漢 unsupported');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Western European' }),
  ).toBeVisible();
  await props.getByRole('textbox').fill('W'.repeat(90));
  await expect(
    page.getByRole('alert').filter({ hasText: 'does not fit legibly' }),
  ).toBeVisible();
  await expect(props.getByRole('textbox')).toHaveValue('W'.repeat(90));
  await props.getByRole('textbox').fill('Alex Rivera');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  await choose(page, 1);
  await page.getByRole('button', { name: 'Text', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Place on page 1', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('textbox', {
    name: 'Edit added text',
    exact: true,
  });
  await expect(editor).toBeFocused();
  await editor.fill('Keep this draft 漢');
  await expect(editor).toHaveValue('Keep this draft 漢');
  await expect(
    page.getByRole('alert').filter({ hasText: 'unsupported' }),
  ).toBeVisible();
  await editor.fill('A'.repeat(501));
  await expect(editor).toHaveValue('A'.repeat(501));
  await expect(
    page.getByRole('alert').filter({ hasText: '500 characters' }),
  ).toBeVisible();
  await editor.fill('First line\nSecond line');
  await editor.press('Control+a');
  await expect(editor).toBeFocused();
  await editor.press('ArrowRight');
  await editor.press('Control+Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const mark = page.getByTestId('signature-mark');
  expect(JSON.parse((await mark.getAttribute('data-mark'))!).text).toBe('');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const saved = JSON.parse(
    (await mark.getAttribute('data-mark'))!,
  ) as PdfElement;
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: 'First line Second line', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .press('Control+Enter');
  const target = page.getByRole('button', {
    name: 'Text: First line Second line',
    exact: true,
  });
  await target.focus();
  await page.keyboard.press('Shift+ArrowRight');
  expect(JSON.parse((await mark.getAttribute('data-mark'))!).x).toBe(
    saved.x + 10,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(JSON.parse((await mark.getAttribute('data-mark'))!)).toEqual(saved);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const beforeFailure = await mark.getAttribute('data-mark');
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page);
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'completed PDF could not be verified' }),
  ).toBeVisible({ timeout: 20000 });
  expect(await mark.getAttribute('data-mark')).toBe(beforeFailure);
  await page.screenshot({
    path: info.outputPath(`recovery-${isMobile ? 'mobile' : 'desktop'}.png`),
  });
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  const download = await event;
  await download.saveAs(info.outputPath('recovery-completed.pdf'));
  expect(
    (
      await inspectLocalPdf(
        await readFile(info.outputPath('recovery-completed.pdf')),
      )
    ).fields.find((f) => f.name === 'Full name')?.value,
  ).toBe('Alex Rivera');
  expect(runtime).toEqual([]);
});

test('on-page widgets focus native editors and have usable keyboard/touch targets', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', () => errors.push('pageerror'));
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-fields.pdf',
    mimeType: 'application/pdf',
    buffer: await employmentEditingFixture(),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 2);
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('0.5');
  await ready(page, 2);
  await expect(
    page.getByRole('button', { name: '6 fields · Edit', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'PDF zoom', exact: true })
    .selectOption('1.25');
  await ready(page, 2);
  const widget = page.locator('[data-field-control="Full name"]');
  await widget.click();
  const props = page.getByRole('complementary', {
    name: 'Selected form field',
    exact: true,
  });
  await expect(props.getByRole('textbox')).toBeFocused();
  await props.getByRole('textbox').fill('Alex Rivera');
  await props.getByRole('textbox').press('Enter');
  await expect(widget).toBeFocused();
  const checkbox = page.getByRole('checkbox', {
    name: 'Available',
    exact: true,
  });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  const radio = page.getByRole('radio', {
    name: 'Work arrangement: Hybrid',
    exact: true,
  });
  await radio.click();
  await expect(radio).toBeChecked();
  const dropdown = page.locator('[data-field-control="Preferred role"]');
  await dropdown.click();
  await expect(props.getByRole('combobox')).toBeFocused();
  await props.getByRole('combobox').selectOption('Assistant');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  for (const target of [widget, checkbox, radio, dropdown]) {
    const bounds = (await target.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(43.9);
    expect(bounds.height).toBeGreaterThanOrEqual(43.9);
  }
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page, 2);
  await page.screenshot({
    path: info.outputPath(`widgets-${isMobile ? 'mobile' : 'desktop'}.png`),
  });
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await at(page, 2, 120, 90, isMobile);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'cannot cover an existing form field' }),
  ).toBeVisible();
  await expect(page.getByTestId('signature-mark')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Cancel placement', exact: true })
    .click();
  expect(errors).toEqual([]);
});

test('mobile added text follows the simulated software keyboard viewport', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'Mobile VisualViewport simulation; physical devices remain unverified.',
  );
  await page.addInitScript(() => {
    const viewport = window.visualViewport!,
      proto = Object.getPrototypeOf(viewport),
      readHeight = Object.getOwnPropertyDescriptor(proto, 'height')!.get!;
    let height: number | null = null;
    Object.defineProperty(viewport, 'height', {
      get: () => height ?? readHeight.call(viewport),
    });
    (
      window as unknown as {
        simulateEditingKeyboard: (height: number | null) => void;
      }
    ).simulateEditingKeyboard = (value) => {
      height = value;
      viewport.dispatchEvent(new Event('resize'));
    };
  });
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-keyboard.pdf',
    mimeType: 'application/pdf',
    buffer: await employmentEditingFixture(),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  const editor = page.getByRole('textbox', {
    name: 'Edit added text',
    exact: true,
  });
  await expect(editor).toBeFocused();
  await page.evaluate(() =>
    (
      window as unknown as {
        simulateEditingKeyboard: (height: number | null) => void;
      }
    ).simulateEditingKeyboard(380),
  );
  await editor.fill('Mobile text\nJosé ₱1,000');
  await expect(page.locator('[data-pdf-v2-workspace]')).toHaveAttribute(
    'data-keyboard',
    'true',
  );
  const bounds = (await editor.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(380.1);
  await page.screenshot({ path: info.outputPath('mobile-text-keyboard.png') });
  await page.evaluate(() =>
    (
      window as unknown as {
        simulateEditingKeyboard: (height: number | null) => void;
      }
    ).simulateEditingKeyboard(null),
  );
  await editor.press('Control+Enter');
  await expect(
    page.getByRole('button', { name: 'Text', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-text-320.png') });
});

test('stalled artwork encoding releases export and preserves editable content', async ({
  page,
}) => {
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-encoding.pdf',
    mimeType: 'application/pdf',
    buffer: await employmentEditingFixture(),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  // Complete the required field first so this exercises serialization itself.
  await choose(page, 2);
  const props = await field(page, 'Full name');
  await props.getByRole('textbox').fill('Alex Rivera');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page, 2);
  await choose(page, 1);
  const before = await page
    .getByTestId('signature-mark')
    .getAttribute('data-mark');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let fail = true;
    HTMLCanvasElement.prototype.toBlob = function (
      ...args: Parameters<HTMLCanvasElement['toBlob']>
    ) {
      if (fail) {
        fail = false;
        return;
      }
      return original.apply(this, args);
    };
  });
  await page.clock.install();
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await page.clock.runFor(16000);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Could not prepare this mark in time' }),
  ).toBeVisible();
  expect(
    await page.getByTestId('signature-mark').getAttribute('data-mark'),
  ).toBe(before);
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeEnabled();
  await page.clock.resume();
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await event;
});

test('download validation returns to invalid text on another page without losing it', async ({
  page,
}) => {
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-review.pdf',
    mimeType: 'application/pdf',
    buffer: await employmentEditingFixture(),
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 2);
  const props = await field(page, 'Full name');
  await props.getByRole('textbox').fill('Alex Rivera');
  await props.getByRole('button', { name: 'Done', exact: true }).last().click();
  await choose(page, 1);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Edit added text', exact: true })
    .fill('Keep my draft 漢');
  await choose(page, 5);
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page, 5);
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Current page', exact: true }),
  ).toHaveValue('0');
  const editor = page.getByRole('textbox', {
    name: 'Edit added text',
    exact: true,
  });
  await expect(editor).toHaveValue('Keep my draft 漢');
  await expect(editor).toBeFocused();
  await editor.fill('Corrected, retained text');
  await editor.press('Control+Enter');
});

test('selecting an earlier overlapping mark preserves the visible artwork order', async ({
  page,
  isMobile,
}, info) => {
  const original = await employmentEditingFixture();
  const model = await inspectLocalPdf(original);
  await page.goto('/dev/pdf-tools-v2');
  await page.getByLabel('Choose a local PDF', { exact: true }).setInputFiles({
    name: 'synthetic-order.pdf',
    mimeType: 'application/pdf',
    buffer: original,
  });
  await ready(page);
  await page.getByRole('button', { name: 'Edit PDF', exact: true }).click();
  await choose(page, 2);
  const fieldProps = await field(page, 'Full name');
  await fieldProps.getByRole('textbox').fill('Alex Rivera');
  await fieldProps
    .getByRole('button', { name: 'Done', exact: true })
    .last()
    .click();
  await expect(
    page.getByText('Updating form preview…', { exact: true }),
  ).toHaveCount(0);
  await ready(page, 2);
  await choose(page, 1);

  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place on page 1', exact: true })
    .click();
  let props = page.getByRole('complementary', {
    name: 'Selected checkmark properties',
    exact: true,
  });
  if (isMobile)
    await props.getByRole('button', { name: 'Edit', exact: true }).click();
  await props
    .getByRole('combobox', { name: 'Ink color', exact: true })
    .selectOption('#244e80');
  const first = JSON.parse(
    (await page.getByTestId('signature-mark').getAttribute('data-mark'))!,
  ) as PdfElement;
  await page.getByRole('button', { name: 'Checkmark', exact: true }).click();
  await at(
    page,
    1,
    first.x + first.width / 2,
    first.y + first.height / 2,
    isMobile,
  );
  props = page.getByRole('complementary', {
    name: 'Selected checkmark properties',
    exact: true,
  });
  if (isMobile)
    await props.getByRole('button', { name: 'Edit', exact: true }).click();
  await props
    .getByRole('combobox', { name: 'Ink color', exact: true })
    .selectOption('#111111');
  await props
    .getByRole('combobox', { name: 'Mark style', exact: true })
    .selectOption('cross');
  await page
    .getByRole('button', { name: 'Page contents', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Page contents', exact: true })
    .getByRole('button', { name: 'Checkmark', exact: true })
    .click();
  const firstMark = page.getByTestId('signature-mark').nth(0);
  await expect(
    firstMark.getByRole('button', {
      name: 'Checkmark: Checkmark',
      exact: true,
    }),
  ).toBeFocused();
  await firstMark.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const bounds = (await firstMark.boundingBox())!;
  // At (16,16), both the blue check and later black cross have solid ink. The
  // black cross must remain on top after selecting the earlier blue check.
  const crop = await page.screenshot({
    clip: {
      x: bounds.x + (bounds.width * 16) / 28,
      y: bounds.y + (bounds.height * 16) / 28,
      width: 1,
      height: 1,
    },
  });
  const blue = await page.evaluate(
    async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data[2];
    },
    `data:image/png;base64,${crop.toString('base64')}`,
  );
  expect(blue).toBeLessThan(60);
  const snapshots = [];
  for (let number = 1; number <= 5; number++)
    snapshots.push(await snapshot(page, number));
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download completed PDF', exact: true })
    .click();
  await (await event).saveAs(info.outputPath('synthetic-completed.pdf'));
  const formsOnly = Buffer.from(
    await exportLocalPdf(
      original,
      model,
      { fields: { 'Full name': 'Alex Rivera' }, elements: [] },
      [],
      { preserveFields: true, editFields: true, requireFields: true },
    ),
  );
  await verifyPdfWithPoppler(page, info, formsOnly, model, snapshots);
});
