import { defineConfig } from '@playwright/test';

export default defineConfig({
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

  // ── Projects ─────────────────────────────────────────────────────────────
  // Default project: the deterministic-seed suite (ADR-0011). `npm run test:e2e`
  // runs ONLY this project — the 40 specs that use the standard seed + the default
  // 503-for-everything mock. Skip-guard enforces 0 skips.
  //
  // Sync project: the `sync-current-term` spec that needs a LIVE mock Canvas (one
  // course + enrollment term endpoint). Runs ONLY when explicitly requested:
  //   npx playwright test --config e2e/playwright.config.ts --project sync
  // Uses env vars CID_E2E_SEED=current-term + CID_E2E_MOCK_CANVAS=current-term-sync
  // (set by the spec itself via test.use, not by the caller). Separated so the
  // default suite stays green and skip-free without Canvas mock endpoints.
  projects: [
    {
      name: 'default',
      testDir: '.',
      testMatch: '**/*.spec.ts',
      testIgnore: '**/sync-*.spec.ts',
    },
    {
      name: 'sync',
      testDir: '.',
      testMatch: '**/sync-*.spec.ts',
    },
  ],
});
