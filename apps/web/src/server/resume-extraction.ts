import { MAX_DOCUMENT_BYTES, type DocumentFormat } from '@fats/domain';
import { runDocumentProcess } from './document-process';
export type ExtractionResult =
  | {
      status: 'success';
      lines: { text: string; location: string }[];
      warnings: string[];
    }
  | { status: 'empty' | 'unsupported' | 'failed' | 'limit'; message: string };
export async function extractResume(
  bytes: Uint8Array,
  format: DocumentFormat,
): Promise<ExtractionResult> {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    return {
      status: 'limit',
      message: 'The resume must be a nonempty file of at most 10 MiB.',
    };
  if (!['pdf', 'docx'].includes(format))
    return {
      status: 'unsupported',
      message: 'Only PDF and DOCX resumes can be compared.',
    };
  try {
    return await runDocumentProcess<ExtractionResult>(bytes, format, 'extract');
  } catch {
    return {
      status: 'limit',
      message:
        'This document could not be extracted safely within the processing limits. Use a simpler text-based resume.',
    };
  }
}
