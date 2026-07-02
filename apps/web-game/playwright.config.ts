import { defineConfig, devices } from '@playwright/test';

// The package tsconfig deliberately loads no Node ambient types (types: []),
// so the CI flag is read through a narrowly-typed globalThis view instead of
// the Node `process` global.
const env: Readonly<Record<string, string | undefined>> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const isCI = env.CI !== undefined && env.CI !== '';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
  },
});
