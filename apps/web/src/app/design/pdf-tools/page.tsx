import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PdfDesignWorkspace } from '@/components/pdf-tools-design/workspace';

export const metadata: Metadata = {
  title: 'PDF Tools 2.0 · Design prototype',
  robots: { index: false, follow: false },
};

export default function PdfDesignPage() {
  // A review surface, never a replacement for the production editor.
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PdfDesignWorkspace />;
}
