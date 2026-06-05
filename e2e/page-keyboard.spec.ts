import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

/**
 * Keyboard focus-navigation coverage for the list pages. Asserts BEHAVIOR via the
 * deterministic `focus:<persistKey>` sessionStorage signal + data-focus-scope rows —
 * never data/counts. The deterministic seed (ADR-0011) guarantees focusable rows on
 * every list page, so the row-count check is a hard precondition (no skipping).
 */

interface PageCfg {
  route: string;
  scope: string; // useFocusedItem persistKey → sessionStorage 'focus:<scope>' + data-focus-scope
  nextKey: string;
  prevKey: string;
  /** Regex the URL hash should match after Enter on a focused row; null = don't test Enter. */
  enterHash: RegExp | null;
}

const PAGES: Record<string, PageCfg> = {
  Courses: {
    route: '#/courses',
    scope: 'courses-page',
    nextKey: 'ArrowRight',
    prevKey: 'ArrowLeft',
    enterHash: /#\/course\//,
  },
  Tasks: {
    route: '#/tasks',
    scope: 'tasks-page',
    nextKey: 'ArrowDown',
    prevKey: 'ArrowUp',
    enterHash: /#\/course\//,
  },
  Announcements: {
    route: '#/announcements',
    scope: 'announcements-page',
    nextKey: 'ArrowDown',
    prevKey: 'ArrowUp',
    enterHash: /#\/announcement\//,
  },
  Updates: {
    route: '#/updates',
    scope: 'updates-page',
    nextKey: 'ArrowRight',
    prevKey: 'ArrowLeft',
    enterHash: null,
  },
};

const focusKey = (scope: string) => `focus:${scope}`;
const readFocus = (page: Page, scope: string) =>
  page.evaluate((k) => sessionStorage.getItem(k), focusKey(scope));

/** Navigate to a page, reset its focus, ensure body focus. Returns rendered row count (0 = empty). */
async function gotoPage(page: Page, cfg: PageCfg): Promise<number> {
  await page.evaluate(
    ({ route, key }) => {
      sessionStorage.removeItem(key);
      location.hash = route;
    },
    { route: cfg.route, key: focusKey(cfg.scope) }
  );
  const rows = page.locator(`[data-focus-scope="${cfg.scope}"]`);
  try {
    await rows.first().waitFor({ state: 'visible', timeout: 6000 });
  } catch {
    return 0;
  }
  // Make sure no search input stole focus (hotkeys ignore form-tag focus).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return rows.count();
}

for (const [name, cfg] of Object.entries(PAGES)) {
  test.describe(`${name} page — keyboard`, () => {
    test('focus navigation walks rows (persisted index)', async ({ page }) => {
      const count = await gotoPage(page, cfg);
      // The deterministic seed guarantees focusable rows on every list page
      // (>=2 courses, >=5 tasks, >=2 announcements, queued updates) — ADR-0011.
      expect(count).toBeGreaterThan(0);

      // Nav style varies per page (vertical list vs 2D grid), so assert the
      // invariant — focus engages, moves on next, returns on prev — not exact indices.
      await page.keyboard.press(cfg.nextKey);
      const first = await readFocus(page, cfg.scope);
      expect(first).not.toBeNull();
      await expect(
        page.locator(`[data-focus-scope="${cfg.scope}"][data-focus-index="${first}"]`)
      ).toHaveCount(1);

      if (count >= 2) {
        await page.keyboard.press(cfg.nextKey);
        const second = await readFocus(page, cfg.scope);
        expect(second).not.toBe(first);
        await page.keyboard.press(cfg.prevKey);
        expect(await readFocus(page, cfg.scope)).toBe(first);
      }
    });

    if (cfg.enterHash) {
      test('Enter on a focused row navigates to its detail', async ({ page }) => {
        const count = await gotoPage(page, cfg);
        // The deterministic seed guarantees focusable rows on every list page (ADR-0011).
        expect(count).toBeGreaterThan(0);

        await page.keyboard.press(cfg.nextKey); // focus row 0
        await page.keyboard.press('Enter');
        await expect
          .poll(() => page.evaluate(() => location.hash))
          .toMatch(cfg.enterHash!);
      });
    }
  });
}
