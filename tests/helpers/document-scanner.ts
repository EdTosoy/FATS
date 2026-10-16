// Persistence/authorization fixtures only. This is never imported by the app,
// exposed through configuration, or evidence of malware detection.
import { documentHash } from '../../apps/web/src/server/document-storage';
import type { DocumentScanner } from '../../apps/web/src/server/document-scanner';
export const syntheticScanner: DocumentScanner = {
  async scan(bytes) {
    return {
      engine: 'Synthetic fixture (not antivirus)',
      signatureRevision: 'fixture',
      signatureAt: new Date().toISOString(),
      scannedAt: new Date().toISOString(),
      sha256: documentHash(bytes),
    };
  },
};
