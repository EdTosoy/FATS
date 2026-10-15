import type { Metadata } from 'next';
import { DocumentLibraryView } from '@/components/document-library';
export const metadata: Metadata = { title: 'Resumes & documents' };
export default function ResumesPage() {
  return <DocumentLibraryView />;
}
