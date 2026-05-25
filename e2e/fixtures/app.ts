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

export const test = base.extend<Fixtures>({
  electronApp: async (_deps, use) => {
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

export { expect } from '@playwright/test';
