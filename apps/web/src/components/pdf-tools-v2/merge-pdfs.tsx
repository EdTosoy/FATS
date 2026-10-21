'use client';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { usePdfToolsMerge } from '@/lib/use-pdf-tools-merge';
import {
  mergePageId,
  mergePlanError,
  moveMergeDocument,
  moveMergeItem,
} from '@/lib/pdf-tools-merge';
import type { LocalPdfDocument } from '@/lib/use-pdf-tools-document';
import { PageCanvas } from './page-canvas';
import styles from './workspace.module.css';

const fileNumber = (id: string) => id.replace('file-', '');
export function MergePdfsLauncher() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button">Merge PDFs</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={`${styles.modal} ${styles.organizer}`}>
          <div className={styles.modalHeader}>
            <Dialog.Title>Merge PDFs</Dialog.Title>
            <Dialog.Close aria-label="Close merge PDFs">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            Add local PDFs and review a combined copy. Closing clears this merge
            plan; original files stay unchanged.
          </Dialog.Description>
          <MergePdfs hasEdits={false} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function MergeThumbnail({
  document,
  page,
  compact = false,
}: {
  document: LocalPdfDocument;
  page: number;
  compact?: boolean;
}) {
  const geometry = document.info.pages[page];
  const scale = Math.min(
    (compact ? 40 : 110) / geometry.viewWidth,
    (compact ? 54 : 140) / geometry.viewHeight,
  );
  return (
    <span
      className={styles.mergeThumb}
      style={{
        width: geometry.viewWidth * scale,
        aspectRatio: `${geometry.viewWidth}/${geometry.viewHeight}`,
      }}
    >
      <PageCanvas document={document} index={page} thumbnail scale={scale} />
    </span>
  );
}
export function MergePdfs({ hasEdits }: { hasEdits: boolean }) {
  const previewId = useId();
  const merge = usePdfToolsMerge();
  const input = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const pageButtons = useRef(new Map<string, HTMLButtonElement>());
  const fileButtons = useRef(new Map<string, HTMLButtonElement>());
  const dragged = useRef<{ kind: 'file' | 'page'; id: string } | null>(null);
  const [drop, setDrop] = useState<{
    kind: 'file' | 'page';
    id: string;
    before: boolean;
  } | null>(null);
  const pages = merge.plan.pages;
  const pageIndex = Math.max(
    0,
    pages.findIndex((page) => mergePageId(page) === selected),
  );
  const selectedPage = pages[pageIndex];
  const documents = merge.plan.documents.map((id) =>
    merge.sources.find((source) => source.id === id)!,
  );
  const fileId = documents.some((source) => source.id === selectedFile)
    ? selectedFile
    : documents[0]?.id;
  const source =
    selectedPage &&
    merge.sources.find((source) => source.id === selectedPage.document);
  const blocked = mergePlanError(merge.sources, merge.plan);
  const busy = !!merge.busy;
  const preparedUrl = merge.prepared?.url;
  useEffect(() => {
    if (preparedUrl) {
      previewHeading.current?.focus();
      previewHeading.current?.scrollIntoView({ block: 'start' });
    }
  }, [preparedUrl]);
  const focusPage = (id: string) =>
    requestAnimationFrame(() => pageButtons.current.get(id)?.focus());
  const focusFile = (id: string) =>
    requestAnimationFrame(() => fileButtons.current.get(id)?.focus());
  const choosePage = (id: string, document: string) => {
    setSelected(id);
    setSelectedFile(document);
  };
  const dropHandlers = (kind: 'file' | 'page', id: string, index: number) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (busy || dragged.current?.kind !== kind) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const bounds = event.currentTarget.getBoundingClientRect();
      setDrop({
        kind,
        id,
        before:
          kind === 'file'
            ? event.clientY < bounds.y + bounds.height / 2
            : event.clientX < bounds.x + bounds.width / 2,
      });
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const from = dragged.current;
      if (busy || !from || from.kind !== kind || !drop) return;
      event.preventDefault();
      event.stopPropagation();
      const fromIndex =
        kind === 'file'
          ? merge.plan.documents.indexOf(from.id)
          : pages.findIndex((page) => mergePageId(page) === from.id);
      const boundary = index + (drop.before ? 0 : 1);
      const to = boundary - (fromIndex < boundary ? 1 : 0);
      if (kind === 'file') {
        merge.commit(moveMergeDocument(merge.plan, from.id, to));
        setSelectedFile(from.id);
        focusFile(from.id);
      } else {
        merge.commit({
          ...merge.plan,
          pages: moveMergeItem(pages, fromIndex, to),
        });
        setSelected(from.id);
        focusPage(from.id);
      }
      dragged.current = null;
      setDrop(null);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setDrop(null);
    },
  });
  const dragHandle = (kind: 'file' | 'page', id: string, label: string) => (
    <button
      type="button"
      className={styles.dragHandle}
      draggable={!busy}
      disabled={busy}
      aria-label={`Drag ${label}; Move up and Move down are available`}
      onDragStart={(event) => {
        dragged.current = { kind, id };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'pdf-page');
      }}
      onDragEnd={() => {
        dragged.current = null;
        setDrop(null);
      }}
    >
      <GripVertical size={16} /> Move
    </button>
  );
  return (
    <section
      className={`${styles.pageOutputs} ${styles.mergeWorkflow}`}
      aria-label="Merge PDFs"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(
            (event.target as HTMLElement).tagName,
          ) &&
          ['z', 'y'].includes(event.key.toLowerCase())
        ) {
          event.preventDefault();
          event.stopPropagation();
          merge.step(
            event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo',
          );
        }
      }}
    >
      <div
        className={styles.outputScroll}
        tabIndex={0}
        aria-label="Merge files, final page order and preview"
      >
        <h2>Merge PDFs</h2>
        <p>Add PDFs → Arrange pages → Preview → Download a combined copy.</p>
        <p className={styles.mergeSessionNote} role="note">
          {hasEdits
            ? 'Your current document has edits. Download its completed PDF first, then add that copy here to include them. '
            : ''}
          Files are read from disk. The current document is not added
          automatically; its editing session stays unchanged.
        </p>
        <div
          className={styles.mergeAdd}
          role="group"
          aria-label="Add PDF files"
          onDragOver={(event) => {
            if (!busy && event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(event) => {
            if (busy || !event.dataTransfer.files.length) return;
            event.preventDefault();
            void merge.add(Array.from(event.dataTransfer.files));
          }}
        >
          <input
            ref={input}
            type="file"
            tabIndex={-1}
            accept="application/pdf,.pdf"
            multiple
            disabled={busy}
            aria-label="Add local PDFs to merge"
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void merge.add(files);
            }}
          />
          <button
            ref={addButton}
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Plus size={16} /> Add PDFs
          </button>
          <span>or drop PDF files here</span>
        </div>
        <p className={styles.hint}>
          Up to 8 files, 20 MiB total and 50 source pages. Removed files/pages
          stay in memory for Undo until you leave Merge. PDFs never upload.
        </p>
        <section aria-label="Source PDFs">
          <h3>Files · {documents.length}</h3>
          <p className={styles.hint}>
            Move a file to group its included pages together. Use the page order
            below for individual moves.
          </p>
          {!documents.length && (
            <p>No files added. Choose at least two different PDFs.</p>
          )}
          {documents.map((item, index) => (
            <article
              key={item.id}
              className={styles.mergeSource}
              data-selected={fileId === item.id}
              data-insert={
                drop?.kind === 'file' && drop.id === item.id
                  ? drop.before
                    ? 'before'
                    : 'after'
                  : undefined
              }
              {...dropHandlers('file', item.id, index)}
            >
              <button
                type="button"
                className={styles.mergeSourceSelect}
                aria-pressed={fileId === item.id}
                aria-label={`Select file ${fileNumber(item.id)}: ${item.name}`}
                ref={(node) => {
                  if (node) fileButtons.current.set(item.id, node);
                  else fileButtons.current.delete(item.id);
                }}
                onClick={() => {
                  setSelectedFile(item.id);
                  const first = pages.find((page) => page.document === item.id);
                  if (first) setSelected(mergePageId(first));
                }}
              >
                <MergeThumbnail document={item.document} page={0} compact />
                <span>
                  <strong>
                    File {fileNumber(item.id)} · {item.name}
                  </strong>
                  <span>
                    {item.info.pages.length} source{' '}
                    {item.info.pages.length === 1 ? 'page' : 'pages'} ·{' '}
                    {pages.filter((page) => page.document === item.id).length}{' '}
                    included
                  </span>
                </span>
              </button>
              <div className={styles.mergeRowActions}>
                <button
                  type="button"
                  disabled={busy || index === 0}
                  aria-label={`Move file ${fileNumber(item.id)} up`}
                  onClick={() => {
                    merge.commit(
                      moveMergeDocument(merge.plan, item.id, index - 1),
                    );
                    setSelectedFile(item.id);
                    focusFile(item.id);
                  }}
                >
                  <ArrowUp size={16} /> Move up
                </button>
                <button
                  type="button"
                  disabled={busy || index === documents.length - 1}
                  aria-label={`Move file ${fileNumber(item.id)} down`}
                  onClick={() => {
                    merge.commit(
                      moveMergeDocument(merge.plan, item.id, index + 1),
                    );
                    setSelectedFile(item.id);
                    focusFile(item.id);
                  }}
                >
                  <ArrowDown size={16} /> Move down
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove file ${fileNumber(item.id)}`}
                  onClick={() => {
                    merge.commit({
                      documents: merge.plan.documents.filter(
                        (id) => id !== item.id,
                      ),
                      pages: pages.filter((page) => page.document !== item.id),
                    });
                    const next = documents[index + 1] ?? documents[index - 1];
                    if (next) {
                      setSelectedFile(next.id);
                      focusFile(next.id);
                    } else addButton.current?.focus();
                  }}
                >
                  <Trash2 size={16} /> Remove file
                </button>
                {dragHandle('file', item.id, `file ${fileNumber(item.id)}`)}
              </div>
            </article>
          ))}
        </section>
        <section aria-label="Combined page order">
          <h3>
            Final page order · {pages.length}{' '}
            {pages.length === 1 ? 'page' : 'pages'}
          </h3>
          <p className={styles.hint}>
            Each card shows its position in the combined PDF, file number and
            original page. Select a page to review it.
          </p>
          <div className={styles.mergePageActions}>
            <button
              type="button"
              disabled={busy || !selectedPage || pageIndex === 0}
              onClick={() => {
                merge.commit({
                  ...merge.plan,
                  pages: moveMergeItem(pages, pageIndex, pageIndex - 1),
                });
                focusPage(mergePageId(selectedPage));
              }}
              aria-label="Move selected page up"
            >
              <ArrowUp size={16} /> Move up
            </button>
            <button
              type="button"
              disabled={busy || !selectedPage || pageIndex === pages.length - 1}
              onClick={() => {
                merge.commit({
                  ...merge.plan,
                  pages: moveMergeItem(pages, pageIndex, pageIndex + 1),
                });
                focusPage(mergePageId(selectedPage));
              }}
              aria-label="Move selected page down"
            >
              <ArrowDown size={16} /> Move down
            </button>
            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => {
                const remaining = pages.filter(
                  (_, index) => index !== pageIndex,
                );
                merge.commit({ ...merge.plan, pages: remaining });
                const next =
                  remaining[Math.min(pageIndex, remaining.length - 1)];
                if (next) {
                  setSelected(mergePageId(next));
                  focusPage(mergePageId(next));
                } else addButton.current?.focus();
              }}
              aria-label="Remove selected page"
            >
              <Trash2 size={16} /> Remove page
            </button>
          </div>
          <div className={styles.outputPageGrid}>
            {pages.map((page, index) => {
              const id = mergePageId(page),
                item = merge.sources.find(
                  (source) => source.id === page.document,
                )!;
              return (
                <article
                  key={id}
                  className={styles.pageOutputCard}
                  data-selected={index === pageIndex}
                  data-insert={
                    drop?.kind === 'page' && drop.id === id
                      ? drop.before
                        ? 'before'
                        : 'after'
                      : undefined
                  }
                  {...dropHandlers('page', id, index)}
                >
                  <button
                    type="button"
                    className={styles.mergePageSelect}
                    aria-label={`Select combined page ${index + 1}, file ${fileNumber(item.id)}, original page ${page.page + 1}`}
                    aria-pressed={index === pageIndex}
                    ref={(node) => {
                      if (node) pageButtons.current.set(id, node);
                      else pageButtons.current.delete(id);
                    }}
                    onClick={() => choosePage(id, item.id)}
                  >
                    <MergeThumbnail document={item.document} page={page.page} />
                    <strong>Page {index + 1}</strong>
                    <span>
                      File {fileNumber(item.id)} · {item.name}
                    </span>
                    <span>Original page {page.page + 1}</span>
                  </button>
                  {dragHandle('page', id, `combined page ${index + 1}`)}
                </article>
              );
            })}
          </div>
        </section>
        {source && selectedPage && (
          <section
            className={styles.mergePreview}
            aria-label="Combined document preview"
          >
            <h3 ref={previewHeading} tabIndex={-1}>
              {merge.prepared ? 'Verified combined PDF' : 'Page preview'}
            </h3>
            <div className={styles.mergePreviewLabel}>
              <label htmlFor={previewId}>Preview combined page</label>
              <select
                id={previewId}
                value={pageIndex}
                onChange={(event) => {
                  const page = pages[Number(event.target.value)];
                  choosePage(mergePageId(page), page.document);
                }}
              >
                {pages.map((page, index) => (
                  <option key={mergePageId(page)} value={index}>
                    {index + 1} · File {fileNumber(page.document)} · Page{' '}
                    {page.page + 1}
                  </option>
                ))}
              </select>
            </div>
            <p>
              Page {pageIndex + 1} of {pages.length} · File{' '}
              {fileNumber(source.id)} · {source.name} · Original page{' '}
              {selectedPage.page + 1}
            </p>
            <div
              className={styles.mergePaper}
              style={{
                aspectRatio: `${source.info.pages[selectedPage.page].viewWidth}/${source.info.pages[selectedPage.page].viewHeight}`,
              }}
            >
              <PageCanvas
                key={`${merge.prepared ? 'combined' : source.id}:${pageIndex}`}
                document={merge.prepared?.document ?? source.document}
                index={merge.prepared ? pageIndex : selectedPage.page}
                position={pageIndex + 1}
                scale={Math.min(
                  560 / source.info.pages[selectedPage.page].viewWidth,
                  650 / source.info.pages[selectedPage.page].viewHeight,
                )}
              />
            </div>
          </section>
        )}
        <p className={styles.hint}>
          The combined copy gets new document metadata. Source titles, authors
          and print preferences are not combined. Native page content stays
          intact; this is not secure redaction.
        </p>
      </div>
      <div className={styles.outputFooter}>
        {merge.errors.length > 0 && (
          <div className={styles.outputError} role="alert">
            <ul>
              {merge.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <p role="status">{merge.notice}</p>
        {!busy && !merge.prepared && <p className={styles.hint}>{blocked}</p>}
        {merge.prepared && (
          <p className={styles.outputFilename}>
            {merge.prepared.document.name} · {pages.length} pages
            {merge.prepared.requested
              ? ' · Download requested; check your browser.'
              : ''}
          </p>
        )}
        <div>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !!blocked}
            onClick={() =>
              merge.prepared ? merge.download() : void merge.prepare()
            }
          >
            {busy
              ? merge.busy === 'add'
                ? 'Checking files…'
                : 'Preparing combined PDF…'
              : merge.prepared
                ? 'Download combined PDF'
                : 'Preview combined PDF'}
          </button>
          {busy && (
            <button type="button" onClick={merge.cancel}>
              Cancel preparation
            </button>
          )}
          <button
            type="button"
            aria-label="Undo merge change"
            disabled={busy || !merge.undo}
            onClick={() => merge.step('undo')}
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Redo merge change"
            disabled={busy || !merge.redo}
            onClick={() => merge.step('redo')}
          >
            Redo
          </button>
        </div>
      </div>
    </section>
  );
}
