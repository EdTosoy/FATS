// Disposable local test database only; never selects DATABASE_URL or touches
// an unlabelled container. Credentials stay in ignored, private files.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const name = 'fats-phase4-tests',
  file = '.env.phase4-test';
function docker(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
let present = false;
try {
  present =
    docker([
      'inspect',
      '--format',
      '{{index .Config.Labels "fats.task"}}',
      name,
    ]) === 'phase4';
} catch (error) {
  if (!/no such/i.test(String(error.stderr))) throw error;
}
if (!present) {
  try {
    docker(['inspect', '--format', '{{.Name}}', name]);
    throw new Error(
      'A container with this name is not owned by the FATS test helper.',
    );
  } catch (error) {
    if (!/no such/i.test(String(error.stderr))) throw error;
  }
}
if (process.argv[2] === 'stop') {
  if (present) {
    docker(['stop', name]);
    docker(['rm', name]);
  }
  console.log(
    'Stopped the disposable FATS test database. Test records were discarded; the private configuration is retained.',
  );
} else {
  if (!existsSync(file)) {
    const password = randomBytes(24).toString('hex');
    const url = `postgresql://fats_test:${password}@127.0.0.1:16432/fats_phase4_test`;
    await writeFile(
      file,
      `DATABASE_URL=${url}\nFATS_TEST_DATABASE_URL=${url}\nBETTER_AUTH_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}\n`,
      { flag: 'wx', mode: 0o600 },
    );
  }
  process.loadEnvFile(file);
  const url = new URL(process.env.FATS_TEST_DATABASE_URL);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '16432' ||
    url.pathname !== '/fats_phase4_test' ||
    url.username !== 'fats_test'
  )
    throw new Error(
      'This helper requires its isolated loopback port 16432 and fats_phase4_test database. Custom test databases must be started separately.',
    );
  if (present) {
    // `docker port` has no bindings to report while a container is stopped.
    // Inspect the configured binding before restarting the labelled test DB.
    const bindings = JSON.parse(
      docker([
        'inspect',
        '--format',
        '{{json .HostConfig.PortBindings}}',
        name,
      ]),
    );
    const port = bindings['5432/tcp'];
    if (
      port?.length !== 1 ||
      port[0].HostIp !== '127.0.0.1' ||
      port[0].HostPort !== '16432'
    )
      throw new Error('Unexpected test database port mapping.');
    docker(['start', name]);
  } else {
    const dir = await mkdtemp(tmpdir() + '/fats-postgres-');
    try {
      const envFile = dir + '/postgres.env';
      await writeFile(
        envFile,
        `POSTGRES_USER=fats_test\nPOSTGRES_DB=fats_phase4_test\nPOSTGRES_PASSWORD=${decodeURIComponent(url.password)}\n`,
        { mode: 0o600 },
      );
      docker([
        'run',
        '-d',
        '--name',
        name,
        '--label',
        'fats.task=phase4',
        '--env-file',
        envFile,
        '-p',
        '127.0.0.1:16432:5432',
        '--tmpfs',
        '/var/lib/postgresql/data',
        'postgres:17',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      docker([
        'exec',
        name,
        'pg_isready',
        '-U',
        'fats_test',
        '-d',
        'fats_phase4_test',
      ]);
      ready = true;
      break;
    } catch {
      await setTimeout(200);
    }
  }
  if (!ready)
    throw new Error('The isolated test database did not become ready.');
  console.log(
    'Ready: isolated local PostgreSQL test database on port 16432. Credentials were not printed.',
  );
}
