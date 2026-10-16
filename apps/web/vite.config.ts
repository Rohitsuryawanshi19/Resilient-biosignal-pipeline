import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mayacardio/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      '@mayacardio/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
