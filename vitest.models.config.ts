import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['experiments/model-benchmark/benchmark.test.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
  },
});
