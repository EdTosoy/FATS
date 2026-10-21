'use client';
import { useEffect, useRef } from 'react';
import {
  PDF_TOOLS_LIMITS,
  type PdfElement,
  type Point,
} from '@/lib/pdf-tools-model';
import { signatureFont, signatureNameError } from '@/lib/pdf-tools-signature';
import { measuredPdfText, textFont } from '@/lib/pdf-tools-editing';
import { nativeMark } from '@/lib/pdf-tools-organization';

// The same canvas painter supplies the on-page preview and exported transparent
// PNG. Browser system glyphs are embedded as pixels, including typed signatures.
export function paintPdfMark(canvas: HTMLCanvasElement, element: PdfElement) {
  const rotation = element.contentRotation ?? 0;
  const ratio = Math.min(3, 1200 / element.width, 600 / element.height);
  canvas.width = Math.ceil(element.width * ratio);
  canvas.height = Math.ceil(element.height * ratio);
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Your browser cannot draw PDF marks. Try another browser.');
  context.scale(canvas.width / element.width, canvas.height / element.height);
  if (rotation === 90) context.translate(element.width, 0);
  else if (rotation === 180) context.translate(element.width, element.height);
  else if (rotation === 270) context.translate(0, element.height);
  context.rotate((rotation * Math.PI) / 180);
  element = nativeMark(element);
  context.fillStyle = element.ink ?? '#172c45';
  context.strokeStyle = element.ink ?? '#172c45';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (element.kind === 'check') {
    context.lineWidth = Math.max(
      1,
      Math.min(element.width, element.height) * 0.1,
    );
    context.beginPath();
    if (element.checkStyle === 'cross') {
      context.moveTo(element.width * 0.2, element.height * 0.2);
      context.lineTo(element.width * 0.8, element.height * 0.8);
      context.moveTo(element.width * 0.8, element.height * 0.2);
      context.lineTo(element.width * 0.2, element.height * 0.8);
    } else {
      context.moveTo(element.width * 0.18, element.height * 0.5);
      context.lineTo(element.width * 0.42, element.height * 0.76);
      context.lineTo(element.width * 0.84, element.height * 0.2);
    }
    context.stroke();
  } else if (
    (element.kind === 'text' || element.kind === 'date') &&
    element.fontSize
  ) {
    const layout = measuredPdfText(element);
    if (layout.error) throw new Error(layout.error);
    context.font = textFont(element);
    context.textBaseline = 'alphabetic';
    layout.lines.forEach((line, index) =>
      context.fillText(
        line,
        layout.padding,
        layout.padding + layout.size + index * layout.lineHeight,
      ),
    );
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
  } else if (element.signatureStyle && element.signatureFontSize) {
    const error = signatureNameError(element.text);
    if (error) throw new Error(error);
    context.font = signatureFont(
      element.signatureFontSize,
      element.signatureStyle,
    );
    const metrics = context.measureText(element.text);
    const inkWidth =
      metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const inkHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    if (inkWidth > element.width - 4 || inkHeight > element.height - 4)
      throw new Error(
        'This signature needs more room. Enlarge it before downloading.',
      );
    context.textBaseline = 'alphabetic';
    context.fillText(
      element.text,
      (element.width - inkWidth) / 2 + metrics.actualBoundingBoxLeft,
      (element.height - inkHeight) / 2 + metrics.actualBoundingBoxAscent,
    );
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
    if (ref.current) {
      try {
        paintPdfMark(ref.current, element);
        delete ref.current.dataset.error;
      } catch (error) {
        // The editable source stays in PdfEdits. An invalid draft has no
        // misleading painted appearance and cannot be exported.
        ref.current.width = ref.current.height = 0;
        ref.current.dataset.error = (error as Error).message;
      }
    }
  }, [element]);
  return <canvas ref={ref} aria-hidden="true" className="pdf-mark-canvas" />;
}
export async function pdfMarkPng(element: PdfElement): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  paintPdfMark(canvas, element);
  const blob = await new Promise<Blob>((resolve, reject) => {
    const timer = setTimeout(() => {
      canvas.width = canvas.height = 0;
      reject(
        new Error(
          'Could not prepare this mark in time. Your edits are kept. Retry the download.',
        ),
      );
    }, PDF_TOOLS_LIMITS.timeout);
    canvas.toBlob((value) => {
      clearTimeout(timer);
      return value
        ? resolve(value)
        : reject(new Error('Could not prepare this mark. Retry the download.'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}
export function SignaturePad({
  strokes,
  onChange,
  onLimit,
}: {
  strokes: Point[][];
  onChange: (value: Point[][]) => void;
  onLimit?: () => void;
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
        if (!event.isPrimary || event.button !== 0 || active.current) return;
        if (onLimit && strokes.length >= 30) {
          onLimit();
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        active.current = [
          {
            x: Math.max(
              0.02,
              Math.min(0.98, (event.clientX - rect.left) / rect.width),
            ),
            y: Math.max(
              0.02,
              Math.min(0.98, (event.clientY - rect.top) / rect.height),
            ),
          },
        ];
      }}
      onPointerMove={(event) => {
        if (!active.current) return;
        if (active.current.length >= 1000) {
          onLimit?.();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        active.current.push({
          x: Math.max(
            0.02,
            Math.min(0.98, (event.clientX - rect.left) / rect.width),
          ),
          y: Math.max(
            0.02,
            Math.min(0.98, (event.clientY - rect.top) / rect.height),
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
