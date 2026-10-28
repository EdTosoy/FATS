import { ClamavDocumentScanner } from './document-scanner';

// Informational only. Intake still performs its own live scan and all other
// checks before publishing a version; this snapshot never grants permission.
export async function documentScanningAvailable(): Promise<boolean> {
  try {
    await new ClamavDocumentScanner().health();
    return true;
  } catch {
    return false;
  }
}
