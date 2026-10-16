import { it, expect } from 'vitest';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  probeDocumentIsolation,
  parserRuntime,
  PROCESS_SLOTS,
} from '../../apps/web/src/server/document-process';
const exec = promisify(execFile);
it('keeps OS process admission after caller death, denies excess work, then releases every slot after group termination', async () => {
  const runtime = await parserRuntime();
  expect((await probeDocumentIsolation('access')).code).toBe(0); // creates canonical private slot files
  const slot = (index: number) =>
    '/tmp/fats-document-slots-' + process.getuid!() + '/' + index + '.lock';
  const check = async (index: number) =>
    exec(
      runtime.flock,
      [
        '--nonblock',
        '--conflict-exit-code=75',
        slot(index),
        runtime.node,
        '-e',
        '',
      ],
      { timeout: 1000 },
    ).then(
      () => 0,
      (error) => error.code,
    );
  const source = pathToFileURL(
    resolve('apps/web/src/server/document-process.ts'),
  ).href;
  const caller = spawn(
    runtime.node,
    [
      '--input-type=module',
      '-e',
      `import {probeDocumentIsolation} from ${JSON.stringify(source)}; const result=await probeDocumentIsolation('cpu',undefined,unit=>process.stdout.write(unit));process.stderr.write(JSON.stringify(result));`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let diagnostics = '';
  caller.stderr.on('data', (chunk) => {
    diagnostics += chunk.toString().slice(0, 4096);
  });
  const callerClosed = once(caller, 'close');
  let unit = '';
  const holders: ReturnType<typeof spawn>[] = [];
  try {
    unit = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('No unit started')), 3000);
      caller.stdout.on('data', (chunk) => {
        clearTimeout(timer);
        resolve(chunk.toString().trim());
      });
    });
    expect(unit).toMatch(/^fats-document-[0-9a-f-]+\.service$/);
    // Observe startup without competing for its lock during acquisition.
    await expect
      .poll(
        async () => {
          const status = await exec(
            runtime.control,
            ['--user', 'show', unit, '--property=MainPID', '--value'],
            { timeout: 1000 },
          );
          if (caller.exitCode !== null)
            throw Error('Synthetic caller exited: ' + diagnostics);
          return Number(status.stdout.trim());
        },
        { timeout: 2500, interval: 50 },
      )
      .toBeGreaterThan(0);
    expect(await check(0)).toBe(75);
    caller.kill('SIGKILL');
    await callerClosed;
    expect(await check(0)).toBe(75); // transient service owns the lock
    for (let index = 1; index < PROCESS_SLOTS; index++) {
      const child = spawn(
        runtime.flock,
        [
          '--nonblock',
          '--close',
          slot(index),
          runtime.node,
          '-e',
          'process.stdout.write("held");setInterval(()=>{},1000)',
        ],
        { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      holders.push(child);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('No slot held')), 2000);
        child.stdout!.once('data', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await expect(probeDocumentIsolation('access')).rejects.toMatchObject({
      status: 429,
    });
  } finally {
    caller.kill('SIGKILL');
    if (/^fats-document-[0-9a-f-]+\.service$/.test(unit))
      await exec(runtime.control, ['--user', 'stop', unit], {
        timeout: 3000,
      }).catch(() => {});
    for (const child of holders) {
      const closed =
        child.exitCode === null && child.signalCode === null
          ? once(child, 'close')
          : Promise.resolve();
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {}
      await closed;
    }
  }
  for (let index = 0; index < PROCESS_SLOTS; index++)
    expect(await check(index)).toBe(0);
  expect((await probeDocumentIsolation('access')).code).toBe(0);
}, 20000);
