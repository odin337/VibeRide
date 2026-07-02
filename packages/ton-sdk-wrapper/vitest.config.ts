import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Test files are not module code.
        'src/**/*.test.ts',
        // Pure re-export barrel — no executable logic.
        'src/index.ts',
        // Type-only declarations (TonModule interface + config) — erased at runtime.
        'src/types.ts',
        // Thin browser glue over @tonconnect/ui: it needs a DOM, the TonConnect
        // bridge and a real wallet, so it is exercised by e2e tests instead of
        // unit tests. All testable logic it uses lives in payloads.ts,
        // nft-indexer.ts and errors.ts, which are fully covered here.
        'src/tonconnect.ts',
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
