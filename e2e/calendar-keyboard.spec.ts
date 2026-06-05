import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

/**
 * Calendar quick-filter keyboard shortcuts. The Calendar keeps filter state internally,
 * so we assert via the "filters active" badge (data-testid="calendar-filter-active"),
 * which renders iff any filter is set — a clean behavioral signal that doesn't depend on
 * which tasks the seeded DB happens to contain.
 */

const badge = (page: Page) => page.locator('[data-testid="calendar-filter-active"]');

async function gotoCalendar(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/calendar';
  });
  await page
    .locator('[data-testid="calendar-page"]')
    .waitFor({ state: 'visible', timeout: 6000 });
  // Hotkeys are document-level but ignore input focus; make sure body holds focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.describe('Calendar — quick-filter shortcuts', () => {
  test('Alt+Shift+D / Alt+Shift+P activate a filter; Alt+Shift+C clears', async ({
    page,
  }) => {
    await gotoCalendar(page);
    await expect(badge(page)).toHaveCount(0); // fresh: no filters active

    await page.keyboard.press('Alt+Shift+D'); // deadline → overdue
    await expect(badge(page)).toHaveCount(1);

    await page.keyboard.press('Alt+Shift+C'); // clear all
    await expect(badge(page)).toHaveCount(0);

    await page.keyboard.press('Alt+Shift+P'); // priority → high
    await expect(badge(page)).toHaveCount(1);

    await page.keyboard.press('Alt+Shift+C');
    await expect(badge(page)).toHaveCount(0);
  });

  // Course-filter toggle is Alt+Shift+1..9 (ADR-0010 / #114). Plain Alt+1..N is
  // reserved for useSectionScope section direct-jump, so it must NOT set a filter.
  test('Alt+Shift+1 toggles a course filter on and off', async ({ page }) => {
    const courseCount = await page.evaluate(
      async () =>
        (
          await (
            window as unknown as { api: { getCourses: () => Promise<unknown[]> } }
          ).api.getCourses()
        ).length
    );
    test.skip(courseCount === 0, 'No courses in the seeded DB');

    await gotoCalendar(page);
    await expect(badge(page)).toHaveCount(0);

    await page.keyboard.press('Alt+Shift+1'); // select first course
    await expect(badge(page)).toHaveCount(1);

    await page.keyboard.press('Alt+Shift+1'); // deselect → no active filter
    await expect(badge(page)).toHaveCount(0);
  });

  test('plain Alt+1 is section direct-jump, not a course filter', async ({ page }) => {
    await gotoCalendar(page);
    await expect(badge(page)).toHaveCount(0);

    // Alt+1 jumps to the (already-active) Calendar section — no filter side effect.
    await page.keyboard.press('Alt+1');
    await expect(badge(page)).toHaveCount(0);
  });
});
