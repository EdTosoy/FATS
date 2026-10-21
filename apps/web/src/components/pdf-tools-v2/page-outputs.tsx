'use client';
import { useState, type ReactNode } from 'react';
import type { PdfEdits, PdfPageEdit } from '@/lib/pdf-tools-model';
import type { LocalPdfDocument } from '@/lib/use-pdf-tools-document';
import { usePdfToolsPageOutputs } from '@/lib/use-pdf-tools-page-outputs';
import {
  pageOutputError,
  pageRangeLabel,
  parsePagePositions,
  planPageOutputs,
  type PdfPageOutput,
} from '@/lib/pdf-tools-page-outputs';
import styles from './workspace.module.css';

function OutputPreview({
  plan,
  thumbnail,
}: {
  plan: PdfPageOutput;
  thumbnail: (source: number, position: number) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.outputPreview}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Preview pages {pageRangeLabel(plan.positions)}</summary>
      {open && (
        <div className={styles.outputPreviewPages}>
          {plan.sources.map((source, index) => (
            <div key={source}>
              {thumbnail(source, plan.positions[index])}
              <span>
                Output page {index + 1} · Document page {plan.positions[index]}
              </span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function PageOutputs({
  mode,
  document,
  edits,
  pages,
  thumbnail,
}: {
  mode: 'extract' | 'split';
  document: LocalPdfDocument;
  edits: PdfEdits;
  pages: PdfPageEdit[];
  thumbnail: (source: number, position: number) => ReactNode;
}) {
  const [choices, setChoices] = useState<number[]>([]);
  const [range, setRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const output = usePdfToolsPageOutputs(document, edits);
  const blocked = pageOutputError(document.info);
  const plans = planPageOutputs(document.name, pages, mode, choices);
  const choose = (sources: number[]) => {
    output.reset();
    setChoices(sources);
    setRangeError('');
  };
  const toggle = (source: number) =>
    choose(
      choices.includes(source)
        ? choices.filter((value) => value !== source)
        : [...choices, source],
    );
  const applyRange = () => {
    try {
      const positions = parsePagePositions(
        range,
        mode === 'extract' ? pages.length : pages.length - 1,
      );
      choose(positions.map((position) => pages[position - 1].source));
    } catch (error) {
      setRangeError((error as Error).message);
    }
  };
  return (
    <section
      className={styles.pageOutputs}
      aria-label={mode === 'extract' ? 'Extract pages' : 'Split document'}
    >
      <div
        className={styles.outputScroll}
        tabIndex={0}
        aria-label="Page choices and output previews"
      >
        <h2>{mode === 'extract' ? 'Extract pages' : 'Split document'}</h2>
        <p>
          {mode === 'extract'
            ? 'Choose the pages for one new PDF. Their current document order and edits are preserved.'
            : 'Choose where each PDF ends. Every page is included once, in its current order.'}
        </p>
        {blocked && (
          <p className={styles.outputError} role="note">
            {blocked}
          </p>
        )}
        <fieldset
          disabled={
            output.busy || !!blocked || (mode === 'split' && pages.length < 2)
          }
          className={styles.outputChoices}
        >
          <legend>
            {mode === 'extract' ? 'Pages to include' : 'Section boundaries'}
          </legend>
          <div className={styles.outputRange}>
            <label>
              {mode === 'extract' ? 'Include pages' : 'Split after pages'}
              <input
                value={range}
                maxLength={300}
                onChange={(event) => setRange(event.target.value)}
                placeholder={mode === 'extract' ? '1–3, 5' : '2, 4'}
                aria-describedby="pdf-output-range-hint"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyRange();
                  }
                }}
              />
            </label>
            <button type="button" onClick={applyRange}>
              Apply range
            </button>
            <button
              type="button"
              disabled={mode === 'split' && pages.length < 2}
              onClick={() =>
                choose(
                  (mode === 'extract' ? pages : pages.slice(0, -1)).map(
                    (page) => page.source,
                  ),
                )
              }
            >
              {mode === 'extract' ? 'Select all pages' : 'One page per PDF'}
            </button>
            <button type="button" onClick={() => choose([])}>
              {mode === 'extract' ? 'Clear selection' : 'Clear splits'}
            </button>
          </div>
          <p id="pdf-output-range-hint" className={styles.hint}>
            {mode === 'extract'
              ? 'Use current page numbers, such as 1–3, 5, or select thumbnails below.'
              : 'For example, 2, 4 creates sections 1–2, 3–4 and the remaining pages. You can also select boundaries below.'}
          </p>
          {rangeError && (
            <p className={styles.outputError} role="alert">
              {rangeError}
            </p>
          )}
          <p role="status">
            {mode === 'extract'
              ? `${choices.length} ${choices.length === 1 ? 'page' : 'pages'} selected`
              : `${plans.length} PDFs planned${pages.length === 1 ? ' · Open a document with at least two pages to split.' : ''}`}
          </p>
          <div className={styles.outputPageGrid}>
            {pages.map(({ source }, index) => (
              <div
                key={source}
                className={styles.pageOutputCard}
                data-selected={choices.includes(source)}
              >
                {mode === 'extract' ? (
                  <label className={styles.outputPageLabel}>
                    <input
                      type="checkbox"
                      checked={choices.includes(source)}
                      onChange={() => toggle(source)}
                      aria-label={`Include page ${index + 1}`}
                    />
                    {thumbnail(source, index + 1)}
                    <strong>Page {index + 1}</strong>
                  </label>
                ) : (
                  <>
                    {thumbnail(source, index + 1)}
                    <strong>Page {index + 1}</strong>
                    {index < pages.length - 1 ? (
                      <label className={styles.pageBoundary}>
                        <input
                          type="checkbox"
                          checked={choices.includes(source)}
                          onChange={() => toggle(source)}
                        />
                        Split after page {index + 1}
                      </label>
                    ) : (
                      <p className={styles.hint}>End of document</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </fieldset>
        <section className={styles.outputList} aria-label="Output PDF previews">
          <h3>
            {mode === 'extract' ? 'Your extracted PDF' : 'Your separate PDFs'}
          </h3>
          {!plans.length && (
            <p>
              {mode === 'extract'
                ? 'Select at least one page to preview the output.'
                : 'Choose a split boundary to preview your separate PDFs.'}
            </p>
          )}
          {plans.map((plan, index) => {
            const file = output.files.find((file) => file.name === plan.name);
            return (
              <article key={plan.name} className={styles.outputFile}>
                <h4>
                  PDF {index + 1} · {plan.sources.length}{' '}
                  {plan.sources.length === 1 ? 'page' : 'pages'}
                </h4>
                <p className={styles.outputFilename}>{plan.name}</p>
                <p>
                  Document pages {pageRangeLabel(plan.positions)} · In this
                  order
                </p>
                <OutputPreview plan={plan} thumbnail={thumbnail} />
                {file ? (
                  <>
                    <p>
                      {file.requested
                        ? 'Download requested. Check your browser; the copy is still available.'
                        : 'Prepared and checked. Ready to download.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => output.download(plan.name)}
                    >
                      Download PDF {index + 1}
                    </button>
                  </>
                ) : (
                  <p>Not prepared yet</p>
                )}
              </article>
            );
          })}
        </section>
      </div>
      <div className={styles.outputFooter}>
        {output.error && (
          <p className={styles.outputError} role="alert">
            {output.error}
          </p>
        )}
        <p role="status">{output.notice}</p>
        <div>
          <button
            type="button"
            className={styles.primary}
            disabled={
              !!blocked ||
              output.busy ||
              !plans.length ||
              output.files.length === plans.length
            }
            onClick={() => void output.prepare(plans)}
          >
            {output.busy
              ? 'Preparing copies…'
              : output.files.length
                ? 'Prepare remaining PDFs'
                : mode === 'extract'
                  ? 'Prepare extracted PDF'
                  : 'Prepare split PDFs'}
          </button>
          {output.busy && (
            <button type="button" onClick={output.cancel}>
              Cancel preparation
            </button>
          )}
        </div>
        <p className={styles.hint}>
          Download files one at a time. Check browser downloads and retry if
          blocked.
        </p>
      </div>
    </section>
  );
}
