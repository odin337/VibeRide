import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Test files themselves are not shipped surface area.
        'src/**/*.test.ts',
        // Bootstrap glue: DOM/Vite wiring around createGame plus render-only
        // dev-notice/error screens. It is exercised by actually launching the
        // app in a browser (and later by e2e), not meaningfully unit-testable
        // without stubbing the entire web-game embed.
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
