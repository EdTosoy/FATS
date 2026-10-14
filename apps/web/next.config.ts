import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  transpilePackages: ['@fats/domain'],
  turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1'],
};

export default config;
