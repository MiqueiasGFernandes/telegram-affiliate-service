import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: { reporter: ['text', 'lcov'] },
  },
});
