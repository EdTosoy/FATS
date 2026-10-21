'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { dateText } from '@/lib/pdf-tools-editing';
import styles from './workspace.module.css';
export function DateDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (value: string, format: 'long' | 'iso') => void;
}) {
  const [value, setValue] = useState('');
  const [format, setFormat] = useState<'long' | 'iso'>('long');
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
          className={styles.modal}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <Dialog.Title>Choose a date</Dialog.Title>
          <Dialog.Description>
            Select the date you intend to put on this document. It is never
            inserted automatically.
          </Dialog.Description>
          <label className={styles.inputLabel}>
            Date
            <input
              type="date"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className={styles.inputLabel}>
            Date format
            <select
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as 'long' | 'iso')
              }
            >
              <option value="long">Day Month Year · 21 Oct 2026</option>
              <option value="iso">Year-Month-Day · 2026-10-21</option>
            </select>
          </label>
          <p className={styles.hint}>
            Preview: {dateText(value, format) || 'Choose a valid date'}
          </p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!dateText(value, format)}
              onClick={() => onConfirm(value, format)}
            >
              Use date
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
