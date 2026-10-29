// Disposable loopback-only PgBouncer for the existing labelled test database.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';
const name = 'fats-d2-pooler-tests',
  image = 'edoburu/pgbouncer:v1.26.0-p0';
function docker(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
let pool;
try {
  const label = docker([
    'ps',
    '-a',
    '--filter',
    `name=^/${name}$`,
    '--format',
    '{{.Label "fats.task"}}',
  ]);
  if (label && label !== 'd2-pooler') throw new Error();
  if (process.argv[2] === 'stop') {
    if (label) {
      docker(['stop', name]);
      docker(['rm', name]);
    }
    console.log(
      'Stopped the disposable D2 pooler. The separate test database is unchanged.',
    );
  } else {
    process.loadEnvFile('.env.phase4-test');
    const url = new URL(process.env.FATS_TEST_DATABASE_URL);
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '16432' ||
      url.username !== 'fats_test' ||
      url.pathname !== '/fats_phase4_test'
    )
      throw new Error();
    if (
      docker([
        'inspect',
        '--format',
        '{{index .Config.Labels "fats.task"}}',
        'fats-phase4-tests',
      ]) !== 'phase4'
    )
      throw new Error();
    const directory = resolve('.fats-private/d2/pooler');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      directory + '/pgbouncer.ini',
      `[databases]\nfats_phase4_test = host=127.0.0.1 port=16432 dbname=fats_phase4_test\n[pgbouncer]\nlisten_addr=127.0.0.1\nlisten_port=16439\nauth_type=plain\nauth_file=/etc/pgbouncer/userlist.txt\npool_mode=transaction\nmax_client_conn=100\ndefault_pool_size=20\nserver_round_robin=1\nserver_reset_query=DISCARD ALL\nserver_reset_query_always=1\nignore_startup_parameters=extra_float_digits,statement_timeout\npidfile=/tmp/pgbouncer.pid\n`,
      { mode: 0o600 },
    );
    await writeFile(
      directory + '/userlist.txt',
      `${JSON.stringify(url.username)} ${JSON.stringify(decodeURIComponent(url.password))}\n`,
      { mode: 0o600 },
    );
    if (label) docker(['start', name]);
    else
      docker([
        'run',
        '-d',
        '--name',
        name,
        '--label',
        'fats.task=d2-pooler',
        '--network',
        'host',
        '--user',
        `${process.getuid()}:${process.getgid()}`,
        '--mount',
        `type=bind,src=${directory},dst=/etc/pgbouncer,readonly`,
        '--entrypoint',
        '/usr/bin/pgbouncer',
        image,
        '/etc/pgbouncer/pgbouncer.ini',
      ]);
    url.port = '16439';
    pool = new Pool({
      connectionString: url.href,
      connectionTimeoutMillis: 1000,
    });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        await pool.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await setTimeout(200);
      }
    }
    if (!ready) throw new Error();
    const file = '.env.phase4-pooler-test';
    if (existsSync(file)) {
      const { readFile } = await import('node:fs/promises');
      if (
        !(await readFile(file, 'utf8')).startsWith(
          '# FATS D2 disposable pooler\n',
        )
      )
        throw new Error();
    }
    await writeFile(
      file,
      `# FATS D2 disposable pooler\nDATABASE_URL=${url.href}\nFATS_TEST_DATABASE_URL=${url.href}\nBETTER_AUTH_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=${process.env.BETTER_AUTH_SECRET}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Ready: PgBouncer transaction mode on loopback port 16439; dedicated synthetic test database only.',
    );
  }
} catch {
  console.error(
    'The labelled D2 test pooler could not be prepared. Start the repository test database and check the pinned image, loopback port and private configuration. Credentials and raw container errors are withheld.',
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
