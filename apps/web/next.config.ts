import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  transpilePackages: ['@fats/domain'],
  turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
  devIndicators: false,
  outputFileTracingIncludes: {
    '/api/documents': [
      './src/server/docx-parser.mjs',
      './src/server/document-parser.mjs',
    ],
    '/api/matching': [
      './src/server/docx-parser.mjs',
      './src/server/document-parser.mjs',
    ],
  },
  allowedDevOrigins: ['127.0.0.1'],
};

export default config;
