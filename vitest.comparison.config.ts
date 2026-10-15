import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/evaluation/matching/comparison.run.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    isolate: true,
  },
});
