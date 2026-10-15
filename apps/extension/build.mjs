import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
// Nx/pnpm runs this package with its own cwd. Avoid resolving a workspace
// symlink through import.meta.url before handing paths to the native bundler.
const root = `${process.cwd()}/`;
const require = createRequire(`${root}package.json`);
await mkdir(`${root}dist`, { recursive: true });
await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: ['src/panel.tsx', 'src/background.ts', 'src/bridge.ts'],
    outdir: 'dist',
    bundle: true,
    preserveSymlinks: true,
    // Resolve React DOM's transitive dependency through pnpm's real package
    // directory while preserving workspace symlinks for the native bundler.
    alias: {
      scheduler: require.resolve('scheduler', {
        paths: [dirname(require.resolve('react-dom/package.json'))],
      }),
    },
    format: 'esm',
    target: 'chrome116',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
    legalComments: 'none',
  }),
  ...['manifest.json', 'sidepanel.html', 'icon-32.png', 'icon-128.png'].map(
    (file) => copyFile(`${root}${file}`, `${root}dist/${file}`),
  ),
]);
