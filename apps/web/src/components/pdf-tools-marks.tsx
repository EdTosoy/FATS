'use client';
import { useEffect, useRef } from 'react';
import type { PdfElement, Point } from '@/lib/pdf-tools-model';

// The same canvas painter supplies the on-page preview and exported transparent
// PNG. Browser system glyphs are embedded as pixels, including typed signatures.
export function paintPdfMark(canvas: HTMLCanvasElement, element: PdfElement) {
  const ratio = Math.min(3, 1200 / element.width, 600 / element.height);
  canvas.width = Math.ceil(element.width * ratio);
  canvas.height = Math.ceil(element.height * ratio);
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Your browser cannot draw PDF marks. Try another browser.');
  context.scale(canvas.width / element.width, canvas.height / element.height);
  context.fillStyle = '#172c45';
  context.strokeStyle = '#172c45';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (element.kind === 'check') {
    context.lineWidth = Math.max(
      1,
      Math.min(element.width, element.height) * 0.1,
    );
    context.beginPath();
    context.moveTo(element.width * 0.18, element.height * 0.5);
    context.lineTo(element.width * 0.42, element.height * 0.76);
    context.lineTo(element.width * 0.84, element.height * 0.2);
    context.stroke();
  } else if (element.strokes) {
    context.lineWidth = Math.max(1, element.height * 0.025);
    for (const stroke of element.strokes) {
      context.beginPath();
      stroke.forEach((point, index) => {
        const x = point.x * element.width,
          y = point.y * element.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  } else {
    let size = Math.min(
      element.height * 0.72,
      element.kind === 'signature' ? 64 : 48,
    );
    const font = () =>
      element.kind === 'signature'
        ? `italic ${size}px "Times New Roman", serif`
        : `${size}px Arial, sans-serif`;
    context.font = font();
    const measured = context.measureText(element.text).width;
    if (measured > element.width - 6) {
      size *= (element.width - 6) / measured;
      context.font = font();
    }
    context.textBaseline = 'middle';
    context.fillText(element.text, 3, element.height / 2, element.width - 6);
  }
}
export function PdfMark({ element }: { element: PdfElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintPdfMark(ref.current, element);
  }, [element]);
  return <canvas ref={ref} aria-hidden="true" className="pdf-mark-canvas" />;
}
export async function pdfMarkPng(element: PdfElement): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  paintPdfMark(canvas, element);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(
              new Error('Could not prepare this mark. Retry the download.'),
            ),
      'image/png',
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
export function SignaturePad({
  strokes,
  onChange,
}: {
  strokes: Point[][];
  onChange: (value: Point[][]) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    active = useRef<Point[] | null>(null);
  const draw = (value: Point[][]) => {
    if (canvas.current)
      paintPdfMark(canvas.current, {
        id: 'draft',
        page: 0,
        kind: 'signature',
        x: 0,
        y: 0,
        width: 320,
        height: 120,
        text: '',
        strokes: value,
      });
  };
  useEffect(() => {
    draw(strokes);
  }, [strokes]);
  return (
    <canvas
      ref={canvas}
      className="pdf-signature-pad"
      aria-label="Draw your signature with a pointer. You can also choose Type a signature."
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        active.current = [
          {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
          },
        ];
      }}
      onPointerMove={(event) => {
        if (!active.current || active.current.length >= 1000) return;
        const rect = event.currentTarget.getBoundingClientRect();
        active.current.push({
          x: Math.max(
            0.01,
            Math.min(0.99, (event.clientX - rect.left) / rect.width),
          ),
          y: Math.max(
            0.01,
            Math.min(0.99, (event.clientY - rect.top) / rect.height),
          ),
        });
        draw([...strokes, active.current]);
      }}
      onPointerUp={() => {
        if (active.current && active.current.length > 1)
          onChange([...strokes, active.current].slice(-30));
        active.current = null;
      }}
      onPointerCancel={() => {
        active.current = null;
        draw(strokes);
      }}
    />
  );
}
