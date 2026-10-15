// Isolated local inbox for synthetic test accounts only. No relay is configured.
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const name = 'fats-account-mail-tests';
function docker(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
const existing = docker([
  'ps',
  '--all',
  '--filter',
  `name=^/${name}$`,
  '--format',
  '{{.Label "fats.task"}}',
]);
if (existing && existing !== 'phase4.1')
  throw new Error('This inbox container is not owned by the FATS test helper.');
if (process.argv[2] === 'stop') {
  if (existing) {
    docker(['stop', name]);
    docker(['rm', name]);
  }
  console.log(
    'Stopped the isolated test inbox and discarded its test messages.',
  );
} else {
  if (existing) docker(['start', name]);
  else
    docker([
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'fats.task=phase4.1',
      '-p',
      '127.0.0.1:11025:1025',
      '-p',
      '127.0.0.1:18025:8025',
      'axllent/mailpit:v1.31.6',
    ]);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:18025/readyz')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(200);
  }
  if (!ready) throw new Error('The isolated inbox is not ready.');
  console.log(
    'Ready: isolated local test inbox on port 18025; SMTP on port 11025.',
  );
}
