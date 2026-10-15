'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from 'pdfjs-dist';
import { useAccount } from './account-provider';
import { documentUrl } from './document-provider';
import { Button } from './ui';

// Paint pixels only. No annotation, HTML, scripting, XFA or attachment layers.
export function PdfCanvas({ versionId }: { versionId: string }) {
  const { user } = useAccount();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    const timer = window.setTimeout(() => {
      abort.abort();
      void task?.destroy();
      setError(
        'Preview timed out. Download this PDF to view it on your device.',
      );
    }, 20000);
    void (async () => {
      try {
        const response = await fetch(documentUrl(versionId, true), {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'x-fats-account': user?.id ?? '' },
          signal: abort.signal,
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? 'Preview is unavailable.');
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const renderer = await import('pdfjs-dist');
        if (abort.signal.aborted) return;
        renderer.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        task = renderer.getDocument({
          data: bytes,
          enableXfa: false,
          disableFontFace: true,
          useSystemFonts: true,
          useWasm: false,
          useWorkerFetch: false,
          maxImageSize: 4_000_000,
          canvasMaxAreaInBytes: 16_000_000,
          stopAtErrors: true,
          verbosity: 0,
        });
        const document = await task.promise;
        if (!abort.signal.aborted) {
          window.clearTimeout(timer);
          setPdf(document);
        }
      } catch (error) {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Preview unavailable. Download the PDF to view it on your device.',
          );
      }
    })();
    return () => {
      window.clearTimeout(timer);
      abort.abort();
      void task?.destroy();
    };
  }, [versionId, user?.id]);
  useEffect(() => {
    if (!pdf) return;
    let stopped = false,
      render: RenderTask | undefined;
    const timer = window.setTimeout(() => {
      stopped = true;
      render?.cancel();
      setError(
        'This page could not be previewed in time. Download the PDF instead.',
      );
    }, 20000);
    void (async () => {
      try {
        const pageProxy = await pdf.getPage(page);
        if (stopped || !canvas.current) return;
        const base = pageProxy.getViewport({ scale: 1 });
        const scale = Math.min(
          1.5,
          Math.sqrt(4_000_000 / (base.width * base.height)),
        );
        if (!Number.isFinite(scale) || scale <= 0) throw new Error();
        const viewport = pageProxy.getViewport({ scale });
        const element = canvas.current;
        const context = element.getContext('2d');
        if (!context) throw new Error();
        element.width = Math.ceil(viewport.width);
        element.height = Math.ceil(viewport.height);
        const { AnnotationMode } = await import('pdfjs-dist');
        if (stopped) return;
        render = pageProxy.render({
          canvas: element,
          canvasContext: context,
          viewport,
          annotationMode: AnnotationMode.DISABLE,
        });
        await render.promise;
        if (!stopped) {
          window.clearTimeout(timer);
          setReady(true);
        }
      } catch {
        if (!stopped)
          setError(
            'This page cannot be previewed. Download the PDF to view it on your device.',
          );
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      render?.cancel();
    };
  }, [pdf, page]);
  return (
    <div className="pdf-canvas-view">
      {error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : (
        <>
          {!ready && <p role="status">Rendering PDF preview…</p>}
          <div className="pdf-page">
            <canvas
              ref={canvas}
              role="img"
              aria-label={`PDF page ${page}`}
              data-rendered={ready ? 'true' : 'false'}
            />
          </div>
          {pdf && (
            <div className="document-actions">
              <Button
                variant="secondary"
                disabled={page === 1 || !ready}
                onClick={() => {
                  setReady(false);
                  setPage(page - 1);
                }}
              >
                Previous page
              </Button>
              <span>
                Page {page} of {pdf.numPages}
              </span>
              <Button
                variant="secondary"
                disabled={page === pdf.numPages || !ready}
                onClick={() => {
                  setReady(false);
                  setPage(page + 1);
                }}
              >
                Next page
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
