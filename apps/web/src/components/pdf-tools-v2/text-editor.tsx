'use client';
import type { CSSProperties } from 'react';
import type { PdfElement } from '@/lib/pdf-tools-model';
import { measuredPdfText } from '@/lib/pdf-tools-editing';
import styles from './workspace.module.css';
export function TextEditor({
  mark,
  onBegin,
  onChange,
  onCommit,
  onDone,
  style,
  onPage = false,
}: {
  mark: PdfElement;
  onBegin: () => void;
  onChange: (mark: PdfElement) => void;
  onCommit: () => void;
  onDone: () => void;
  style?: CSSProperties;
  onPage?: boolean;
}) {
  const error = measuredPdfText(mark).error;
  return (
    <textarea
      autoFocus
      data-text-editor={mark.id}
      aria-label="Edit added text"
      aria-invalid={!!error}
      className={onPage ? styles.onPageTextEditor : styles.valueTextEditor}
      style={style}
      value={mark.text}
      spellCheck={false}
      onFocus={onBegin}
      onBlur={onCommit}
      onChange={(event) =>
        onChange({ ...mark, text: event.target.value.replace(/\r\n?/g, '\n') })
      }
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' ||
          ((event.ctrlKey || event.metaKey) && event.key === 'Enter')
        ) {
          event.preventDefault();
          event.stopPropagation();
          onDone();
        }
      }}
    />
  );
}
