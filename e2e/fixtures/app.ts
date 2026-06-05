/**
 * Playwright fixture that launches the built Electron app against an isolated,
 * offline fixture profile and hands tests the renderer page on the main UI.
 *
 * The fixture's DB is the deterministic seed (ADR-0011): a per-run copy of the
 * schema template (built by globalSetup) INSERT-seeded with a fixed, known
 * dataset (courses A/B + the duplicate-warning matrix + filter-status tasks +
 * announcements + files + a calendar event). The dataset is ALWAYS present, so
 * `duplicateSeed` is always available (never null) and no spec needs to skip on
 * missing data.
 *
 * Gates handled:
 *  - single-instance lock: e2e uses its own --user-data-dir, so it never collides
 *    with a real running instance.
 *  - onboarding: isAuthenticated === hasCredential (OS keychain, global), so the
 *    machine must have completed onboarding once (token present in the keychain).
 *  - welcome guide: the fresh profile has empty localStorage, so we set the
 *    onboardingCompleted flag and reload to land directly on the main app.
 *
 * Failure artifacts:
 *  - Playwright's `use: { trace, screenshot }` config does NOT apply to apps
 *    launched via `_electron.launch()` — that context is created manually, not the
 *    managed `page` fixture. So tracing is wired in by hand here: we start tracing
 *    on the Electron app's context right after launch, and on the `page` fixture's
 *    teardown we save+attach a trace.zip + a screenshot ONLY when the test failed
 *    (via `testInfo`). On success we stop tracing WITHOUT saving, to avoid disk
 *    bloat. Net: failures are debuggable, green runs leave no artifacts.
 *
 * Exports:
 *  - `test` / `expect` — the default fixture used by every spec. Exposes
 *    `duplicateSeed` (always present).
 *  - `seededTest` — back-compat alias of `test` (the duplicate matrix is now
 *    always seeded; the old opt-in `seedDuplicates` flag is retired). Kept so
 *    `modal-stack-duplicate.spec.ts`'s import keeps working.
 */
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'path';
import { startMockCanvas, type MockCanvas } from '../mockCanvas';
import { createFixture, type Fixture } from './seed';

type Fixtures = {
  electronApp: ElectronApplication;
  page: Page;
  duplicateSeed: Fixture['duplicateSeed'];
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright parses the fixtures arg and requires an object-destructuring pattern here
  electronApp: async ({}, use) => {
    const mock: MockCanvas = await startMockCanvas();
    const fixture: Fixture = createFixture(mock.url);

    const app = await electron.launch({
      args: [
        path.join(process.cwd(), 'dist', 'main.js'),
        `--user-data-dir=${fixture.userDataDir}`,
      ],
      cwd: fixture.dir,
      env: { ...process.env, NODE_ENV: 'production' },
    });

    // Start tracing on the manually-created Electron context. `use:{trace}` in
    // the config only governs the managed `page` fixture, not `_electron.launch`.
    await app.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

    // Stash the seed markers on the app so the duplicateSeed fixture can read them.
    (app as unknown as { __duplicateSeed: Fixture['duplicateSeed'] }).__duplicateSeed =
      fixture.duplicateSeed;

    await use(app);

    await app.close().catch(() => {});
    await mock.close();
    fixture.cleanup();
  },

  duplicateSeed: async ({ electronApp }, use) => {
    const seed = (electronApp as unknown as { __duplicateSeed: Fixture['duplicateSeed'] })
      .__duplicateSeed;
    await use(seed);
  },

  page: async ({ electronApp }, use, testInfo) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Skip the first-run welcome guide deterministically, then reload so the
    // store re-initializes straight into the main app.
    await page.evaluate(() => localStorage.setItem('onboardingCompleted', 'true'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await use(page);

    // Failure artifacts: only save+attach a trace + screenshot when the test
    // failed. On success, stop tracing without writing anything to disk.
    const failed =
      testInfo.status !== undefined && testInfo.status !== testInfo.expectedStatus;
    if (failed) {
      const tracePath = testInfo.outputPath('trace.zip');
      await electronApp
        .context()
        .tracing.stop({ path: tracePath })
        .catch(() => {});
      await testInfo
        .attach('trace', { path: tracePath, contentType: 'application/zip' })
        .catch(() => {});
      await page
        .screenshot()
        .then((buf) =>
          testInfo.attach('screenshot', { body: buf, contentType: 'image/png' })
        )
        .catch(() => {});
    } else {
      await electronApp
        .context()
        .tracing.stop()
        .catch(() => {});
    }
  },
});

/** Back-compat alias — the duplicate matrix is always seeded now. */
export const seededTest = test;

export { expect } from '@playwright/test';
