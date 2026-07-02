import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Test files are not their own coverage subject.
        'src/**/*.test.ts',
        // Pure re-export barrel with no executable logic.
        'src/index.ts',
        // Thin glue over browser-only AudioContext/OfflineAudioContext.decodeAudioData;
        // there is no faithful Node substitute for the browser codec stack, so this
        // wrapper is exercised by browser e2e tests instead of unit coverage.
        'src/browser/**',
        // NOTE: src/testing/signals.ts is deliberately NOT excluded — the synthetic
        // signal factories are real DSP and are tested in src/testing/signals.test.ts.
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
