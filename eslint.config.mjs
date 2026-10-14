import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { settings: { next: { rootDir: 'apps/web/' }, react: { version: '19.3' } } },
  {
    files: ['libs/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react/*', 'next', 'next/*', '@/components/*'] },
      ],
    },
  },
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '.nx/**',
    '.pnpm-store/**',
    'test-results/**',
    'playwright-report/**',
    '**/next-env.d.ts',
  ]),
]);
