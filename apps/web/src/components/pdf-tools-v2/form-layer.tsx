'use client';
import type { PageViewport } from 'pdfjs-dist';
import type { PdfInfo, PdfEdits } from '@/lib/pdf-tools-model';
import styles from './workspace.module.css';

export type FormInteractions = {
  info: PdfInfo;
  values: PdfEdits['fields'];
  disabled: boolean;
  selected: string | null;
  onInspect: (name: string) => void;
  onChoose: (page: number) => void;
  onChange: (
    name: string,
    value: string | boolean,
    immediate?: boolean,
  ) => void;
};
export function FormLayer({
  viewport,
  index,
  scale,
  interactions,
}: {
  viewport: PageViewport;
  index: number;
  scale: number;
  interactions: FormInteractions;
}) {
  const widgets =
    interactions.info.formWidgets?.filter(
      (widget) =>
        widget.page === index && widget.field && widget.width && widget.height,
    ) ?? [];
  if (!widgets.length) return null;
  const positions = widgets.map((widget) => {
    const a = viewport.convertToViewportPoint(widget.x, widget.y);
    const b = viewport.convertToViewportPoint(
      widget.x + widget.width,
      widget.y + widget.height,
    );
    const width = Math.abs(a[0] - b[0]) * scale,
      height = Math.abs(a[1] - b[1]) * scale;
    return {
      left: Math.min(a[0], b[0]) * scale,
      top: Math.min(a[1], b[1]) * scale,
      width,
      height,
    };
  });
  const targets = positions.map((p) => ({
    left: p.left + p.width / 2 - Math.max(44, p.width) / 2,
    top: p.top + p.height / 2 - Math.max(44, p.height) / 2,
    width: Math.max(44, p.width),
    height: Math.max(44, p.height),
  }));
  const grouped =
    scale < 0.5 ||
    targets.some((a, i) =>
      targets.some(
        (b, j) =>
          i !== j &&
          a.left < b.left + b.width &&
          a.left + a.width > b.left &&
          a.top < b.top + b.height &&
          a.top + a.height > b.top,
      ),
    );
  return (
    <div className={styles.fieldLayer} aria-label="Interactive PDF fields">
      {grouped ? (
        <button
          type="button"
          className={styles.overviewFields}
          onClick={() => interactions.onChoose(index)}
          disabled={interactions.disabled}
        >
          {new Set(widgets.map((widget) => widget.field)).size} fields · Edit
        </button>
      ) : null}
      {widgets.map((widget, i) => {
        const field = interactions.info.fields.find(
          (field) => field.name === widget.field,
        )!;
        const { width, height, left, top } = positions[i];
        const value = Object.hasOwn(interactions.values, field.name)
          ? interactions.values[field.name]
          : field.value;
        const radio = field.control === 'radio',
          checkbox = field.kind === 'checkbox';
        const checked = radio ? value === widget.option : value === true;
        return (
          <div
            key={`${field.name}:${i}`}
            className={styles.fieldOutline}
            style={{ left, top, width, height }}
          >
            {!grouped && (
              <button
                type="button"
                data-field-control={field.name}
                className={styles.fieldTarget}
                data-selected={interactions.selected === field.name}
                aria-label={`${field.name}${radio ? `: ${widget.option}` : ''}${field.readOnly ? ' (read-only)' : ''}`}
                role={checkbox ? 'checkbox' : radio ? 'radio' : 'button'}
                aria-checked={checkbox || radio ? checked : undefined}
                aria-readonly={field.readOnly || undefined}
                title={`${field.name}${field.required ? ' · Required' : ''}${field.readOnly ? ' · Read-only' : ''}`}
                disabled={interactions.disabled}
                style={{
                  width: Math.max(44, width),
                  height: Math.max(44, height),
                }}
                onClick={() => {
                  if ((radio || checkbox) && !field.readOnly)
                    interactions.onChange(
                      field.name,
                      checkbox ? !checked : widget.option!,
                      true,
                    );
                  else interactions.onInspect(field.name);
                }}
              >
                <span className={styles.srOnly}>{field.name}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
