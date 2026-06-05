import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  // One Electron app at a time — the fixture is worker-scoped and stateful.
  workers: 1,
  fullyParallel: false,
  // Cheap guard against a committed `test.only`. Gated on CI env so local focused
  // runs still work (e2e is local-only — CI never runs it, so this is belt-and-braces).
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10_000,
  },
});
