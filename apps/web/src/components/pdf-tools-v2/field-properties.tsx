'use client';
import { useEffect, useRef } from 'react';
import type { PdfFieldInfo } from '@/lib/pdf-tools-model';
import { pdfFieldError } from '@/lib/pdf-tools-model';
import styles from './workspace.module.css';

export function FieldProperties({
  field,
  value,
  busy,
  onBegin,
  onCommit,
  onChange,
  onDone,
}: {
  field: PdfFieldInfo;
  value: string | boolean;
  busy: boolean;
  onBegin: () => void;
  onCommit: () => void;
  onChange: (
    name: string,
    value: string | boolean,
    immediate?: boolean,
  ) => void;
  onDone: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const editor = root.current?.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled)',
    );
    const done = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((button) => button.offsetParent !== null);
    (editor ?? done)?.focus();
  }, [field.name]);
  const error = pdfFieldError(field, value);
  return (
    <aside
      ref={root}
      className={`${styles.inspector} ${styles.inspectorExpanded}`}
      aria-label="Selected form field"
    >
      <div className={styles.selectionSummary}>
        <div>
          <strong>{field.name}</strong>
          <p>PDF form field</p>
        </div>
        <button type="button" onClick={onDone}>
          Done
        </button>
      </div>
      <div className={styles.propertyBody}>
        <div className={styles.modalHeader}>
          <h2>Fill field</h2>
          <button type="button" onClick={onDone}>
            Done
          </button>
        </div>
        <p className={styles.hint}>
          Your value is shown on the PDF.{' '}
          {field.required ? 'Required field.' : 'Optional field.'}{' '}
          {field.readOnly ? 'The document marks this field read-only.' : ''}
        </p>
        {field.kind === 'text' ? (
          <label className={styles.inputLabel}>
            {field.name}
            {field.required ? ' *' : ''}
            <input
              value={String(value)}
              readOnly={field.readOnly}
              required={field.required}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby="pdf-field-help"
              onFocus={onBegin}
              onChange={(event) => onChange(field.name, event.target.value)}
              onBlur={onCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  onDone();
                }
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  onDone();
                }
              }}
            />
          </label>
        ) : field.kind === 'checkbox' ? (
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={value === true}
              disabled={busy || field.readOnly}
              onChange={(event) =>
                onChange(field.name, event.target.checked, true)
              }
            />
            {field.name}
          </label>
        ) : field.control === 'radio' ? (
          <fieldset disabled={busy || field.readOnly}>
            <legend>{field.name}</legend>
            {field.options?.map((option) => (
              <label key={option} className={styles.checkLabel}>
                <input
                  type="radio"
                  name={`pdf-field-${field.name}`}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(field.name, option, true)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ) : (
          <label className={styles.inputLabel}>
            {field.name}
            <select
              value={String(value)}
              disabled={busy || field.readOnly}
              required={field.required}
              onChange={(event) =>
                onChange(field.name, event.target.value, true)
              }
            >
              <option value="">Choose an option</option>
              {field.options?.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        <p
          id="pdf-field-help"
          className={styles.hint}
          role={error ? 'status' : undefined}
        >
          {error ||
            (field.kind === 'text'
              ? `Up to ${field.maxLength ?? 500} characters. Standard PDF fields support Western European text.`
              : 'Choose an option explicitly; page navigation keeps your value.')}
        </p>
      </div>
    </aside>
  );
}
