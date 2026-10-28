import { afterEach, expect, it, vi } from 'vitest';
import { documentScanningAvailable } from '../../apps/web/src/server/document-availability';
import { ClamavDocumentScanner } from '../../apps/web/src/server/document-scanner';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('uses the existing live scanner health result without persisting or granting upload permission', async () => {
  const health = vi.spyOn(ClamavDocumentScanner.prototype, 'health');
  health.mockRejectedValueOnce(new Error('Synthetic unavailable scanner'));
  expect(await documentScanningAvailable()).toBe(false);
  health.mockResolvedValueOnce({
    directory: '/synthetic-private-signatures',
    scanner: '/synthetic-clamscan',
    engine: 'ClamAV 1.4.3',
    signatureRevision: '123',
    signatureAt: '2026-10-28T00:00:00.000Z',
  });
  expect(await documentScanningAvailable()).toBe(true);
  health.mockRejectedValueOnce(new Error('Synthetic stopped scanner'));
  expect(await documentScanningAvailable()).toBe(false);
  expect(health).toHaveBeenCalledTimes(3);
});
it('reports restricted intake with the actual missing-scanner configuration', async () => {
  vi.stubEnv('FATS_CLAMAV_DATABASE_DIR', '');
  expect(await documentScanningAvailable()).toBe(false);
});
