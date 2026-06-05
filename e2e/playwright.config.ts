import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  // Build the deterministic schema template ONCE per run (ADR-0011): the built app
  // self-heals an empty DB to the current schema → template → per-test copy + seed.
  globalSetup: './globalSetup.ts',
  // One Electron app at a time — the fixture is worker-scoped and stateful.
  workers: 1,
  fullyParallel: false,
  // Cheap guard against a committed `test.only`. Gated on CI env so local focused
  // runs still work (e2e is local-only — CI never runs it, so this is belt-and-braces).
  forbidOnly: !!process.env.CI,
  // skipGuard.reporter fails the run if any test skips unexpectedly (0-skip policy
  // enabled by the deterministic seed — ADR-0011).
  reporter: [['list'], ['html', { open: 'never' }], ['./skipGuard.reporter.ts']],
  use: {
    actionTimeout: 10_000,
  },
});
