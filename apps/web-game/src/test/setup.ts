import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without injected globals (globals: false), so Testing Library's
// automatic DOM cleanup never registers itself — do it explicitly here.
afterEach(() => {
  cleanup();
});

// jsdom does not implement Blob.prototype.arrayBuffer (used by the file
// picker flow in App.tsx); polyfill it over the FileReader API it does have.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    writable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(reader.result as ArrayBuffer);
        };
        reader.onerror = () => {
          reject(reader.error ?? new Error('FileReader failed'));
        };
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
