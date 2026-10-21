import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PdfToolsV2Workspace } from '@/components/pdf-tools-v2/workspace';

export const metadata: Metadata = {
  title: 'PDF Tools 2.0 · Document editor candidate',
  robots: { index: false, follow: false },
};

export default function PdfToolsV2Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PdfToolsV2Workspace />;
}
