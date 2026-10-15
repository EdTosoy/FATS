import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL(`file://${process.cwd()}/dist/`);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, [
  'activeTab',
  'scripting',
  'sidePanel',
  'storage',
]);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.deepEqual(manifest.content_scripts[0].matches, [
  'http://localhost/sidekick*',
  'http://127.0.0.1/sidekick*',
]);
assert.equal(manifest.content_scripts[0].all_frames, false);
for (const file of [
  'panel.js',
  'panel.css',
  'background.js',
  'bridge.js',
  'sidepanel.html',
])
  await access(new URL(file, root));
const html = await readFile(new URL('sidepanel.html', root), 'utf8');
assert(!/<script[^>]+src=["']https?:/i.test(html));
console.log(
  'PASS: Manifest V3 package, minimum permissions, local bundles, and bridge boundaries.',
);
