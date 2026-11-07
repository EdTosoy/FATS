'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CSV_FIELDS,
  MAX_CSV_BYTES,
  parseCsv,
  suggestCsvMapping,
  type CsvField,
  type CsvMapping,
  type CsvDateOrder,
  type CsvPreview,
  type CsvImportSummary,
} from '@fats/domain';
import { useApplications } from './application-provider';
import { useAccount } from './account-provider';
import { Button } from './ui';

export function CsvImport() {
  const {
    previewCsv,
    importCsv,
    loading,
    error: workspaceError,
  } = useApplications();
  const { user } = useAccount();
  const [file, setFile] = useState<{
    name: string;
    text: string;
    headers: string[];
  } | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [dateOrder, setDateOrder] = useState<CsvDateOrder>('iso');
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = summary
    ? 'summary'
    : preview
      ? 'preview'
      : file
        ? 'mapping'
        : 'select';
  useEffect(() => {
    if (stage !== 'select') heading.current?.focus();
  }, [stage]);
  function reset() {
    setFile(null);
    setMapping({});
    setPreview(null);
    setSelected([]);
    setSummary(null);
    setError('');
    setConfirmed(false);
    setPage(0);
    setDateOrder('iso');
    if (fileInput.current) fileInput.current.value = '';
    fileInput.current?.focus();
  }
  async function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const value = fileInput.current?.files?.[0];
      if (!value) throw new Error('Choose a CSV file first.');
      if (value.size > MAX_CSV_BYTES)
        throw new Error('Choose a CSV file of 1 MiB or less.');
      const text = await value.text();
      const { headers } = parseCsv(text);
      setMapping(suggestCsvMapping(headers));
      setFile({ name: value.name, text, headers });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'The CSV could not be read.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await previewCsv({ text: file.text, mapping, dateOrder });
      setPreview(result);
      setSelected(
        result.rows
          .filter(
            (row) =>
              row.input &&
              !row.errors.length &&
              !row.duplicate &&
              !row.possibleDuplicate,
          )
          .map((row) => row.row),
      );
      setConfirmed(false);
      setPage(0);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The preview could not be prepared.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !file || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const result = await importCsv({
        text: file.text,
        mapping,
        dateOrder,
        token: preview.token,
        selected,
        confirmed,
      });
      setSummary(result);
      setPreview(null);
      setFile(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The CSV could not be imported. Keep this preview and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="csv-import" aria-labelledby="csv-import-title">
      <h3 id="csv-import-title">CSV Import</h3>
      <p>
        Export your Google Sheet as comma-separated values (.csv), then map its
        columns here. No Google connection is needed. Existing records are kept.
      </p>
      <p className="field-hint">
        UTF-8 · maximum 1 MiB, 1,000 data rows, 64 columns, and 20,000
        characters per cell. Company, title, location, and job URL are required
        by FATS. Missing optional values stay empty. Blank statuses are shown as
        Saved; no applied dates or past activities are inferred.{' '}
        {user
          ? 'CSV data is sent to your FATS account server for preview and import.'
          : 'CSV data stays in this browser.'}
      </p>
      <h4 ref={heading} tabIndex={-1}>
        {stage === 'select'
          ? '1. Select CSV'
          : stage === 'mapping'
            ? '2. Map columns'
            : stage === 'preview'
              ? '3. Preview records and review duplicates/errors'
              : '4. Import summary'}
      </h4>
      <form
        className="backup-file-form"
        onSubmit={choose}
        hidden={stage !== 'select'}
      >
        <label htmlFor="csv-file">Choose CSV file</label>
        <input
          id="csv-file"
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          required
          disabled={busy || loading || !!workspaceError}
        />
        <Button type="submit" disabled={busy || loading || !!workspaceError}>
          Map columns
        </Button>
      </form>
      {file && !preview && (
        <form className="job-form" onSubmit={inspect}>
          <p>
            File: {file.name}. Suggested mappings are editable. Choose “Skip /
            no column” for fields you do not want to import. Unmapped columns
            are skipped.
          </p>
          <fieldset disabled={busy}>
            <div className="form-grid">
              {(Object.keys(CSV_FIELDS) as CsvField[]).map((field) => (
                <label key={field}>
                  {CSV_FIELDS[field]}
                  <select
                    value={mapping[field] ?? ''}
                    onChange={(event) => {
                      const next = { ...mapping };
                      if (event.target.value === '') delete next[field];
                      else next[field] = Number(event.target.value);
                      setMapping(next);
                    }}
                  >
                    <option value="">Skip / no column</option>
                    {file.headers.map((header, index) => (
                      <option key={index} value={index}>
                        {header || 'Unnamed column'} (column {index + 1})
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                Numeric date format
                <select
                  value={dateOrder}
                  onChange={(event) =>
                    setDateOrder(event.target.value as CsvDateOrder)
                  }
                >
                  <option value="iso">YYYY-MM-DD / month names only</option>
                  <option value="mdy">Month / day / year</option>
                  <option value="dmy">Day / month / year</option>
                </select>
              </label>
            </div>
          </fieldset>
          <div className="csv-actions">
            <Button type="submit" disabled={busy}>
              Preview records
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={reset}
              disabled={busy}
            >
              Choose another CSV
            </Button>
          </div>
        </form>
      )}
      {preview && (
        <form onSubmit={save}>
          <p className="csv-counts">
            {preview.rows.length} records · {selected.length} to import ·{' '}
            {preview.rows.length - selected.length} to skip ·{' '}
            {preview.rows.filter((row) => row.errors.length).length} with errors
            · {preview.rows.filter((row) => row.duplicate).length} duplicates ·{' '}
            {preview.rows.filter((row) => row.possibleDuplicate).length}{' '}
            possible duplicates
          </p>
          <p>
            Errors and duplicate posting URLs cannot be imported. Possible
            company/title matches start unchecked; include one only after
            reviewing it. Fix errors in the sheet or go back to change mappings.
            Previewing changes nothing.
          </p>
          <ol className="csv-rows" aria-label="CSV records">
            {preview.rows.slice(page * 25, (page + 1) * 25).map((row) => (
              <li key={row.row}>
                <label className="restore-confirmation">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.row)}
                    disabled={busy || !!row.errors.length || !!row.duplicate}
                    onChange={(event) => {
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, row.row]
                          : current.filter((number) => number !== row.row),
                      );
                      setConfirmed(false);
                    }}
                  />
                  <span>
                    Import row {row.row}:{' '}
                    {row.values.company || 'Missing company'} —{' '}
                    {row.values.title || 'Missing title'}
                  </span>
                </label>
                {row.errors.map((message, index) => (
                  <p key={index} className="error-message">
                    {message}
                  </p>
                ))}
                {row.duplicate && (
                  <p className="backup-warning">Duplicate: {row.duplicate}</p>
                )}
                {row.possibleDuplicate && (
                  <p className="backup-warning">
                    Possible duplicate: {row.possibleDuplicate}
                  </p>
                )}
                {row.warnings.map((message, index) => (
                  <p key={index} className="field-hint">
                    {message}
                  </p>
                ))}
                <details>
                  <summary>Review row {row.row} values</summary>
                  <dl className="tracking-details">
                    {(Object.keys(CSV_FIELDS) as CsvField[])
                      .filter((field) => mapping[field] !== undefined)
                      .map((field) => (
                        <div key={field}>
                          <dt>{CSV_FIELDS[field]}</dt>
                          <dd>
                            {row.input && field in row.input
                              ? String(
                                  row.input[field as keyof typeof row.input] ??
                                    '',
                                )
                              : row.values[field] || 'Empty'}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <p>Status to import: {row.input?.status ?? 'Invalid'}</p>
                  <p>
                    Applied date: {row.input?.applicationDate || 'Not supplied'}
                  </p>
                </details>
              </li>
            ))}
          </ol>
          {preview.rows.length > 25 && (
            <div className="csv-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous rows
              </Button>
              <span>
                Page {page + 1} of {Math.ceil(preview.rows.length / 25)}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || (page + 1) * 25 >= preview.rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next rows
              </Button>
            </div>
          )}
          <label className="restore-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
              required
            />
            <span>
              I reviewed the selected records and confirm adding{' '}
              {selected.length} applications. Existing applications will not be
              overwritten.
            </span>
          </label>
          <div className="csv-actions">
            <Button
              type="submit"
              disabled={busy || !confirmed || !selected.length}
            >
              {busy ? 'Importing…' : `Confirm import (${selected.length})`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError('');
                setConfirmed(false);
              }}
            >
              Back to mapping
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={reset}
            >
              Cancel CSV import
            </Button>
          </div>
        </form>
      )}
      {summary && (
        <>
          <p role="status">
            CSV import completed. Imported {summary.imported} applications;
            skipped {summary.skipped}. Existing records were kept.
          </p>
          <Button type="button" variant="secondary" onClick={reset}>
            Import another CSV
          </Button>
        </>
      )}
      {busy && stage !== 'preview' && <p role="status">Preparing CSV…</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {workspaceError && (
        <p className="error-message">
          CSV import is unavailable until your saved workspace can be read.
        </p>
      )}
    </section>
  );
}
