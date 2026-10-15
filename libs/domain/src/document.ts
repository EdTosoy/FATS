export const DOCUMENT_CATEGORIES = [
  'Resumes',
  'Cover letters',
  'Certificates',
  'Other application documents',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ACCOUNT_DOCUMENT_BYTES = 100 * 1024 * 1024;
export const MAX_DOCUMENTS = 50;
export const MAX_DOCUMENT_VERSIONS = 20;
export type DocumentFormat = 'pdf' | 'docx';
export type DocumentHealth =
  'available' | 'missing' | 'corrupt' | 'unavailable';
export interface DocumentVersion {
  id: string;
  documentId: string;
  number: number;
  originalFilename: string;
  format: DocumentFormat;
  size: number;
  sha256: string;
  createdAt: string;
  health: DocumentHealth;
}
export interface Document {
  id: string;
  name: string;
  category: DocumentCategory;
  archived: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersion[];
}
export interface ApplicationDocumentVersion {
  applicationId: string;
  documentId: string;
  versionId: string;
  updatedAt: string;
}
export interface DocumentLibrary {
  documents: Document[];
  associations: ApplicationDocumentVersion[];
  usedBytes: number;
}
export class DocumentValidationError extends Error {}
export function documentDetails(name: unknown, category: unknown) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 160 ||
    /[\u0000-\u001f\u007f]/.test(name)
  )
    throw new DocumentValidationError(
      'Enter a document name of 1–160 characters without control characters.',
    );
  if (!DOCUMENT_CATEGORIES.includes(category as DocumentCategory))
    throw new DocumentValidationError('Choose a supported document category.');
  return { name: name.trim(), category: category as DocumentCategory };
}
export function originalFilename(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 240 ||
    /[/\\:\u0000-\u001f\u007f]/.test(value) ||
    value === '.' ||
    value === '..'
  )
    throw new DocumentValidationError(
      'Choose a filename of 1–240 characters without paths or control characters.',
    );
  return value;
}
