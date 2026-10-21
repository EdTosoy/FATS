import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type {
  PdfElement,
  PdfInfo,
} from '../../apps/web/src/lib/pdf-tools-model';

const run = promisify(execFile);
type Snapshot = {
  base: string;
  composite: string;
  marks: PdfElement[];
  artwork: string[];
};

// Optional local verification against an already installed independent renderer.
// No downloading, dependency installation, or application configuration changes.
export async function verifyPdfWithPoppler(
  page: Page,
  info: TestInfo,
  original: Buffer,
  model: PdfInfo,
  snapshots: Snapshot[],
) {
  const bin = process.env.PDF_TOOLS_POPPLER_BIN;
  if (!bin) {
    info.annotations.push({
      type: 'independent-renderer-not-run',
      description:
        'Set PDF_TOOLS_POPPLER_BIN to an existing Poppler bin directory.',
    });
    return;
  }
  const source = info.outputPath('synthetic-original.pdf');
  const completed = info.outputPath('synthetic-completed.pdf');
  await writeFile(source, original);
  const reports: Record<string, string> = {};
  for (const [label, path] of [
    ['original', source],
    ['completed', completed],
  ]) {
    const options = { timeout: 30000, maxBuffer: 4 * 1024 * 1024 };
    const metadata = await run(
      join(bin, 'pdfinfo'),
      ['-f', '1', '-l', String(model.pages.length), '-box', path],
      options,
    );
    expect(metadata.stderr).toBe('');
    expect(metadata.stdout).toMatch(
      new RegExp(`Pages:\\s+${model.pages.length}\\b`),
    );
    reports[label + 'Metadata'] = metadata.stdout;
    const text = await run(
      join(bin, 'pdftotext'),
      ['-cropbox', '-layout', path, '-'],
      options,
    );
    expect(text.stderr).toBe('');
    reports[label + 'Text'] = text.stdout;
    const raster = await run(
      join(bin, 'pdftoppm'),
      [
        '-r',
        '144',
        '-cropbox',
        '-png',
        path,
        info.outputPath(`poppler-${label}`),
      ],
      options,
    );
    expect(raster.stderr).toBe('');
  }
  // Added signatures are artwork, so all pre-existing extractable page text,
  // including the form value and page delimiters/order, must be unchanged.
  expect(reports.completedText).toBe(reports.originalText);
  for (const label of ['original', 'completed'])
    await writeFile(
      info.outputPath(`poppler-${label}-info.txt`),
      reports[label + 'Metadata'],
    );
  const geometry = (text: string) =>
    text
      .split('\n')
      .filter((line) =>
        /^Page\s+\d+\s+(size:|rot:|MediaBox:|CropBox:)/.test(line),
      );
  expect(geometry(reports.completedMetadata)).toEqual(
    geometry(reports.originalMetadata),
  );
  expect(geometry(reports.originalMetadata)).toHaveLength(
    model.pages.length * 4,
  );
  const images = await run(join(bin, 'pdfimages'), ['-list', completed], {
    timeout: 30000,
  });
  expect(images.stderr).toBe('');
  expect(images.stdout.match(/^\s+\d+\s+\d+\s+smask\s/gm)).toHaveLength(
    snapshots.reduce((count, snapshot) => count + snapshot.marks.length, 0),
  );
  await writeFile(info.outputPath('poppler-images.txt'), images.stdout);
  const measurements = [];
  for (let index = 0; index < snapshots.length; index++) {
    const number = index + 1;
    const asData = async (name: string) =>
      `data:image/png;base64,${(await readFile(info.outputPath(name))).toString('base64')}`;
    const result = await page.evaluate(
      async (input) => {
        const load = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const originalImage = await load(input.original);
        const outputImage = await load(input.completed);
        const width = originalImage.width,
          height = originalImage.height;
        if (outputImage.width !== width || outputImage.height !== height)
          throw new Error('Independent page dimensions changed.');
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        const pixels = (image: CanvasImageSource) => {
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        };
        const before = pixels(originalImage),
          after = pixels(outputImage);
        context.drawImage(originalImage, 0, 0);
        for (let i = 0; i < input.snapshot.marks.length; i++) {
          const mark = input.snapshot.marks[i];
          const image = await load(input.snapshot.artwork[i]);
          context.drawImage(
            image,
            (mark.x * width) / input.viewWidth,
            (mark.y * height) / input.viewHeight,
            (mark.width * width) / input.viewWidth,
            (mark.height * height) / input.viewHeight,
          );
        }
        const expected = context.getImageData(0, 0, width, height).data;
        const expectedPng = canvas.toDataURL();
        const previewBase = pixels(await load(input.snapshot.base));
        const preview = pixels(await load(input.snapshot.composite));
        const differs = (
          a: Uint8ClampedArray,
          b: Uint8ClampedArray,
          i: number,
          threshold = 32,
        ) =>
          Math.max(
            Math.abs(a[i] - b[i]),
            Math.abs(a[i + 1] - b[i + 1]),
            Math.abs(a[i + 2] - b[i + 2]),
          ) > threshold;
        const sx = width / input.viewWidth,
          sy = height / input.viewHeight;
        const marks = input.snapshot.marks.map((mark) => {
          const wantedBounds = [width, height, -1, -1],
            actualBounds = [width, height, -1, -1];
          let transparentChanges = 0;
          let wanted = 0,
            found = 0,
            covered = 0,
            explained = 0;
          const radius = Math.ceil(Math.max(sx, sy));
          for (
            let y = Math.max(0, Math.floor((mark.y - 3) * sy));
            y < Math.min(height, Math.ceil((mark.y + mark.height + 3) * sy));
            y++
          )
            for (
              let x = Math.max(0, Math.floor((mark.x - 3) * sx));
              x < Math.min(width, Math.ceil((mark.x + mark.width + 3) * sx));
              x++
            ) {
              const i = (y * width + x) * 4;
              const want = differs(before, expected, i),
                got = differs(before, after, i);
              if (want) {
                wanted++;
                wantedBounds[0] = Math.min(wantedBounds[0], x);
                wantedBounds[1] = Math.min(wantedBounds[1], y);
                wantedBounds[2] = Math.max(wantedBounds[2], x);
                wantedBounds[3] = Math.max(wantedBounds[3], y);
              }
              if (got) {
                found++;
                actualBounds[0] = Math.min(actualBounds[0], x);
                actualBounds[1] = Math.min(actualBounds[1], y);
                actualBounds[2] = Math.max(actualBounds[2], x);
                actualBounds[3] = Math.max(actualBounds[3], y);
              }
              if (!want && !got) {
                // Blank artwork must leave the underlying colored document
                // intact, including differences below the ink-mask threshold.
                if (
                  !differs(before, expected, i, 0) &&
                  differs(before, after, i, 0)
                ) {
                  let nearInk = false;
                  for (let dy = -radius - 1; dy <= radius + 1; dy++)
                    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
                      const px = x + dx,
                        py = y + dy;
                      if (
                        px >= 0 &&
                        py >= 0 &&
                        px < width &&
                        py < height &&
                        differs(before, expected, (py * width + px) * 4, 0)
                      )
                        nearInk = true;
                    }
                  if (!nearInk) transparentChanges++;
                }
                continue;
              }
              let matchesActual = false,
                matchesExpected = false;
              for (let dy = -radius; dy <= radius; dy++)
                for (let dx = -radius; dx <= radius; dx++) {
                  const px = x + dx,
                    py = y + dy;
                  if (px < 0 || py < 0 || px >= width || py >= height) continue;
                  const j = (py * width + px) * 4;
                  if (want && differs(before, after, j)) matchesActual = true;
                  if (got && differs(before, expected, j))
                    matchesExpected = true;
                }
              if (want && matchesActual) covered++;
              if (got && matchesExpected) explained++;
            }
          return {
            transparentChanges,
            id: mark.id,
            kind: mark.strokes ? 'drawn' : 'typed',
            name: mark.text,
            wanted,
            found,
            recall: covered / Math.max(1, wanted),
            precision: explained / Math.max(1, found),
            expectedInkBoundsPt: wantedBounds.map(
              (v, i) => v / (i % 2 ? sy : sx),
            ),
            actualInkBoundsPt: actualBounds.map(
              (v, i) => v / (i % 2 ? sy : sx),
            ),
            boundErrorPt: Math.max(
              ...wantedBounds.map(
                (v, i) => Math.abs(v - actualBounds[i]) / (i % 2 ? sy : sx),
              ),
            ),
          };
        });
        let outsideExact = 0,
          viewerBaseDifferences = 0,
          viewerCompositeDifferences = 0;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (differs(previewBase, before, i)) viewerBaseDifferences++;
            if (differs(preview, after, i)) viewerCompositeDifferences++;
            if (
              input.snapshot.marks.some(
                (mark) =>
                  x >= (mark.x - 3) * sx &&
                  x <= (mark.x + mark.width + 3) * sx &&
                  y >= (mark.y - 3) * sy &&
                  y <= (mark.y + mark.height + 3) * sy,
              )
            )
              continue;
            if (differs(before, after, i, 0)) outsideExact++;
          }
        return {
          width,
          height,
          marks,
          outsideExact,
          viewerBaseDifferences,
          viewerCompositeDifferences,
          expectedPng,
        };
      },
      {
        original: await asData(`poppler-original-${number}.png`),
        completed: await asData(`poppler-completed-${number}.png`),
        snapshot: snapshots[index],
        viewWidth: model.pages[index].viewWidth,
        viewHeight: model.pages[index].viewHeight,
      },
    );
    const { expectedPng, ...metrics } = result;
    await writeFile(
      info.outputPath(`poppler-expected-${number}.png`),
      Buffer.from(expectedPng.split(',')[1], 'base64'),
    );
    measurements.push({ page: number, ...metrics });
  }
  // Keep measurements even when an assertion exposes a genuine export defect.
  await writeFile(
    info.outputPath('poppler-comparison.json'),
    JSON.stringify(measurements, null, 2) + '\n',
  );
  for (const result of measurements) {
    expect(result.outsideExact).toBe(0);
    for (const mark of result.marks) {
      expect(mark.wanted).toBeGreaterThan(30);
      expect(mark.found).toBeGreaterThan(30);
      expect(mark.transparentChanges).toBe(0);
      expect(mark.recall).toBeGreaterThan(0.94);
      expect(mark.precision).toBeGreaterThan(0.94);
      expect(mark.boundErrorPt).toBeLessThanOrEqual(1.1);
    }
  }
}
