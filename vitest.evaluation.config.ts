import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/evaluation/matching/run.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    isolate: true,
    // Tests never decide to retry a billable evaluation automatically.
    reporters: ['default'],
  },
});
