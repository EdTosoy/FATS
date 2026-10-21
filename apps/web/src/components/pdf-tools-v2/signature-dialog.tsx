'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { PdfElement, PdfPageInfo, Point } from '@/lib/pdf-tools-model';
import { typedSignature } from '@/lib/pdf-tools-signature';
import { PdfMark, SignaturePad } from '../pdf-tools-marks';
import styles from './workspace.module.css';

export function SignatureDialog({
  page,
  onConfirm,
  onCancel,
  kind = 'signature',
}: {
  page: PdfPageInfo;
  onConfirm: (mark: PdfElement) => void;
  onCancel: () => void;
  kind?: 'signature' | 'initials';
}) {
  const [mode, setMode] = useState('type');
  const [name, setName] = useState('');
  const [style, setStyle] = useState<'classic' | 'simple'>('classic');
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [limit, setLimit] = useState('');
  let draft: PdfElement | null = null,
    error = '';
  try {
    if (mode === 'type') {
      if (kind === 'initials' && name.length > 10)
        throw new Error(
          'Use at most 10 characters for initials. Your input has been kept.',
        );
      draft = {
        ...typedSignature(name, style, page, kind === 'initials' ? 72 : 190),
        kind,
      };
    } else if (strokes.length) {
      const factor = Math.min(
        1,
        (page.viewWidth - 12) / 240,
        (page.viewHeight - 12) / 90,
      );
      draft = {
        id: '',
        kind,
        page: 0,
        x: 0,
        y: 0,
        width: 240 * factor,
        height: 90 * factor,
        text: '',
        strokes,
      };
    }
  } catch (problem) {
    error = (problem as Error).message;
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.modal} ${styles.signatureModal}`}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className={styles.modalHeader}>
            <Dialog.Title>Create your {kind}</Dialog.Title>
            <Dialog.Close aria-label={`Cancel ${kind}`}>
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            A personal visual mark, not a certified digital signature. Nothing
            is uploaded or kept for reuse.
          </Dialog.Description>
          <div
            className={styles.signatureModes}
            role="group"
            aria-label="Signature method"
          >
            <button
              type="button"
              aria-pressed={mode === 'type'}
              onClick={() => setMode('type')}
            >
              Type
            </button>
            <button
              type="button"
              aria-pressed={mode === 'draw'}
              onClick={() => setMode('draw')}
            >
              Draw
            </button>
          </div>
          {mode === 'type' ? (
            <>
              <label className={styles.inputLabel}>
                {kind === 'signature' ? 'Name for signature' : 'Initials'}
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-describedby="signature-guidance"
                />
              </label>
              <label className={styles.inputLabel}>
                Signature style
                <select
                  aria-label="Signature style"
                  value={style}
                  onChange={(event) =>
                    setStyle(event.target.value as 'classic' | 'simple')
                  }
                >
                  <option value="classic">Classic · Italic</option>
                  <option value="simple">Simple · Upright</option>
                </select>
              </label>
              <p id="signature-guidance" className={styles.hint}>
                {error ||
                  'Preview and export use the same transparent signature artwork. Wide previews scroll horizontally; check the full name before placing.'}
              </p>
              <div
                className={styles.signaturePreview}
                aria-label="Signature preview"
              >
                {draft && (
                  <div
                    style={{
                      width: draft.width,
                      height: draft.height,
                      position: 'relative',
                      flex: 'none',
                    }}
                  >
                    <PdfMark element={draft} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.drawArea}>
                <SignaturePad
                  strokes={strokes}
                  onChange={setStrokes}
                  onLimit={() =>
                    setLimit(
                      'Drawing limit reached. Lift your pointer, or clear and try a simpler signature. Existing strokes are kept.',
                    )
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setStrokes([]);
                  setLimit('');
                }}
              >
                Clear drawing
              </button>
              <p className={styles.hint} role="status">
                {limit ||
                  'Draw inside the pad. Type is available if drawing is difficult.'}
              </p>
            </>
          )}
          <div className={styles.dialogActions}>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!draft}
              onClick={() => {
                if (draft) onConfirm(draft);
              }}
            >
              Use {kind}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
