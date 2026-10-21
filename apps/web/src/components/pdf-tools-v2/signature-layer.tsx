'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { PageViewport } from 'pdfjs-dist';
import type { PdfElement, PdfPageInfo, Point } from '@/lib/pdf-tools-model';
import { clientToPdf } from '@/lib/pdf-tools-viewport';
import {
  movePdfMark as moveSignature,
  resizePdfMark as resizeSignature,
  markName,
} from '@/lib/pdf-tools-editing';
import { TextEditor } from './text-editor';
import { PdfMark } from '../pdf-tools-marks';
import styles from './workspace.module.css';

export type SignatureInteractions = {
  marks: PdfElement[];
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onChange: (mark: PdfElement) => void;
  onDelete: (id: string) => void;
  announce: (message: string) => void;
  editingText?: string | null;
  editOnPage?: boolean;
  onBeginEdit?: () => void;
  onDraft?: (mark: PdfElement) => void;
  onCommit?: () => void;
  onDone?: () => void;
  onBlank?: () => void;
};
export function SignatureLayer({
  viewport,
  geometry,
  scale,
  interactions,
}: {
  viewport: PageViewport;
  geometry: PdfPageInfo;
  scale: number;
  interactions: SignatureInteractions;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    mark: PdfElement;
    start: Point;
    latest: PdfElement;
    resize: boolean;
    pointer: number;
    error?: string;
  } | null>(null);
  const [draft, setDraft] = useState<PdfElement | null>(null);
  useEffect(() => {
    const current = gesture.current;
    if (
      !current ||
      (interactions.selected === current.mark.id &&
        interactions.marks.some((mark) => mark === current.mark))
    )
      return;
    gesture.current = null;
    const frame = requestAnimationFrame(() => setDraft(null));
    return () => cancelAnimationFrame(frame);
  }, [interactions.marks, interactions.selected]);
  const viewPoint = (event: PointerEvent) => {
    const pdf = clientToPdf(viewport, layer.current!.getBoundingClientRect(), {
      x: event.clientX,
      y: event.clientY,
    });
    const [x, y] = viewport.convertToViewportPoint(pdf.x, pdf.y);
    return { x, y };
  };
  const start = (
    event: PointerEvent<HTMLButtonElement>,
    mark: PdfElement,
    resize: boolean,
  ) => {
    event.stopPropagation();
    if (
      interactions.disabled ||
      !event.isPrimary ||
      event.button !== 0 ||
      gesture.current
    )
      return;
    event.preventDefault();
    interactions.onSelect(mark.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      mark,
      start: viewPoint(event),
      latest: mark,
      resize,
      pointer: event.pointerId,
    };
  };
  const cancel = () => {
    gesture.current = null;
    setDraft(null);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const point = viewPoint(event),
      dx = point.x - current.start.x,
      dy = point.y - current.start.y;
    try {
      current.latest = current.resize
        ? resizeSignature(
            current.mark,
            current.mark.width +
              (current.mark.kind === 'signature' ||
              current.mark.kind === 'initials'
                ? (dx + (dy * current.mark.width) / current.mark.height) / 2
                : dx),
            geometry,
            current.mark.kind === 'text' || current.mark.kind === 'date'
              ? Math.max(18, current.mark.height + dy)
              : undefined,
          )
        : moveSignature(
            current.mark,
            current.mark.x + dx,
            current.mark.y + dy,
            geometry,
          );
      setDraft(current.latest);
      delete current.error;
    } catch {
      current.error =
        'Kept the last readable size. Use Larger or move the signature inward to make more room.';
    }
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (JSON.stringify(current.latest) !== JSON.stringify(current.mark)) {
      interactions.onChange(current.latest);
      interactions.announce(
        current.resize
          ? `${markName(current.mark)} resized. Undo restores its previous size.`
          : `${markName(current.mark)} moved. Undo restores its previous position.`,
      );
    }
    if (current.error) interactions.announce(current.error);
    cancel();
  };
  return (
    <div ref={layer} className={styles.signatureLayer}>
      {interactions.marks.map((saved) => {
        const mark = draft?.id === saved.id ? draft : saved;
        const selected = interactions.selected === mark.id;
        const width = mark.width * scale,
          height = mark.height * scale;
        const handleX = Math.max(width + 22, width / 2 + 44),
          handleY = Math.max(height + 22, height / 2 + 44);
        return (
          <div
            key={mark.id}
            className={`${styles.markBox} ${selected ? styles.selectedMark : ''}`}
            data-testid="signature-mark"
            data-mark={JSON.stringify(saved)}
            style={{ left: mark.x * scale, top: mark.y * scale, width, height }}
          >
            <PdfMark element={mark} />
            <button
              type="button"
              data-mark-id={mark.id}
              className={styles.moveTarget}
              aria-label={`${markName(mark)}: ${mark.text || (mark.strokes ? 'Drawn mark' : mark.kind === 'text' ? 'Empty text' : markName(mark))}`}
              aria-pressed={selected}
              disabled={interactions.disabled}
              style={{
                width: Math.max(44, width),
                height: Math.max(44, height),
              }}
              onClick={() => interactions.onInspect(mark.id)}
              onPointerDown={(event) => start(event, mark, false)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={cancel}
              onLostPointerCapture={cancel}
              onKeyDown={(event) => {
                const offsets: Record<string, [number, number]> = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                };
                const offset = offsets[event.key];
                if (offset) {
                  event.preventDefault();
                  event.stopPropagation();
                  const factor = event.shiftKey ? 10 : 1;
                  interactions.onChange(
                    moveSignature(
                      mark,
                      mark.x + offset[0] * factor,
                      mark.y + offset[1] * factor,
                      geometry,
                    ),
                  );
                } else if (
                  event.key === 'Delete' ||
                  event.key === 'Backspace'
                ) {
                  event.preventDefault();
                  interactions.onDelete(mark.id);
                }
              }}
            />
            {interactions.editingText === mark.id &&
              interactions.editOnPage &&
              !mark.contentRotation &&
              mark.kind === 'text' && (
                <TextEditor
                  mark={mark}
                  onBegin={interactions.onBeginEdit!}
                  onChange={interactions.onDraft!}
                  onCommit={interactions.onCommit!}
                  onDone={interactions.onDone!}
                  onPage
                  style={{
                    width: Math.max(width, 100),
                    height: Math.max(height, 44),
                    fontFamily: 'Arial, sans-serif',
                    fontSize: (mark.fontSize ?? 16) * scale,
                    fontWeight: mark.fontWeight ?? 400,
                    color: mark.ink,
                    padding: 4 * scale,
                    lineHeight: 1.35,
                  }}
                />
              )}
            {selected && !interactions.disabled && (
              <>
                <svg
                  className={styles.resizeConnector}
                  width={handleX}
                  height={handleY}
                  aria-hidden="true"
                >
                  <line x1={width} y1={height} x2={handleX} y2={handleY} />
                </svg>
                <button
                  type="button"
                  className={styles.resizeTarget}
                  aria-label={
                    mark.kind === 'signature'
                      ? 'Resize signature proportionally'
                      : `Resize ${markName(mark).toLowerCase()}`
                  }
                  style={{ left: handleX - 22, top: handleY - 22 }}
                  onPointerDown={(event) => start(event, mark, true)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={cancel}
                  onLostPointerCapture={cancel}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                      interactions.onChange(
                        resizeSignature(
                          mark,
                          mark.width + (event.key === 'ArrowRight' ? 5 : -5),
                          geometry,
                        ),
                      );
                    } catch (error) {
                      interactions.announce((error as Error).message);
                    }
                  }}
                >
                  ↘
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
