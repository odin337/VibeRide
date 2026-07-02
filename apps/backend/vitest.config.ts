import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Nest decorators (@Injectable/@Inject/@Controller) call the Reflect
    // metadata API the moment a decorated class module is imported, so the
    // polyfill must load before any test file.
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Bootstrap glue: process wiring only (listen, signals), no logic —
        // everything it composes is covered via the integration spec.
        'src/main.ts',
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
