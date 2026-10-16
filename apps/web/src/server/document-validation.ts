import {
  MAX_DOCUMENT_BYTES,
  originalFilename,
  DocumentValidationError,
  type DocumentFormat,
} from '@fats/domain';
import { runDocumentProcess } from './document-process.ts';
import { WorkspaceError } from './workspace-error.ts';
export function documentFileDetails(
  bytes: Uint8Array,
  filename: unknown,
): { originalFilename: string; format: DocumentFormat } {
  const name = originalFilename(filename);
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    throw new DocumentValidationError(
      'Choose a nonempty file of 10 MiB or less.',
    );
  const format = name.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : name.toLowerCase().endsWith('.docx')
      ? 'docx'
      : null;
  if (!format) throw new DocumentValidationError('Choose a PDF or DOCX file.');
  return { originalFilename: name, format };
}
export async function validateDocument(
  bytes: Uint8Array,
  filename: unknown,
  signal?: AbortSignal,
) {
  const file = documentFileDetails(bytes, filename);
  try {
    if (
      !(await runDocumentProcess<boolean>(
        bytes,
        file.format,
        'validate',
        signal,
      ))
    )
      throw Error();
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new DocumentValidationError(
      'This file is malformed, unsupported, or exceeded safe processing limits. Use a simpler unencrypted PDF or a standard DOCX without macros or embedded files.',
    );
  }
  return file;
}
