import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import {
  probeDocumentIsolation,
  parserRuntime,
  runDocumentProcess,
} from '../../apps/web/src/server/document-process';
import { pdfFixture, docxFixture } from '../helpers/document-fixtures';
const exec = promisify(execFile);
async function stopped(unit: string) {
  const { stdout } = await exec(
    (await parserRuntime()).control,
    [
      '--user',
      'show',
      unit,
      '--property=ActiveState',
      '--property=MainPID',
      '--property=ControlGroup',
    ],
    { timeout: 3000, maxBuffer: 4096 },
  );
  const state = Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  );
  expect(['inactive', 'failed']).toContain(state.ActiveState);
  expect(state.MainPID).toBe('0');
  if (state.ControlGroup) {
    const events = await readFile(
      '/sys/fs/cgroup' + state.ControlGroup + '/cgroup.events',
      'utf8',
    ).catch((error) => {
      if (error.code === 'ENOENT') return 'populated 0';
      throw error;
    });
    expect(events).toMatch(/populated 0/);
  }
}
it('parses synthetic PDF/DOCX in real constrained processes and denies host files/network/credentials', async () => {
  expect(await runDocumentProcess(await pdfFixture(), 'pdf', 'validate')).toBe(
    true,
  );
  expect(await runDocumentProcess(docxFixture(), 'docx', 'validate')).toBe(
    true,
  );
  for (const [format, bytes] of [
    ['pdf', await pdfFixture()],
    ['docx', docxFixture()],
  ] as const) {
    const result = await runDocumentProcess<{
      status: string;
      lines: unknown[];
    }>(bytes, format, 'extract');
    expect(result.status).toBe('success');
    expect(result.lines.length).toBeGreaterThan(0);
  }
  const result = await probeDocumentIsolation('access');
  expect(result.code).toBe(0);
  const observed = JSON.parse(result.stdout).result;
  expect(observed.hostFile).toBe(false);
  expect(observed.network).toBe(false);
  expect(observed.environment).toEqual(['PWD']);
  expect(observed.pid).toBe(2);
  await stopped(result.unit);
}, 20000);
it('kills native Buffer exhaustion and CPU-bound processes, and cleans child processes', async () => {
  for (const probe of ['memory', 'cpu'] as const) {
    const start = Date.now();
    const result = await probeDocumentIsolation(probe);
    expect(result.code).not.toBe(0);
    expect(Date.now() - start).toBeLessThan(11000);
    await stopped(result.unit);
  }
  const result = await probeDocumentIsolation('children');
  expect(result.code).toBe(0);
  await stopped(result.unit);
  // The parent survives exhaustion and can admit a subsequent real document.
  expect(await runDocumentProcess(docxFixture(), 'docx', 'validate')).toBe(
    true,
  );
}, 30000);
it('stops output exhaustion and aborts the complete cgroup before returning', async () => {
  const exhausted = await probeDocumentIsolation('output').catch(
    (error) => error,
  );
  expect(exhausted.message).toContain('resource limit');
  expect(exhausted.unit).toMatch(/^fats-document-/);
  await stopped(exhausted.unit);
  const during = new AbortController();
  const active = probeDocumentIsolation('cpu', during.signal);
  const timer = setTimeout(() => during.abort(), 300);
  const cancelled = await active.catch((error) => error);
  clearTimeout(timer);
  expect(cancelled.message).toContain('resource limit');
  await stopped(cancelled.unit);
  const abort = new AbortController();
  const pending = runDocumentProcess(
    await pdfFixture(),
    'pdf',
    'validate',
    abort.signal,
  );
  abort.abort();
  await expect(pending).rejects.toThrow();
}, 20000);
