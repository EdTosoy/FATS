import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { PdfInfo } from '../../apps/web/src/lib/pdf-tools-model';
const run = promisify(execFile);

// Independently compare original and field-only renders. Only deliberately
// edited widget rectangles may change; original paragraphs and other pages may not.
export async function verifyFormRegionsWithPoppler(
  page: Page,
  info: TestInfo,
  original: Buffer,
  forms: Buffer,
  model: PdfInfo,
  changed: string[],
) {
  const bin = process.env.PDF_TOOLS_POPPLER_BIN;
  if (!bin) return;
  const metrics = [];
  for (const [label, bytes] of [
    ['source', original],
    ['fields', forms],
  ] as const) {
    const path = info.outputPath(`synthetic-${label}.pdf`);
    await writeFile(path, bytes);
    const result = await run(
      join(bin, 'pdftoppm'),
      ['-r', '144', '-cropbox', '-png', path, info.outputPath(`form-${label}`)],
      { timeout: 30000 },
    );
    expect(result.stderr).toBe('');
  }
  for (let index = 0; index < model.pages.length; index++) {
    const geometry = model.pages[index];
    const view = (x: number, y: number) => {
      switch (geometry.rotation) {
        case 90:
          return [y - geometry.y, x - geometry.x];
        case 180:
          return [geometry.x + geometry.width - x, y - geometry.y];
        case 270:
          return [
            geometry.y + geometry.height - y,
            geometry.x + geometry.width - x,
          ];
        default:
          return [x - geometry.x, geometry.y + geometry.height - y];
      }
    };
    const regions = (model.formWidgets ?? [])
      .filter((w) => w.page === index && changed.includes(w.field ?? ''))
      .map((w) => {
        const a = view(w.x, w.y),
          b = view(w.x + w.width, w.y + w.height);
        return {
          x: Math.min(a[0], b[0]),
          y: Math.min(a[1], b[1]),
          width: Math.abs(a[0] - b[0]),
          height: Math.abs(a[1] - b[1]),
        };
      });
    const data = async (label: string) =>
      `data:image/png;base64,${(await readFile(info.outputPath(`form-${label}-${index + 1}.png`))).toString('base64')}`;
    const result = await page.evaluate(
      async (input) => {
        const pixels = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          return {
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            width: canvas.width,
            height: canvas.height,
          };
        };
        const a = await pixels(input.before),
          b = await pixels(input.after);
        let outside = 0,
          inside = 0;
        for (let y = 0; y < a.height; y++)
          for (let x = 0; x < a.width; x++) {
            const i = (y * a.width + x) * 4;
            if (
              a.data[i] === b.data[i] &&
              a.data[i + 1] === b.data[i + 1] &&
              a.data[i + 2] === b.data[i + 2]
            )
              continue;
            if (
              input.regions.some(
                (r) =>
                  x >= (r.x - 3) * 2 &&
                  x <= (r.x + r.width + 3) * 2 &&
                  y >= (r.y - 3) * 2 &&
                  y <= (r.y + r.height + 3) * 2,
              )
            )
              inside++;
            else outside++;
          }
        return { outside, inside, width: a.width, height: a.height };
      },
      { before: await data('source'), after: await data('fields'), regions },
    );
    metrics.push({ page: index + 1, ...result });
  }
  await writeFile(
    info.outputPath('poppler-field-regions.json'),
    JSON.stringify(metrics, null, 2) + '\n',
  );
  for (const result of metrics) expect(result.outside).toBe(0);
  expect(metrics.reduce((sum, p) => sum + p.inside, 0)).toBeGreaterThan(100);
}
