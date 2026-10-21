'use client';

import { useEffect, useRef, useState } from 'react';
import type { PageViewport, RenderTask } from 'pdfjs-dist';
import type { LocalPdfDocument } from '@/lib/use-pdf-tools-document';
import { checkedPdfPage } from '@/lib/pdf-tools-renderer';
import { PDF_TOOLS_LIMITS } from '@/lib/pdf-tools-model';
import { clientToPdf, pdfRasterScale } from '@/lib/pdf-tools-viewport';
import styles from './workspace.module.css';
import { SignatureLayer, type SignatureInteractions } from './signature-layer';
import { FormLayer, type FormInteractions } from './form-layer';
import type { Point, PdfPageInfo, PdfElement } from '@/lib/pdf-tools-model';
import { PdfMark } from '../pdf-tools-marks';

export function PageCanvas({
  document,
  index,
  scale,
  thumbnail = false,
  interactions,
  forms,
  onPlace,
  dpr = 1,
  geometry,
  position,
  marks,
}: {
  document: LocalPdfDocument;
  index: number;
  scale: number;
  thumbnail?: boolean;
  interactions?: SignatureInteractions;
  forms?: FormInteractions;
  onPlace?: (point: Point) => void;
  dpr?: number;
  geometry?: PdfPageInfo;
  position?: number;
  marks?: PdfElement[];
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <RenderedCanvas
      key={attempt}
      document={document}
      index={index}
      scale={scale}
      thumbnail={thumbnail}
      interactions={interactions}
      forms={forms}
      onPlace={onPlace}
      dpr={dpr}
      geometry={geometry ?? document.info.pages[index]}
      position={position ?? index + 1}
      marks={marks}
      retry={() => setAttempt((value) => value + 1)}
    />
  );
}

function RenderedCanvas({
  document,
  index,
  scale,
  thumbnail,
  retry,
  interactions,
  forms,
  onPlace,
  dpr,
  geometry,
  position,
  marks,
}: {
  document: LocalPdfDocument;
  index: number;
  scale: number;
  thumbnail: boolean;
  retry: () => void;
  interactions?: SignatureInteractions;
  forms?: FormInteractions;
  onPlace?: (point: Point) => void;
  dpr: number;
  geometry: PdfPageInfo;
  position: number;
  marks?: PdfElement[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<PageViewport | null>(null);
  const [status, setStatus] = useState('loading');
  const [readyViewport, setReadyViewport] = useState<PageViewport | null>(null);
  const [rasterKey, setRasterKey] = useState('');
  const rendered =
    status === 'ready' &&
    rasterKey ===
      `${document.id}:${index}:${geometry.rotation}:${scale}:${dpr}`;
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    let stopped = false;
    let render: RenderTask | undefined;
    const target = canvas.current;
    const fail = () => {
      if (stopped) return;
      stopped = true;
      render?.cancel();
      if (target) {
        target.width = 0;
        target.height = 0;
      }
      setStatus('error');
    };
    const timer = setTimeout(fail, PDF_TOOLS_LIMITS.timeout);
    void (async () => {
      try {
        const proxy = await checkedPdfPage(
          document.pdf,
          index,
          geometry,
          geometry.rotation,
        );
        if (stopped || !target) return;
        viewport.current = proxy.getViewport({
          scale: 1,
          rotation: geometry.rotation,
        });
        const raster = proxy.getViewport({
          rotation: geometry.rotation,
          scale: pdfRasterScale(
            geometry.viewWidth,
            geometry.viewHeight,
            scale,
            thumbnail ? 1 : window.devicePixelRatio,
          ),
        });
        const context = target.getContext('2d');
        if (!context) throw new Error();
        target.width = Math.ceil(raster.width);
        target.height = Math.ceil(raster.height);
        render = proxy.render({
          canvas: target,
          canvasContext: context,
          viewport: raster,
          annotationMode: 1,
        });
        await render.promise;
        if (stopped) return;
        clearTimeout(timer);
        setReadyViewport(viewport.current);
        setRasterKey(
          `${document.id}:${index}:${geometry.rotation}:${scale}:${dpr}`,
        );
        setStatus('ready');
      } catch {
        clearTimeout(timer);
        fail();
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      render?.cancel();
      viewport.current = null;
      if (target) {
        target.width = 0;
        target.height = 0;
      }
    };
  }, [document, index, geometry, scale, thumbnail, dpr]);
  return (
    <div className={styles.canvasWrap} data-page-status={status}>
      <canvas
        ref={canvas}
        role={thumbnail ? undefined : 'img'}
        aria-hidden={thumbnail ? true : undefined}
        aria-label={thumbnail ? undefined : `PDF page ${position}`}
        data-rendered={rendered}
        aria-busy={!rendered && status !== 'error'}
        data-testid={thumbnail ? 'pdf-v2-thumbnail' : 'pdf-v2-canvas'}
        onPointerDown={(event) => {
          // Coordinate contract lives at the canvas boundary; selection only in
          // Phase 1. Future placement receives the real PDF point from here.
          if (!viewport.current || !canvas.current || thumbnail || !rendered)
            return;
          const point = clientToPdf(
            viewport.current,
            canvas.current.getBoundingClientRect(),
            {
              x: event.clientX,
              y: event.clientY,
            },
          );
          if (event.isPrimary && event.button === 0) {
            pointer.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
            if (onPlace) event.currentTarget.setPointerCapture(event.pointerId);
          }
          canvas.current.dispatchEvent(
            new CustomEvent('pdf-tools-point', {
              bubbles: true,
              detail: { page: index, point },
            }),
          );
        }}
        onPointerMove={(event) => {
          const start = pointer.current;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
          )
            pointer.current = null;
        }}
        onPointerUp={(event) => {
          const start = pointer.current;
          pointer.current = null;
          if (
            !start ||
            start.id !== event.pointerId ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 ||
            !viewport.current
          )
            return;
          const pdf = clientToPdf(
            viewport.current,
            event.currentTarget.getBoundingClientRect(),
            { x: event.clientX, y: event.clientY },
          );
          const [x, y] = viewport.current.convertToViewportPoint(pdf.x, pdf.y);
          if (onPlace) onPlace({ x, y });
          else interactions?.onBlank?.();
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
      />
      {rendered && readyViewport && forms && (
        <FormLayer
          viewport={readyViewport}
          index={index}
          scale={scale}
          interactions={forms}
        />
      )}
      {rendered && readyViewport && interactions && (
        <SignatureLayer
          viewport={readyViewport}
          geometry={geometry}
          scale={scale}
          interactions={interactions}
        />
      )}
      {thumbnail &&
        rendered &&
        marks?.map((mark) => (
          <span
            key={mark.id}
            className={styles.thumbnailMark}
            style={{
              left: `${(mark.x / geometry.viewWidth) * 100}%`,
              top: `${(mark.y / geometry.viewHeight) * 100}%`,
              width: `${(mark.width / geometry.viewWidth) * 100}%`,
              height: `${(mark.height / geometry.viewHeight) * 100}%`,
            }}
          >
            <PdfMark element={mark} />
          </span>
        ))}
      {!rendered && status !== 'error' && (
        <span
          className={styles.pageMessage}
          aria-hidden={thumbnail ? true : undefined}
          role={thumbnail ? undefined : 'status'}
        >
          {thumbnail ? '…' : `Rendering page ${position}…`}
        </span>
      )}
      {status === 'error' && (
        <div className={styles.pageMessage}>
          {thumbnail ? (
            <span aria-hidden="true">Preview unavailable</span>
          ) : (
            <>
              <p role="alert">
                Page {position} could not be rendered within the browser limits.
              </p>
              <button type="button" onClick={retry}>
                Retry page {position}
              </button>
              <p>If retry fails, choose the PDF again or use a simpler copy.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
