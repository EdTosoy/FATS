import type { Metadata } from 'next';
import { connection } from 'next/server';
import { documentScanningAvailable } from '@/server/document-availability';
import { DocumentLibraryView } from '@/components/document-library';
export const metadata: Metadata = { title: 'Resumes & documents' };
export default async function ResumesPage() {
  await connection();
  return (
    <DocumentLibraryView
      scanningAvailable={await documentScanningAvailable()}
    />
  );
}
