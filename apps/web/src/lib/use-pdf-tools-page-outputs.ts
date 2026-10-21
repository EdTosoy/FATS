'use client';
import { useEffect, useRef, useState } from 'react';
import type { PdfEdits } from './pdf-tools-model';
import type { LocalPdfDocument } from './use-pdf-tools-document';
import { pdfMarkPng } from '@/components/pdf-tools-marks';
import { exportQuickSign } from './pdf-tools-quick-export';
import {
  PDF_PAGE_OUTPUT_BYTES,
  pageSubsetEdits,
  type PdfPageOutput,
} from './pdf-tools-page-outputs';

type PreparedOutput = PdfPageOutput & {
  url: string;
  bytes: number;
  requested: boolean;
};
export function usePdfToolsPageOutputs(
  document: LocalPdfDocument,
  edits: PdfEdits,
) {
  const [files, setFiles] = useState<PreparedOutput[]>([]);
  const ready = useRef<PreparedOutput[]>([]);
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    'Choose pages and review each output before preparing copies.',
  );
  const release = () => {
    for (const file of ready.current) URL.revokeObjectURL(file.url);
    ready.current = [];
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      release();
    };
  }, []);
  const reset = () => {
    operation.current?.abort();
    release();
    setFiles([]);
    setError('');
    setNotice(
      'Page choices updated. Review the outputs and prepare new copies.',
    );
  };
  const prepare = async (plans: PdfPageOutput[]) => {
    if (operation.current || !plans.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    try {
      for (const plan of plans) {
        if (ready.current.some((file) => file.name === plan.name)) continue;
        const subset = pageSubsetEdits(document.info, edits, plan.sources);
        const images = [];
        for (const element of subset.elements) {
          if (
            (element.kind === 'text' || element.kind === 'date') &&
            element.fontSize &&
            !element.text.trim()
          )
            throw new Error(
              'Enter text or choose a date, or delete the empty mark before creating this copy.',
            );
          // The existing painter has its own deadline. Also stop waiting for it
          // immediately when the user cancels or closes this output workspace.
          let cancel = () => {};
          try {
            const png = await Promise.race([
              pdfMarkPng(element),
              new Promise<never>((_, reject) => {
                cancel = () => reject(new Error('Preparation cancelled.'));
                if (controller.signal.aborted) cancel();
                else
                  controller.signal.addEventListener('abort', cancel, {
                    once: true,
                  });
              }),
            ]);
            images.push({ element, png });
          } finally {
            controller.signal.removeEventListener('abort', cancel);
          }
        }
        if (controller.signal.aborted) return;
        const bytes = await exportQuickSign(
          document,
          subset,
          images,
          controller.signal,
          (message) => {
            if (alive.current && !controller.signal.aborted)
              setNotice(`${plan.name}: ${message}`);
          },
          true,
        );
        if (!alive.current || controller.signal.aborted) return;
        if (
          ready.current.reduce((sum, file) => sum + file.bytes, 0) +
            bytes.byteLength >
          PDF_PAGE_OUTPUT_BYTES
        )
          throw new Error(
            'These copies exceed the 60 MiB preparation limit. Download the ready copies, then create fewer or smaller sections.',
          );
        const file = {
          ...plan,
          url: URL.createObjectURL(
            new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          ),
          bytes: bytes.byteLength,
          requested: false,
        };
        ready.current = [...ready.current, file];
        setFiles(ready.current);
      }
      setNotice(
        'Copies are ready. Download each file separately, then check your browser’s downloads. Your editing session is unchanged.',
      );
    } catch (problem) {
      if (alive.current && !controller.signal.aborted) {
        setError(
          problem instanceof Error
            ? problem.message
            : 'Copies could not be prepared. Retry; your document and edits are unchanged.',
        );
        setNotice(
          'Preparation stopped. Ready copies are kept; retry to prepare the remaining files.',
        );
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (alive.current) setBusy(false);
    }
  };
  const download = (name: string) => {
    const file = ready.current.find((file) => file.name === name);
    if (!file) return;
    setError('');
    try {
      const anchor = window.document.createElement('a');
      anchor.href = file.url;
      anchor.download = file.name;
      window.document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
      ready.current = ready.current.map((item) =>
        item === file ? { ...item, requested: true } : item,
      );
      setFiles(ready.current);
      setNotice(
        `${file.name} handed to your browser. Check its downloads; device saving cannot be confirmed here. You can request this file again.`,
      );
    } catch {
      setError(
        'Your browser could not start this download. Retry this file or check its download settings. The prepared copy is kept.',
      );
    }
  };
  const cancel = () => {
    operation.current?.abort();
    setNotice(
      'Preparation cancelled. Ready copies remain available. Your editing session is unchanged.',
    );
  };
  return { files, busy, error, notice, prepare, download, reset, cancel };
}
