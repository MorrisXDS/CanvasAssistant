/**
 * capture-screenshots.spec.ts — regenerates the README screenshots from a
 * realistic SYNTHETIC demo seed (no real Canvas data). Runs under the
 * `screenshots` Playwright project ONLY:
 *
 *   npm run capture:screens
 *
 * Sets CID_E2E_SEED=demo (module scope, before the fixture imports) so the
 * fixture seeds e2e/fixtures/seedDatabaseDemo.js. Writes PNGs straight into
 * assets/screenshots/, overwriting the old (masked-real-data) ones.
 */

process.env.CID_E2E_SEED = 'demo';

import { test } from './fixtures/app';
import path from 'path';

const OUT = path.join(process.cwd(), 'assets', 'screenshots');
const W = 1560;
const H = 1040;

test('capture README screenshots from the demo seed', async ({ page, electronApp }) => {
  // Resize the real Electron window to a consistent capture size.
  await electronApp.evaluate(
    ({ BrowserWindow }, { w, h }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.setContentSize(w, h);
        win.center();
      }
    },
    { w: W, h: H }
  );
  await page.waitForTimeout(300);

  const shoot = async (
    route: string,
    file: string,
    waitFor: () => Promise<void>
  ): Promise<void> => {
    await page.evaluate((r) => {
      location.hash = r;
    }, route);
    await waitFor();
    // Let charts / async data settle before the shot.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, file) });
  };

  await shoot('#/', 'dashboard.png', async () => {
    await page.waitForSelector('h1', { state: 'visible', timeout: 8000 });
  });

  await shoot('#/calendar', 'calendar.png', async () => {
    await page
      .locator('[data-testid="calendar-page"]')
      .waitFor({ state: 'visible', timeout: 8000 });
  });

  await shoot('#/courses', 'courses.png', async () => {
    await page
      .getByText('Algorithm Design', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 8000 });
  });

  // Files: expand the first course (and a folder inside it) so the tree shows
  // actual files rather than a list of collapsed courses.
  await page.evaluate(() => {
    location.hash = '#/files';
  });
  await page
    .getByText('Algorithm Design & Analysis', { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 8000 });
  await page.getByText('Algorithm Design & Analysis', { exact: false }).first().click();
  await page.waitForTimeout(500);
  // Expand the first folder (e.g. "Lectures") if present, to reveal a file row.
  const folder = page.getByText('Lectures', { exact: false }).first();
  if (await folder.count().catch(() => 0)) {
    await folder.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'files.png') });

  await shoot('#/settings', 'settings.png', async () => {
    await page.waitForSelector('h2', { state: 'visible', timeout: 8000 });
  });
});
