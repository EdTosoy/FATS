import { spawn, execFile } from 'node:child_process';
import { access, realpath, mkdir, lstat, open } from 'node:fs/promises';
import { existsSync, constants } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkspaceError } from './workspace-error.ts';

export const PROCESS_MEMORY_BYTES = 256 * 1024 * 1024;
export const PROCESS_OUTPUT_BYTES = 128 * 1024;
export const PROCESS_SLOTS = 4;
export class DocumentProcessError extends Error {
  readonly unit?: string;
  constructor(message: string, unit?: string) {
    super(message);
    this.unit = unit;
  }
}
async function executable(name: string) {
  const override =
    process.env['FATS_' + name.toUpperCase().replaceAll('-', '_') + '_PATH'];
  const paths = override
    ? [override]
    : (process.env.PATH ?? '').split(':').map((p) => join(p, name));
  for (const path of paths) {
    if (!isAbsolute(path)) continue;
    try {
      await access(path, constants.X_OK);
      return await realpath(path);
    } catch {
      /* Try next installed path. */
    }
  }
  throw new WorkspaceError(
    'Secure document processing is unavailable. Ask the local operator to configure systemd, Bubblewrap and util-linux. Your file has not been accepted.',
    503,
  );
}
export async function parserRuntime() {
  const cwd = process.cwd();
  const web = existsSync(join(cwd, 'apps/web/package.json'))
    ? join(cwd, 'apps/web')
    : cwd;
  return {
    web,
    workspace: resolve(web, '../..'),
    systemd: await executable('systemd-run'),
    control: await executable('systemctl'),
    bwrap: await executable('bwrap'),
    flock: await executable('flock'),
    node: await realpath(process.execPath),
  };
}
// flock is held by the transient service, not the web process/DB connection.
// Never unlink these empty lock files while any tool may still be running.
async function slotDirectory() {
  const owner = process.getuid!(),
    directory = '/tmp/fats-document-slots-' + owner;
  await mkdir(directory, { mode: 0o700 }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.uid !== owner ||
    (info.mode & 0o077) !== 0 ||
    (await realpath(directory)) !== directory
  )
    throw new WorkspaceError(
      'Secure document processing slots are unavailable. Ask the local operator to check the runtime.',
      503,
    );
  for (let slot = 0; slot < PROCESS_SLOTS; slot++) {
    const file = await open(
      join(directory, slot + '.lock'),
      constants.O_CREAT |
        constants.O_RDWR |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
      0o600,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.uid !== owner || (stat.mode & 0o077) !== 0)
        throw Error();
    } finally {
      await file.close();
    }
  }
  return directory;
}
// Both tools share a fixed Linux/NixOS containment policy; no upload controls
// command names, mounts, resource settings or arguments.
async function runTool(
  bytes: Uint8Array,
  tool: 'parser' | 'scanner',
  options: {
    format?: 'pdf' | 'docx';
    action?: 'validate' | 'extract' | 'probe';
    probe?: string;
    started?: (unit: string) => void;
    database?: string;
    scanner?: string;
  },
  signal?: AbortSignal,
) {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new DocumentProcessError('Document input limit.');
  const runtime = await parserRuntime();
  if (signal?.aborted)
    throw new DocumentProcessError('Document processing cancelled.');
  const seconds =
    tool === 'scanner' ? 30 : options.action === 'extract' ? 10 : 5;
  let slots: string;
  try {
    slots = await slotDirectory();
  } catch {
    throw new WorkspaceError(
      'Secure document processing slots are unavailable. Ask the local operator to check the runtime.',
      503,
    );
  }
  const deadline = Date.now() + (seconds + 4) * 1000;
  const mounts =
    tool === 'scanner'
      ? ['--ro-bind', options.database!, '/signatures', '--chdir', '/tmp']
      : [
          '--ro-bind',
          join(runtime.workspace, 'node_modules'),
          '/app/node_modules',
          '--ro-bind',
          join(runtime.web, 'node_modules'),
          '/app/apps/web/node_modules',
          '--ro-bind',
          join(runtime.web, 'package.json'),
          '/app/apps/web/package.json',
          '--ro-bind',
          join(runtime.web, 'src/server/document-parser.mjs'),
          '/app/apps/web/src/server/document-parser.mjs',
          '--ro-bind',
          join(runtime.web, 'src/server/docx-parser.mjs'),
          '/app/apps/web/src/server/docx-parser.mjs',
          '--chdir',
          '/app',
        ];
  const command =
    tool === 'scanner'
      ? [
          options.scanner!,
          '--database=/signatures',
          '--official-db-only=yes',
          '--fail-if-cvd-older-than=2',
          '--stdout',
          '--no-summary',
          '--tempdir=/tmp',
          '--max-scantime=5000',
          '--max-filesize=20M',
          '--max-scansize=50M',
          '--max-files=500',
          '--max-recursion=10',
          '--bytecode-timeout=1000',
          '--alert-exceeds-max=yes',
          '--alert-encrypted=yes',
          '--alert-macros=yes',
          '-',
        ]
      : [
          runtime.node,
          '--max-old-space-size=128',
          '--max-semi-space-size=16',
          '/app/apps/web/src/server/document-parser.mjs',
          options.format!,
          options.action!,
          ...(options.probe ? [options.probe] : []),
        ];
  const resourceArgs = [
    '--user',
    '--wait',
    '--pipe',
    '--quiet',
    '--collect',
    '-p',
    'MemoryMax=' + (tool === 'scanner' ? 2147483648 : PROCESS_MEMORY_BYTES),
    '-p',
    'MemorySwapMax=0',
    '-p',
    'CPUQuota=100%',
    '-p',
    'LimitCPU=' + seconds,
    '-p',
    'TasksMax=32',
    '-p',
    'RuntimeMaxSec=' + seconds,
    '-p',
    'TimeoutStopSec=1',
    '-p',
    'KillMode=control-group',
    '-p',
    'OOMPolicy=kill',
    '-p',
    'LimitCORE=0',
    '-p',
    'LimitNOFILE=64',
  ];
  const sandboxArgs = [
    runtime.bwrap,
    '--unshare-user',
    '--unshare-all',
    '--disable-userns',
    '--die-with-parent',
    '--new-session',
    '--cap-drop',
    'ALL',
    '--ro-bind',
    '/nix/store',
    '/nix/store',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--size',
    tool === 'scanner' ? '67108864' : '16777216',
    '--tmpfs',
    '/tmp',
    '--clearenv',
    ...mounts,
    ...command,
  ];
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'])
    if (process.env[key]) env[key] = process.env[key];
  for (let slot = 0; slot < PROCESS_SLOTS; slot++) {
    if (signal?.aborted || Date.now() >= deadline)
      throw new DocumentProcessError(
        'Document processing cancelled or timed out.',
      );
    const unit = 'fats-document-' + randomUUID() + '.service';
    const args = [
      ...resourceArgs,
      '--unit=' + unit,
      runtime.flock,
      '--nonblock',
      '--close',
      '--conflict-exit-code=75',
      join(slots, slot + '.lock'),
      ...sandboxArgs,
    ];
    const result = await new Promise<{
      unit: string;
      code: number | null;
      stdout: string;
      diagnostics: number;
    }>((resolve, reject) => {
      const child = spawn(runtime.systemd, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      options.started?.(unit);
      let output = Buffer.alloc(0),
        diagnostics = 0,
        failed = false,
        stopping = false,
        closed = false;
      let retryStop: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        if (stopping) return;
        stopping = true;
        failed = true;
        const requestStop = () =>
          execFile(
            runtime.control,
            ['--user', 'stop', unit],
            { env, timeout: 2500, maxBuffer: 4096 },
            () => {
              if (closed) return;
              // StartTransientUnit and cancellation may cross on the user bus.
              // Keep stopping until --wait exits instead of killing its launcher
              // after a premature "unit not found" response.
              if (Date.now() > deadline + 3000) child.kill('SIGKILL');
              else retryStop = setTimeout(requestStop, 100);
            },
          );
        requestStop();
      };
      const timer = setTimeout(stop, Math.max(1, deadline - Date.now()));
      const abort = () => stop();
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        if (output.length + chunk.length > PROCESS_OUTPUT_BYTES) stop();
        else output = Buffer.concat([output, chunk]);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        diagnostics += chunk.length;
        if (diagnostics > 65536) stop();
      });
      child.stdin.on('error', () => {
        failed = true;
      });
      child.on('error', () => {
        failed = true;
      });
      child.on('close', (code) => {
        closed = true;
        clearTimeout(retryStop);
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (failed && !(code === 75 && !stopping)) {
          reject(
            new DocumentProcessError(
              'Document processing failed or reached a resource limit.',
              unit,
            ),
          );
          return;
        }
        resolve({ unit, code, stdout: output.toString('utf8'), diagnostics });
      });
      if (signal?.aborted) stop();
      child.stdin.end(bytes);
    });
    if (result.code !== 75) return result;
  }
  throw new WorkspaceError(
    'Document safety checks are busy. Please retry shortly.',
    429,
  );
}
export async function runDocumentProcess<T>(
  bytes: Uint8Array,
  format: 'pdf' | 'docx',
  action: 'validate' | 'extract',
  signal?: AbortSignal,
): Promise<T> {
  const result = await runTool(bytes, 'parser', { format, action }, signal);
  try {
    const message = JSON.parse(result.stdout);
    if (result.code !== 0 || message.ok !== true) throw Error();
    return message.result as T;
  } catch {
    throw new DocumentProcessError(
      'Document processing failed or reached a resource limit.',
    );
  }
}
export async function runClamavProcess(
  bytes: Uint8Array,
  database: string,
  scanner: string,
  signal?: AbortSignal,
) {
  return runTool(bytes, 'scanner', { database, scanner }, signal);
}
export const clamavExecutable = () => executable('clamscan');

// Fixed operator/test diagnostics exercise the exact production boundary. There
// is no environment/configuration switch that turns these into upload results.
export async function probeDocumentIsolation(
  probe: 'memory' | 'cpu' | 'children' | 'output' | 'access',
  signal?: AbortSignal,
  started?: (unit: string) => void,
) {
  return runTool(
    Buffer.from('synthetic probe'),
    'parser',
    {
      format: 'pdf',
      action: 'probe',
      probe,
      started,
    },
    signal,
  );
}
