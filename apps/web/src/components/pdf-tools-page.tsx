'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { createPdfLoadingTask, checkedPdfPage } from '@/lib/pdf-tools-renderer';
import {
  PDF_TOOLS_LIMITS,
  fitElement,
  type PdfEdits,
  type PdfElement,
  type PdfPageInfo,
} from '@/lib/pdf-tools-model';
import { PdfMark } from './pdf-tools-marks';

export function PdfToolsPage({
  bytes,
  page,
  geometry,
  zoom,
  edits,
  selected,
  onSelect,
  onMove,
  disabled,
}: {
  bytes: Uint8Array;
  page: number;
  geometry: PdfPageInfo;
  zoom: number;
  edits: PdfEdits;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (element: PdfElement) => void;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [imageOnly, setImageOnly] = useState(false);
  const [drag, setDrag] = useState<PdfElement | null>(null);
  const gesture = useRef<{
    element: PdfElement;
    x: number;
    y: number;
    width: number;
    height: number;
    latest: PdfElement;
  } | null>(null);
  useEffect(() => {
    let stopped = false,
      task: PDFDocumentLoadingTask | undefined,
      render: RenderTask | undefined;
    const timer = setTimeout(() => {
      stopped = true;
      render?.cancel();
      void task?.destroy();
      setStatus('error');
    }, PDF_TOOLS_LIMITS.timeout);
    void (async () => {
      try {
        task = await createPdfLoadingTask(bytes);
        if (stopped) {
          void task.destroy();
          return;
        }
        const pdf = await task.promise;
        const proxy = await checkedPdfPage(pdf, page, geometry);
        if (stopped || !canvas.current) return;
        const base = proxy.getViewport({ scale: 1 });
        if (
          Math.abs(base.width - geometry.viewWidth) > 0.1 ||
          Math.abs(base.height - geometry.viewHeight) > 0.1
        )
          throw new Error();
        const scale = Math.min(
          2,
          Math.sqrt(PDF_TOOLS_LIMITS.pixels / (base.width * base.height)),
        );
        const viewport = proxy.getViewport({ scale });
        const element = canvas.current,
          context = element.getContext('2d');
        if (!context) throw new Error();
        element.width = Math.ceil(viewport.width);
        element.height = Math.ceil(viewport.height);
        render = proxy.render({
          canvas: element,
          canvasContext: context,
          viewport,
          annotationMode: 1, // PDF.js AnnotationMode.ENABLE: raster appearances only.
        });
        await render.promise;
        const text = await proxy.getTextContent();
        if (!stopped) {
          clearTimeout(timer);
          setImageOnly(
            !text.items.some((item) => 'str' in item && item.str.trim()),
          );
          setStatus('ready');
        }
      } catch {
        if (!stopped) {
          clearTimeout(timer);
          setStatus('error');
        }
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      render?.cancel();
      void task?.destroy();
    };
  }, [bytes, page, geometry]);
  return (
    <div className="pdf-preview-region">
      <p role="status" className="field-hint">
        {status === 'loading'
          ? 'Rendering page…'
          : status === 'ready'
            ? 'Page ready. Select a mark to move or edit it.'
            : ''}
      </p>
      {status === 'error' && (
        <p role="alert" className="error-message">
          This page could not be rendered within the browser limits. Close this
          file and use a simpler PDF. Download is blocked while this page cannot
          be checked.
        </p>
      )}
      {imageOnly && (
        <p className="pdf-local-note">
          This page has no selectable text and may be a scan. You can place
          marks over it, but existing image text cannot be edited. OCR is not
          included.
        </p>
      )}
      <div
        className="pdf-scroll-area"
        tabIndex={0}
        aria-label="PDF page preview; scroll to see the full page"
      >
        <div
          ref={container}
          className="pdf-edit-page"
          data-testid="pdf-edit-page"
          data-ready={status === 'ready'}
          style={{
            width: `${zoom * 100}%`,
            maxWidth: geometry.viewWidth * zoom,
            aspectRatio: `${geometry.viewWidth}/${geometry.viewHeight}`,
            visibility: status === 'error' ? 'hidden' : 'visible',
          }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={`PDF page ${page + 1}`}
            data-rendered={status === 'ready'}
            className="pdf-base-canvas"
          />
          {status === 'ready' &&
            edits.elements
              .filter((element) => element.page === page)
              .map((saved) => {
                const element = drag?.id === saved.id ? drag : saved;
                return (
                  <button
                    type="button"
                    key={element.id}
                    aria-label={`${element.kind} mark: ${element.text || 'drawn mark'}`}
                    aria-pressed={selected === element.id}
                    disabled={disabled}
                    className={`pdf-placed-mark ${selected === element.id ? 'selected' : ''}`}
                    style={{
                      left: `${(element.x / geometry.viewWidth) * 100}%`,
                      top: `${(element.y / geometry.viewHeight) * 100}%`,
                      width: `${(element.width / geometry.viewWidth) * 100}%`,
                      height: `${(element.height / geometry.viewHeight) * 100}%`,
                    }}
                    onClick={() => onSelect(element.id)}
                    onPointerDown={(event) => {
                      if (disabled || !container.current) return;
                      onSelect(element.id);
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const rect = container.current.getBoundingClientRect();
                      gesture.current = {
                        element,
                        latest: element,
                        x: event.clientX,
                        y: event.clientY,
                        width: rect.width,
                        height: rect.height,
                      };
                    }}
                    onPointerMove={(event) => {
                      const start = gesture.current;
                      if (!start) return;
                      const next = fitElement(
                        {
                          ...start.element,
                          x:
                            start.element.x +
                            ((event.clientX - start.x) / start.width) *
                              geometry.viewWidth,
                          y:
                            start.element.y +
                            ((event.clientY - start.y) / start.height) *
                              geometry.viewHeight,
                        },
                        geometry,
                      );
                      start.latest = next;
                      setDrag(next);
                    }}
                    onPointerUp={() => {
                      const start = gesture.current;
                      if (
                        start &&
                        (start.latest.x !== start.element.x ||
                          start.latest.y !== start.element.y)
                      )
                        onMove(start.latest);
                      gesture.current = null;
                      setDrag(null);
                    }}
                    onPointerCancel={() => {
                      gesture.current = null;
                      setDrag(null);
                    }}
                    onKeyDown={(event) => {
                      const delta = event.shiftKey ? 10 : 1;
                      const offsets: Record<string, [number, number]> = {
                        ArrowLeft: [-delta, 0],
                        ArrowRight: [delta, 0],
                        ArrowUp: [0, -delta],
                        ArrowDown: [0, delta],
                      };
                      if (offsets[event.key]) {
                        event.preventDefault();
                        const [dx, dy] = offsets[event.key];
                        onMove(
                          fitElement(
                            {
                              ...element,
                              x: element.x + dx,
                              y: element.y + dy,
                            },
                            geometry,
                          ),
                        );
                      }
                    }}
                  >
                    <PdfMark element={element} />
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}
