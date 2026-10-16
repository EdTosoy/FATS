import type { Metadata } from 'next';
import { PdfToolsView } from '@/components/pdf-tools';
export const metadata: Metadata = { title: 'PDF Tools' };
export default function PdfToolsPage() {
  return <PdfToolsView />;
}
