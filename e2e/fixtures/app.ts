/**
 * Playwright fixture that launches the built Electron app against an isolated,
 * offline fixture profile and hands tests the renderer page on the main UI.
 *
 * Gates handled:
 *  - single-instance lock: e2e uses its own --user-data-dir, so it never collides
 *    with a real running instance.
 *  - onboarding: isAuthenticated === hasCredential (OS keychain, global), so the
 *    machine must have completed onboarding once (token present in the keychain).
 *  - welcome guide: the fresh profile has empty localStorage, so we set the
 *    onboardingCompleted flag and reload to land directly on the main app.
 *
 * Two exports:
 *  - `test` / `expect` — the default un-seeded fixture used by every existing spec.
 *  - `seededTest` — a variant that requests `seedDuplicates: true` and exposes the
 *    seeded course markers as the `duplicateSeed` fixture. Used ONLY by
 *    `modal-stack-duplicate.spec.ts`; the default `test` is untouched so existing
 *    specs behave identically.
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
};

/**
 * Build a Playwright test object whose Electron app is launched against a fixture
 * created with the given options. Factored so the default (un-seeded) and the
 * duplicate-seeded variants share one launch path.
 */
function makeTest(seedDuplicates: boolean) {
  return base.extend<Fixtures & { duplicateSeed: Fixture['duplicateSeed'] }>({
    // eslint-disable-next-line no-empty-pattern -- Playwright parses the fixtures arg and requires an object-destructuring pattern here
    duplicateSeed: async ({}, use) => {
      // Replaced per-app below via the electronApp fixture; this default is only
      // used if a spec reads duplicateSeed without launching (it never does).
      await use(null);
    },

    // eslint-disable-next-line no-empty-pattern -- Playwright parses the fixtures arg and requires an object-destructuring pattern here
    electronApp: async ({}, use) => {
      const mock: MockCanvas = await startMockCanvas();
      const fixture: Fixture = createFixture(mock.url, { seedDuplicates });

      const app = await electron.launch({
        args: [
          path.join(process.cwd(), 'dist', 'main.js'),
          `--user-data-dir=${fixture.userDataDir}`,
        ],
        cwd: fixture.dir,
        env: { ...process.env, NODE_ENV: 'production' },
      });

      // Stash the seed markers on the app so the duplicateSeed fixture (overridden
      // below in seededTest) can read them. Plain property — no Playwright option.
      (app as unknown as { __duplicateSeed: Fixture['duplicateSeed'] }).__duplicateSeed =
        fixture.duplicateSeed;

      await use(app);

      await app.close().catch(() => {});
      await mock.close();
      fixture.cleanup();
    },

    page: async ({ electronApp }, use) => {
      const page = await electronApp.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Skip the first-run welcome guide deterministically, then reload so the
      // store re-initializes straight into the main app.
      await page.evaluate(() => localStorage.setItem('onboardingCompleted', 'true'));
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await use(page);
    },
  });
}

export const test = makeTest(false);

/**
 * Seeded variant: launches with the duplicate-warning matrix applied to the DB
 * copy and exposes the seeded course ids/codes via `duplicateSeed` (null when the
 * copied DB had no visible courses → the spec should test.skip).
 */
export const seededTest = makeTest(true).extend<{
  duplicateSeed: Fixture['duplicateSeed'];
}>({
  duplicateSeed: async ({ electronApp }, use) => {
    const seed = (electronApp as unknown as { __duplicateSeed: Fixture['duplicateSeed'] })
      .__duplicateSeed;
    await use(seed ?? null);
  },
});

export { expect } from '@playwright/test';
