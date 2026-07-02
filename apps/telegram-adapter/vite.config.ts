import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    // The game embed pulls @ton/core, which expects the Node Buffer global.
    nodePolyfills({ include: ['buffer'], globals: { Buffer: true } }),
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 4174,
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
        // Function form: pixi.js reaches this app only transitively through
        // the game embed, so bare-specifier entries would not resolve.
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
