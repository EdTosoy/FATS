'use client';
import { useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import type { PdfEdits, PdfInfo, PdfPageEdit } from '@/lib/pdf-tools-model';
import type { LocalPdfDocument } from '@/lib/use-pdf-tools-document';
import { PageOutputs } from './page-outputs';
import { MergePdfs } from './merge-pdfs';
import styles from './workspace.module.css';

export function OrganizePages({
  open,
  onOpenChange,
  pages,
  info,
  selected,
  onSelect,
  onMove,
  onRotate,
  onRemove,
  thumbnail,
  busy,
  undo,
  redo,
  onHistory,
  notice,
  returnFocus,
  document,
  edits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: PdfPageEdit[];
  info: PdfInfo;
  selected: number;
  onSelect: (source: number) => void;
  onMove: (source: number, position: number) => void;
  onRotate: (source: number, clockwise: boolean) => void;
  onRemove: (source: number) => void;
  thumbnail: (source: number, position: number) => ReactNode;
  busy: boolean;
  undo: boolean;
  redo: boolean;
  onHistory: (direction: 'undo' | 'redo') => void;
  notice: string;
  returnFocus: () => void;
  document: LocalPdfDocument;
  edits: PdfEdits;
}) {
  const [outputMode, setOutputMode] = useState<
    'extract' | 'split' | 'merge' | null
  >(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const dragged = useRef<number | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const selection = useRef<HTMLButtonElement>(null);
  const position = pages.findIndex((page) => page.source === selected);
  const blocked = info.organization?.blocked;
  const removalBlocked = blocked || info.organization?.removalBlocked;
  const disabled = busy || !!blocked;
  const focusSelected = () =>
    requestAnimationFrame(() => selection.current?.focus());
  const act = (action: () => void) => {
    action();
    focusSelected();
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) setOutputMode(null);
        onOpenChange(value);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.modal} ${styles.organizer} ${outputMode === 'merge' ? styles.mergeOrganizer : ''}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
          onKeyDown={(event) => {
            if (
              !(event.ctrlKey || event.metaKey) ||
              ['INPUT', 'TEXTAREA', 'SELECT'].includes(
                (event.target as HTMLElement).tagName,
              )
            )
              return;
            if (['z', 'y'].includes(event.key.toLowerCase())) {
              event.preventDefault();
              event.stopPropagation();
              if (outputMode) return;
              onHistory(
                event.shiftKey || event.key.toLowerCase() === 'y'
                  ? 'redo'
                  : 'undo',
              );
            }
          }}
        >
          <div className={styles.modalHeader}>
            <Dialog.Title>Organize pages</Dialog.Title>
            <Dialog.Close aria-label="Close organize pages">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description
            className={
              outputMode === 'merge' ? styles.mergeDescription : undefined
            }
          >
            {outputMode === 'merge' ? (
              'Combine local PDFs in a separate plan. Leaving Merge clears that plan and its prepared copy; your editing session stays here.'
            ) : outputMode ? (
              'Create separate PDF copies of the current pages and edits. Your document and undo history stay here.'
            ) : (
              <>
                Select a thumbnail, then move, rotate in 90° steps or remove its
                page. Drag a handle onto another thumbnail to move to that
                position. Every change can be undone.
              </>
            )}
          </Dialog.Description>
          <div
            className={styles.pageToolModes}
            role="group"
            aria-label="Page tools"
          >
            <button
              type="button"
              aria-pressed={!outputMode}
              onClick={() => setOutputMode(null)}
            >
              Organize
            </button>
            <button
              type="button"
              aria-pressed={outputMode === 'extract'}
              onClick={() => setOutputMode('extract')}
            >
              Extract pages
            </button>
            <button
              type="button"
              aria-pressed={outputMode === 'split'}
              onClick={() => setOutputMode('split')}
            >
              Split document
            </button>
            <button
              type="button"
              aria-pressed={outputMode === 'merge'}
              onClick={() => setOutputMode('merge')}
            >
              Merge PDFs
            </button>
          </div>
          {outputMode === 'merge' ? (
            <MergePdfs
              hasEdits={
                !!(
                  edits.elements.length ||
                  Object.keys(edits.fields).length ||
                  edits.pages
                )
              }
            />
          ) : outputMode ? (
            <PageOutputs
              key={outputMode}
              mode={outputMode}
              document={document}
              edits={edits}
              pages={pages}
              thumbnail={thumbnail}
            />
          ) : (
            <>
              {blocked && (
                <p className={styles.signError} role="note">
                  {blocked}
                </p>
              )}
              <div
                className={styles.organizeActions}
                role="group"
                aria-label="Selected page actions"
              >
                <strong>
                  Page {position + 1} of {pages.length}
                </strong>
                <button
                  type="button"
                  disabled={disabled || position <= 0}
                  onClick={() => act(() => onMove(selected, position - 1))}
                >
                  <ArrowUp size={16} /> Move earlier
                </button>
                <button
                  type="button"
                  disabled={disabled || position === pages.length - 1}
                  onClick={() => act(() => onMove(selected, position + 1))}
                >
                  <ArrowDown size={16} /> Move later
                </button>
                <label>
                  Move to position{' '}
                  <select
                    aria-label="Move to position"
                    disabled={disabled || pages.length === 1}
                    value={position}
                    onChange={(event) =>
                      act(() => onMove(selected, Number(event.target.value)))
                    }
                  >
                    {pages.map((_, index) => (
                      <option key={index} value={index}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => act(() => onRotate(selected, false))}
                >
                  <RotateCcw size={16} /> Rotate left
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => act(() => onRotate(selected, true))}
                >
                  <RotateCw size={16} /> Rotate right
                </button>
                <button
                  type="button"
                  disabled={busy || !!removalBlocked || pages.length === 1}
                  onClick={() => setRemoving(selected)}
                >
                  <Trash2 size={16} /> Remove page
                </button>
              </div>
              {removalBlocked && !blocked && (
                <p className={styles.hint}>{removalBlocked}</p>
              )}
              {pages.length === 1 && (
                <p className={styles.hint}>
                  Keep at least one page in the document.
                </p>
              )}
              <div
                className={styles.organizeGrid}
                aria-label="Pages in download order"
              >
                {pages.map(({ source, rotation }, index) => (
                  <div
                    key={source}
                    className={styles.organizeCard}
                    data-selected={source === selected}
                    data-drop={drop === source}
                    onDragOver={(event) => {
                      if (dragged.current === null || disabled) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDrop(source);
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      )
                        setDrop(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = dragged.current;
                      dragged.current = null;
                      setDrop(null);
                      if (from !== null && !disabled) {
                        onSelect(from);
                        act(() => onMove(from, index));
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={styles.thumbnail}
                      ref={source === selected ? selection : undefined}
                      aria-label={`Select page ${index + 1}, original page ${source + 1}${rotation ? ', rotated' : ''}`}
                      aria-pressed={source === selected}
                      onClick={() => onSelect(source)}
                    >
                      {thumbnail(source, index + 1)}
                      <span>
                        <b>{index + 1}</b> Original page {source + 1}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.dragHandle}
                      disabled={disabled || pages.length === 1}
                      aria-label={`Drag page ${index + 1}; use Move earlier or Move later for keyboard and touch`}
                      draggable={!disabled && pages.length > 1}
                      onDragStart={(event) => {
                        dragged.current = source;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', 'page');
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                        setDrop(null);
                      }}
                    >
                      <GripVertical size={16} /> Move
                    </button>
                  </div>
                ))}
              </div>
              <div className={styles.organizeFooter}>
                <p role="status">{notice}</p>
                <button
                  type="button"
                  aria-label="Undo page or content change"
                  disabled={busy || !undo}
                  onClick={() => onHistory('undo')}
                >
                  <Undo2 size={16} /> Undo
                </button>
                <button
                  type="button"
                  aria-label="Redo page or content change"
                  disabled={busy || !redo}
                  onClick={() => onHistory('redo')}
                >
                  <Redo2 size={16} /> Redo
                </button>
                <Dialog.Close>Done</Dialog.Close>
              </div>
            </>
          )}
          <Dialog.Root
            open={removing !== null}
            onOpenChange={(value) => {
              if (!value) setRemoving(null);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className={styles.overlay} />
              <Dialog.Content
                className={styles.modal}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  // Radix invokes this after the confirmation unmounts. The
                  // surviving thumbnail is current; another animation frame
                  // would leave a gap before keyboard shortcuts have a target.
                  selection.current?.focus();
                }}
              >
                <Dialog.Title>
                  Remove page{' '}
                  {pages.findIndex((page) => page.source === removing) + 1}?
                </Dialog.Title>
                <Dialog.Description>
                  This removes the page and its added content from the
                  downloaded copy. Your original file stays unchanged. Undo
                  restores the page and its edits.
                </Dialog.Description>
                <div className={styles.dialogActions}>
                  <Dialog.Close>Keep page</Dialog.Close>
                  <button
                    type="button"
                    disabled={busy || !!removalBlocked || pages.length === 1}
                    onClick={() => {
                      if (removing !== null) onRemove(removing);
                      setRemoving(null);
                    }}
                  >
                    Remove this page
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
