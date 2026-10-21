import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { pdfToolsLib } from './pdf-tools-fixtures';

const run = promisify(execFile);
// Compare actual independent downloads with the corresponding pages of the
// actual complete editing download. The established Phase 2–4A suite separately
// checks that complete download against source artwork and preview mark pixels.
export async function verifyPageCopyWithPoppler(
  page: Page,
  info: TestInfo,
  completePath: string,
  outputPath: string,
  positions: number[],
  label: string,
  outputPositions?: number[],
) {
  const complete = await pdfToolsLib.PDFDocument.load(
    await readFile(completePath),
  );
  const output = await pdfToolsLib.PDFDocument.load(await readFile(outputPath));
  if (!outputPositions) expect(output.getPageCount()).toBe(positions.length);
  for (const [index, position] of positions.entries()) {
    const actual = output.getPage((outputPositions?.[index] ?? index + 1) - 1),
      expected = complete.getPage(position - 1);
    expect(actual.getMediaBox()).toEqual(expected.getMediaBox());
    expect(actual.getCropBox()).toEqual(expected.getCropBox());
    expect(actual.getRotation()).toEqual(expected.getRotation());
  }
  const bin = process.env.PDF_TOOLS_POPPLER_BIN;
  if (!bin) {
    info.annotations.push({
      type: 'independent-renderer-not-run',
      description:
        'Set PDF_TOOLS_POPPLER_BIN to the existing Poppler installation.',
    });
    return;
  }
  const metadata = await run(join(bin, 'pdfinfo'), ['-box', outputPath]);
  expect(metadata.stderr).toBe('');
  await writeFile(info.outputPath(`${label}-pdfinfo.txt`), metadata.stdout);
  const metrics = [];
  for (const [index, position] of positions.entries()) {
    const texts = [];
    const rasters = [];
    for (const [name, file, number] of [
      ['expected', completePath, position],
      ['actual', outputPath, outputPositions?.[index] ?? index + 1],
    ] as const) {
      const text = await run(join(bin, 'pdftotext'), [
        '-f',
        String(number),
        '-l',
        String(number),
        '-raw',
        '-cropbox',
        file,
        '-',
      ]);
      expect(text.stderr).toBe('');
      texts.push(text.stdout);
      const prefix = info.outputPath(`${label}-${index + 1}-${name}`);
      const render = await run(
        join(bin, 'pdftoppm'),
        [
          '-f',
          String(number),
          '-l',
          String(number),
          '-singlefile',
          '-r',
          '144',
          '-cropbox',
          '-png',
          file,
          prefix,
        ],
        { timeout: 30000 },
      );
      expect(render.stderr).toBe('');
      rasters.push((await readFile(prefix + '.png')).toString('base64'));
    }
    expect(texts[1]).toBe(texts[0]);
    const measurement = await page.evaluate(async ([expected, actual]) => {
      const images = await Promise.all(
        [expected, actual].map(async (data) => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + data;
          await image.decode();
          return image;
        }),
      );
      if (
        images[0].width !== images[1].width ||
        images[0].height !== images[1].height
      )
        throw new Error('Independent page dimensions changed.');
      const canvas = document.createElement('canvas');
      canvas.width = images[0].width;
      canvas.height = images[0].height;
      const context = canvas.getContext('2d')!;
      const pixels = images.map((image) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      });
      let changed = 0;
      for (let i = 0; i < pixels[0].length; i += 4)
        if (
          pixels[0][i] !== pixels[1][i] ||
          pixels[0][i + 1] !== pixels[1][i + 1] ||
          pixels[0][i + 2] !== pixels[1][i + 2]
        )
          changed++;
      return { width: canvas.width, height: canvas.height, changed };
    }, rasters);
    metrics.push(measurement);
    expect(measurement.changed).toBe(0);
  }
  await writeFile(
    info.outputPath(`${label}-pixels.json`),
    JSON.stringify(metrics, null, 2),
  );
}
