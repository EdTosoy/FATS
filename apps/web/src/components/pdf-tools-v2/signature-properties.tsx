'use client';
import type { PdfElement, PdfPageInfo } from '@/lib/pdf-tools-model';
import {
  movePdfMark as moveSignature,
  resizePdfMark as resizeSignature,
  markName,
  dateText,
  fitTextContent,
  measuredPdfText,
} from '@/lib/pdf-tools-editing';
import { TextEditor } from './text-editor';
import { X, Trash2 } from 'lucide-react';
import styles from './workspace.module.css';

export function SignatureProperties({
  mark,
  page,
  expanded,
  busy,
  onExpand,
  onChange,
  onDelete,
  announce,
  editing = false,
  contextualText = false,
  onEdit,
  onBegin,
  onDraft,
  onCommit,
  onDone,
}: {
  mark: PdfElement;
  page: PdfPageInfo;
  expanded: boolean;
  busy: boolean;
  onExpand: (value: boolean) => void;
  onChange: (mark: PdfElement) => void;
  onDelete: () => void;
  announce: (message: string) => void;
  editing?: boolean;
  contextualText?: boolean;
  onEdit?: () => void;
  onBegin?: () => void;
  onDraft?: (mark: PdfElement) => void;
  onCommit?: () => void;
  onDone?: () => void;
}) {
  const name = markName(mark),
    proportional = mark.kind === 'signature' || mark.kind === 'initials';
  const textLike =
    !!mark.fontSize && (mark.kind === 'text' || mark.kind === 'date');
  const textError = textLike ? measuredPdfText(mark).error : '';
  const format = (changes: Partial<PdfElement>) =>
    onChange(fitTextContent({ ...mark, ...changes }, page));
  const resize = (width: number) => {
    try {
      onChange(resizeSignature(mark, width, page));
    } catch (error) {
      announce((error as Error).message);
    }
  };
  return (
    <aside
      className={`${styles.inspector} ${expanded ? styles.inspectorExpanded : ''}`}
      aria-label={`Selected ${name.toLowerCase()} properties`}
    >
      <div className={styles.selectionSummary}>
        <div>
          <strong>{name}</strong>
          <p>{mark.text || (mark.strokes ? 'Drawn mark' : name)}</p>
        </div>
        <button type="button" onClick={() => onExpand(!expanded)}>
          {expanded ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className={styles.propertyBody}>
        <div className={styles.modalHeader}>
          <h2>Selected {name.toLowerCase()}</h2>
          <button
            type="button"
            aria-label={`Close ${name.toLowerCase()} properties`}
            onClick={() => onExpand(false)}
          >
            <X size={17} />
          </button>
        </div>
        {mark.kind !== 'text' && (
          <p className={styles.signatureName}>{mark.text || name}</p>
        )}
        <p className={styles.hint}>
          {proportional
            ? 'Drag to move. Use the corner or controls to resize in proportion.'
            : 'Drag to move. Resize the box or use the controls below.'}
        </p>
        <fieldset disabled={busy}>
          {mark.kind === 'text' && (
            <>
              {editing && contextualText ? (
                <label className={styles.inputLabel}>
                  Text
                  <TextEditor
                    mark={mark}
                    onBegin={onBegin!}
                    onChange={onDraft!}
                    onCommit={onCommit!}
                    onDone={onDone!}
                  />
                </label>
              ) : (
                <button type="button" onClick={editing ? onDone : onEdit}>
                  {editing ? 'Done editing text' : 'Edit text'}
                </button>
              )}
              <p className={styles.hint}>
                Line breaks and wrapping are supported. Additions stay editable
                in this tab; original printed text cannot be changed.
              </p>
            </>
          )}
          {mark.kind === 'date' && (
            <>
              <label className={styles.inputLabel}>
                Date
                <input
                  type="date"
                  value={mark.dateValue ?? ''}
                  onChange={(event) =>
                    format({
                      dateValue: event.target.value,
                      text: dateText(
                        event.target.value,
                        mark.dateFormat ?? 'long',
                      ),
                    })
                  }
                />
              </label>
              <label className={styles.inputLabel}>
                Date format
                <select
                  value={mark.dateFormat ?? 'long'}
                  onChange={(event) => {
                    const value = event.target.value as 'long' | 'iso';
                    format({
                      dateFormat: value,
                      text: dateText(mark.dateValue ?? '', value),
                    });
                  }}
                >
                  <option value="long">Day Month Year</option>
                  <option value="iso">Year-Month-Day</option>
                </select>
              </label>
            </>
          )}
          {mark.kind === 'check' && (
            <label className={styles.inputLabel}>
              Mark style
              <select
                value={mark.checkStyle ?? 'check'}
                onChange={(event) =>
                  onChange({
                    ...mark,
                    checkStyle: event.target.value as 'check' | 'cross',
                  })
                }
              >
                <option value="check">Checkmark ✓</option>
                <option value="cross">Cross ×</option>
              </select>
            </label>
          )}
          {textLike && (
            <>
              <label className={styles.inputLabel}>
                Font size
                <select
                  value={mark.fontSize}
                  onChange={(event) =>
                    format({ fontSize: Number(event.target.value) })
                  }
                >
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) => (
                    <option key={size} value={size}>
                      {size} pt
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inputLabel}>
                Font weight
                <select
                  value={mark.fontWeight ?? 400}
                  onChange={(event) =>
                    format({
                      fontWeight: Number(event.target.value) as 400 | 700,
                    })
                  }
                >
                  <option value="400">Regular</option>
                  <option value="700">Bold</option>
                </select>
              </label>
            </>
          )}
          {mark.kind !== 'signature' && mark.kind !== 'initials' && (
            <label className={styles.inputLabel}>
              Ink color
              <select
                value={mark.ink ?? '#172c45'}
                onChange={(event) =>
                  onChange({
                    ...mark,
                    ink: event.target.value as PdfElement['ink'],
                  })
                }
              >
                <option value="#172c45">Navy</option>
                <option value="#111111">Black</option>
                <option value="#244e80">Blue</option>
              </select>
            </label>
          )}
          {textError && (
            <p className={styles.hint} role="status">
              {textError}
            </p>
          )}
          <legend>Size</legend>
          <div className={styles.propertyRow}>
            <button type="button" onClick={() => resize(mark.width * 0.9)}>
              Smaller
            </button>
            <button type="button" onClick={() => resize(mark.width * 1.1)}>
              Larger
            </button>
          </div>
          <div
            className={styles.moveButtons}
            role="group"
            aria-label={`Move ${name.toLowerCase()}`}
          >
            {(
              [
                ['Left', -5, 0],
                ['Up', 0, -5],
                ['Down', 0, 5],
                ['Right', 5, 0],
              ] as const
            ).map(([name, dx, dy]) => (
              <button
                key={name}
                type="button"
                aria-label={`Move ${markName(mark).toLowerCase()} ${name.toLowerCase()} 5 points`}
                onClick={() =>
                  onChange(moveSignature(mark, mark.x + dx, mark.y + dy, page))
                }
              >
                {name}
              </button>
            ))}
          </div>
          <details>
            <summary>Advanced</summary>
            <p className={styles.hint}>
              {proportional
                ? 'Page points. Width and height stay in proportion.'
                : 'Page points. Changing the box does not change the font size.'}
            </p>
            {(['x', 'y', 'width', 'height'] as const).map((key) => (
              <label className={styles.inputLabel} key={key}>
                {{ x: 'Left', y: 'Top', width: 'Width', height: 'Height' }[key]}
                <input
                  key={`${mark.id}:${mark[key]}`}
                  type="number"
                  step="1"
                  defaultValue={Math.round(mark[key] * 100) / 100}
                  onFocus={(event) =>
                    event.currentTarget.scrollIntoView({ block: 'nearest' })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (!event.currentTarget.value || !Number.isFinite(value)) {
                      event.currentTarget.value = String(mark[key]);
                      return;
                    }
                    if (value === mark[key]) return;
                    if (key === 'width' || key === 'height') {
                      if (!proportional) {
                        try {
                          onChange(
                            resizeSignature(
                              mark,
                              key === 'width' ? value : mark.width,
                              page,
                              key === 'height' ? value : mark.height,
                            ),
                          );
                        } catch (error) {
                          announce((error as Error).message);
                        }
                      } else
                        resize(
                          key === 'width'
                            ? value
                            : (value * mark.width) / mark.height,
                        );
                    } else
                      onChange(
                        moveSignature(
                          mark,
                          key === 'x' ? value : mark.x,
                          key === 'y' ? value : mark.y,
                          page,
                        ),
                      );
                    event.currentTarget.value = String(
                      Math.round(mark[key] * 100) / 100,
                    );
                  }}
                />
              </label>
            ))}
          </details>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={onDelete}
          >
            <Trash2 size={16} /> Delete {name.toLowerCase()}
          </button>
        </fieldset>
      </div>
    </aside>
  );
}
