import { ClamavDocumentScanner } from '../src/server/document-scanner.ts';
import { probeDocumentIsolation } from '../src/server/document-process.ts';
try {
  const health = await new ClamavDocumentScanner().health();
  const probe = await probeDocumentIsolation('access');
  const result = JSON.parse(probe.stdout).result;
  if (
    probe.code !== 0 ||
    result.hostFile ||
    result.network ||
    result.pid !== 2 ||
    result.environment.some((key) => key !== 'PWD')
  )
    throw Error();
  console.log(
    JSON.stringify({
      engine: health.engine,
      signatureRevision: health.signatureRevision,
      signatureAt: health.signatureAt,
      signatureAgeHours:
        Math.round((Date.now() - Date.parse(health.signatureAt)) / 360000) / 10,
      parserBoundary: 'available',
      scanVerified: false,
    }),
  );
} catch {
  console.error(
    'Document intake checks unavailable. Verify ClamAV, current official signatures, the private signature directory, user systemd/cgroups and Bubblewrap. No file was accepted; no private details were printed.',
  );
  process.exitCode = 1;
}
