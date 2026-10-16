import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    channel: 'msedge',
  },
  webServer: [
    {
      command: 'bun run preview --port 4173 --host 127.0.0.1',
      port: 4173,
      reuseExistingServer: true,
    },
    {
      command: 'bun run ../cloud/src/dev-server.ts',
      port: 8787,
      reuseExistingServer: true,
    },
  ],
});
