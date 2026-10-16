import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mayacardio/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      '@mayacardio/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
});
