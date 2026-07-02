import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Test files themselves are not shipped surface area.
        'src/**/*.test.{ts,tsx}',
        // Vitest bootstrap (Testing Library cleanup hook) — test infrastructure, not app code.
        'src/test/**',
        // PixiJS scene glue: logic-free Application/Graphics wiring (terrain polygons, sprites,
        // camera transforms). Needs a real WebGL context, so it is exercised by the Playwright
        // e2e run instead; all gameplay logic it visualizes lives in src/engine (fully tested).
        'src/render/**',
        // Standalone bootstrap: reads #root and calls createGame. Exercised by e2e.
        'src/main.tsx',
        // Composition root: React mounting plus browser-port wiring (Pixi renderer, Web Audio,
        // rAF, navigator.getGamepads). Everything it composes is unit-tested through injected
        // fakes in game-controller/App tests; the wiring itself is exercised by e2e.
        'src/embed.tsx',
        // AudioContext/AudioBufferSourceNode/OscillatorNode glue. The pure beat-scheduling and
        // note-selection logic lives in src/audio/scheduler.ts and src/audio/notes.ts (tested);
        // these files only translate it into Web Audio calls, which jsdom cannot host.
        'src/audio/playback.ts',
        'src/audio/sfx.ts',
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
