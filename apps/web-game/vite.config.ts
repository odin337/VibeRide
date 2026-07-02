import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    // @viberide/ton-sdk-wrapper pulls @ton/core, which expects the Node Buffer global.
    nodePolyfills({ include: ['buffer'], globals: { Buffer: true } }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // pixi.js is a single indivisible vendor chunk at ~505 kB minified
    // (145 kB gzipped); everything else stays well under the default limit.
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        // Split the heavyweight vendor trees into long-term-cacheable chunks.
        // Function form: pixi.js is only a transitive dependency for the
        // Telegram wrapper, so bare-specifier entries would not resolve there.
        manualChunks(id: string): string | undefined {
          const path = id.replace(/\\/g, '/');
          if (/node_modules\/.*pixi\.js\//.test(path)) {
            return 'pixi';
          }
          if (/node_modules\/.*\/(react|react-dom|scheduler)\//.test(path)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
