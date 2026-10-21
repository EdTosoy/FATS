import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { pdfToolsFixture, pdfToolsLib } from '../helpers/pdf-tools-fixtures';
import { inspectLocalPdf } from '../../apps/web/src/lib/pdf-tools-engine';
import {
  viewToPdf,
  PDF_TOOLS_LIMITS,
} from '../../apps/web/src/lib/pdf-tools-model';
import { checkedPdfPage } from '../../apps/web/src/lib/pdf-tools-renderer';
import {
  clientToPdf,
  pdfToClient,
  pdfRasterScale,
} from '../../apps/web/src/lib/pdf-tools-viewport';

const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const pdfjs = (await import(
  require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
)) as typeof import('../../apps/web/node_modules/pdfjs-dist');

describe('real PDF.js viewport coordinate contract', () => {
  it('round trips crop/rotation, zoom, viewport offsets and raster DPR independently', async () => {
    const bytes = await pdfToolsFixture();
    const info = await inspectLocalPdf(bytes);
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      verbosity: 0,
    });
    try {
      const document = await task.promise;
      for (let index = 0; index < info.pages.length; index++) {
        const geometry = info.pages[index];
        const proxy = await checkedPdfPage(document, index, geometry);
        for (const zoom of [0.25, 0.5, 1, 1.37, 2]) {
          const viewport = proxy.getViewport({
            scale: zoom,
            offsetX: 17,
            offsetY: -9,
          });
          for (const offset of [
            { left: 100, top: 80 },
            { left: -420, top: -730 },
          ]) {
            const rect = {
              ...offset,
              width: viewport.width * 0.73,
              height: viewport.height * 0.73,
            };
            for (const fraction of [0, 0.137, 0.5, 1]) {
              const point = viewToPdf(geometry, {
                x: geometry.viewWidth * fraction,
                y: geometry.viewHeight * (1 - fraction),
              });
              const screen = pdfToClient(viewport, rect, point);
              const result = clientToPdf(viewport, rect, screen);
              expect(result.x).toBeCloseTo(point.x, 8);
              expect(result.y).toBeCloseTo(point.y, 8);
              // DPR changes raster resolution, never this mapping.
              for (const dpr of [1, 2, 3]) {
                const scale = pdfRasterScale(
                  geometry.viewWidth,
                  geometry.viewHeight,
                  zoom,
                  dpr,
                );
                expect(
                  Math.ceil(geometry.viewWidth * scale) *
                    Math.ceil(geometry.viewHeight * scale),
                ).toBeLessThanOrEqual(PDF_TOOLS_LIMITS.pixels);
              }
            }
          }
        }
      }
      await expect(
        checkedPdfPage(document, 1, { ...info.pages[1], x: 0 }),
      ).rejects.toThrow('geometry');
      await expect(
        checkedPdfPage(document, 0, { ...info.pages[0], viewWidth: 500 }),
      ).rejects.toThrow('geometry');
    } finally {
      await task.destroy();
    }
  });
  it('uses the MediaBox/CropBox intersection with a nonzero MediaBox origin', async () => {
    const pdf = await pdfToolsLib.PDFDocument.create();
    for (const rotation of [0, 90, 180, 270]) {
      const page = pdf.addPage([612, 792]);
      page.setMediaBox(40, 60, 500, 700);
      page.setCropBox(10, 90, 580, 720);
      page.setRotation(pdfToolsLib.degrees(rotation));
    }
    const bytes = await pdf.save();
    const info = await inspectLocalPdf(bytes);
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    try {
      const document = await task.promise;
      for (let i = 0; i < 4; i++) {
        expect(info.pages[i]).toMatchObject({
          x: 40,
          y: 90,
          width: 500,
          height: 670,
        });
        const proxy = await checkedPdfPage(document, i, info.pages[i]);
        const viewport = proxy.getViewport({ scale: 1 });
        const expected = viewToPdf(info.pages[i], { x: 100, y: 120 });
        const result = clientToPdf(
          viewport,
          {
            left: -20,
            top: 80,
            width: viewport.width / 4,
            height: viewport.height / 4,
          },
          { x: 5, y: 110 },
        );
        expect(result).toEqual(expected);
      }
    } finally {
      await task.destroy();
    }
  });
  it('refuses an invisible page and budgets rounded pixels at the maximum page size', async () => {
    for (const [width, height] of [
      [2400, 2400],
      [72, 2400],
      [2399.8, 1199.5],
    ]) {
      const scale = pdfRasterScale(width, height, 2, 3);
      expect(
        Math.ceil(width * scale) * Math.ceil(height * scale),
      ).toBeLessThanOrEqual(4_000_000);
    }
    expect(() =>
      clientToPdf(
        {} as Parameters<typeof clientToPdf>[0],
        { left: 0, top: 0, width: 0, height: 1 },
        { x: 0, y: 0 },
      ),
    ).toThrow('not visible');
  });
});
