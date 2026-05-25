import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  // One Electron app at a time — the fixture is worker-scoped and stateful.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    actionTimeout: 10_000,
  },
});
