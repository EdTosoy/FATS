import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { ClamavDocumentScanner } from '../../apps/web/src/server/document-scanner';
import { runClamavProcess } from '../../apps/web/src/server/document-process';
import { documentHash } from '../../apps/web/src/server/document-storage';
vi.mock('../../apps/web/src/server/document-process', () => ({
  runClamavProcess: vi.fn(),
  clamavExecutable: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const health = {
  directory: '/synthetic-signatures',
  scanner: '/synthetic-clamscan',
  engine: 'ClamAV 1.4.3',
  signatureRevision: '123',
  signatureAt: new Date().toISOString(),
};
it('fails closed with missing, malformed, stale or future signatures', async () => {
  const scanner = new ClamavDocumentScanner();
  vi.stubEnv('FATS_CLAMAV_DATABASE_DIR', '');
  await expect(scanner.health()).rejects.toMatchObject({ status: 503 });
  const root = await mkdtemp('/tmp/fats-scanner-signatures-');
  try {
    vi.stubEnv('FATS_CLAMAV_DATABASE_DIR', root);
    await writeFile(root + '/main.cvd', 'invalid'.padEnd(512));
    await expect(scanner.health()).rejects.toMatchObject({ status: 503 });
    const header = (epoch: number) =>
      `ClamAV-VDB:synthetic:123:1:1:hash:signature:builder:${epoch}`.padEnd(
        512,
      );
    await writeFile(root + '/main.cvd', header(1));
    for (const time of [Date.now() - 49 * 3600000, Date.now() + 600000]) {
      await writeFile(root + '/daily.cvd', header(Math.floor(time / 1000)));
      await expect(scanner.health()).rejects.toMatchObject({ status: 503 });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('accepts only explicit clean output and rejects detections, errors, incomplete scans and signature races', async () => {
  const scanner = new ClamavDocumentScanner(),
    bytes = Buffer.from('synthetic');
  const status = vi.spyOn(scanner, 'health').mockResolvedValue(health);
  const run = vi.mocked(runClamavProcess);
  run.mockResolvedValue({
    unit: 'fixture',
    code: 0,
    stdout: 'stdin: OK\n',
    diagnostics: 0,
  });
  expect(await scanner.scan(bytes)).toMatchObject({
    engine: health.engine,
    sha256: documentHash(bytes),
  });
  run.mockResolvedValue({
    unit: 'fixture',
    code: 1,
    stdout: 'stdin: Win.Test.EICAR_HDB-1 FOUND\n',
    diagnostics: 0,
  });
  await expect(scanner.scan(bytes)).rejects.toMatchObject({ status: 400 });
  for (const result of [
    { code: 2, stdout: 'stdin: ERROR\n', diagnostics: 0 },
    { code: 0, stdout: '', diagnostics: 0 },
    { code: 0, stdout: 'stdin: OK\n', diagnostics: 1 },
    { code: 0, stdout: 'stdin: OK\nunscanned', diagnostics: 0 },
  ]) {
    run.mockResolvedValue({ unit: 'fixture', ...result });
    await expect(scanner.scan(bytes)).rejects.toMatchObject({ status: 503 });
  }
  run.mockRejectedValue(new Error('PRIVATE timeout details'));
  await expect(scanner.scan(bytes)).rejects.toMatchObject({ status: 503 });
  run.mockResolvedValue({
    unit: 'fixture',
    code: 0,
    stdout: 'stdin: OK\n',
    diagnostics: 0,
  });
  status
    .mockResolvedValueOnce(health)
    .mockResolvedValueOnce({ ...health, signatureRevision: '124' });
  await expect(scanner.scan(bytes)).rejects.toMatchObject({ status: 503 });
});
