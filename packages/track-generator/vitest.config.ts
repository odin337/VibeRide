import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Test files themselves are not part of the shipped surface.
        'src/**/*.test.ts',
        // Pure re-export barrel, no executable logic.
        'src/index.ts',
        // Deterministic synthetic-BeatMap builders used only by test suites
        // (here and in downstream packages); exercised indirectly by every
        // test in this package, not shipped as runtime logic.
        'src/testing/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
