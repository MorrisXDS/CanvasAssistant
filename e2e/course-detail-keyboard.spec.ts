import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

const TASK_SCOPE = '[data-focus-scope="course-detail-tasks"]';
const FOCUS_KEY = 'focus:course-detail-tasks';

/**
 * Navigate to the first course (by getCourses order) that actually renders tasks,
 * so the keyboard assertions have rows to operate on. Returns the row count.
 */
async function gotoCourseWithTasks(page: Page): Promise<number> {
  const courseIds = await page.evaluate(async () => {
    const api = (
      window as unknown as { api: { getCourses: () => Promise<{ id: number }[]> } }
    ).api;
    return (await api.getCourses()).map((c) => c.id);
  });
  expect(courseIds.length).toBeGreaterThan(0);

  for (const id of courseIds) {
    await page.evaluate((cid) => {
      sessionStorage.removeItem('focus:course-detail-tasks');
      location.hash = `#/course/${cid}`;
    }, id);
    // Give the route + data fetch a moment, then check for task rows.
    const count = await page
      .locator(TASK_SCOPE)
      .count()
      .catch(() => 0);
    if (count > 0) return count;
    // Brief poll: the store fetch is async after the route change.
    try {
      await page.locator(TASK_SCOPE).first().waitFor({ state: 'visible', timeout: 4000 });
      return await page.locator(TASK_SCOPE).count();
    } catch {
      /* try next course */
    }
  }
  throw new Error('No course in the seeded DB rendered any tasks');
}

const focusIndex = (page: Page) =>
  page.evaluate((k) => sessionStorage.getItem(k), FOCUS_KEY);

test.describe('Course Detail — keyboard', () => {
  test('item 2: W/S walk the focused task (persisted index + outline)', async ({
    page,
  }) => {
    const rows = await gotoCourseWithTasks(page);

    await page.keyboard.press('s');
    expect(await focusIndex(page)).toBe('0');

    if (rows >= 2) {
      await page.keyboard.press('s');
      expect(await focusIndex(page)).toBe('1');
      await page.keyboard.press('w');
      expect(await focusIndex(page)).toBe('0');
    }

    // The focused row (TaskItem marks it with an inline outline, not a class)
    // must be present and carry the matching data-focus-index.
    const focusedRow = page.locator(`${TASK_SCOPE}[data-focus-index="0"]`);
    await expect(focusedRow).toHaveCount(1);
    const outline = await focusedRow.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('item 2: E opens edit; Alt+G→Score, Alt+T→Title; Ctrl+Enter saves', async ({
    page,
  }) => {
    await gotoCourseWithTasks(page);
    await page.keyboard.press('s'); // focus first task

    await page.keyboard.press('e');
    await page.locator('#task-edit-title').waitFor({ state: 'visible', timeout: 5000 });

    // Overloaded Alt keys must resolve to the task-edit fields while editing.
    await page.keyboard.press('Alt+g');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('task-edit-grade');

    await page.keyboard.press('Alt+t');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('task-edit-title');

    // Ctrl+Enter (mod+Enter) saves and closes the editor.
    await page.keyboard.press('Control+Enter');
    await page.locator('#task-edit-title').waitFor({ state: 'detached', timeout: 5000 });
  });

  test('item 1: Ctrl+E opens Settings; Alt+U→Credits; Escape closes it', async ({
    page,
  }) => {
    await gotoCourseWithTasks(page);

    await page.keyboard.press('Control+e');
    await page
      .locator('#course-settings-nickname')
      .waitFor({ state: 'visible', timeout: 5000 });

    await page.keyboard.press('Alt+u');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      'course-settings-credits'
    );

    // The Escape cascade intentionally ignores Escape while focus is in an
    // input, so blur first to exercise the panel-close branch.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    await page
      .locator('#course-settings-nickname')
      .waitFor({ state: 'detached', timeout: 5000 });
  });

  test('item 2: digit keys switch filters (visible rows match the chip count)', async ({
    page,
  }) => {
    await gotoCourseWithTasks(page);

    // Read each chip's count badge: button text is e.g. "Pending 3".
    const counts = await page.evaluate(() => {
      const labels = ['All', 'Pending', 'Submitted', 'Graded', 'Non Graded'];
      const result: Record<string, number> = {};
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const label of labels) {
        const btn = buttons.find((b) => (b.textContent ?? '').trim().startsWith(label));
        const m = (btn?.textContent ?? '').match(/(\d+)\s*$/);
        result[label] = m ? parseInt(m[1], 10) : -1;
      }
      return result;
    });

    // digit -> [chip label, filter key]
    const cases: Array<[string, string]> = [
      ['1', 'All'],
      ['2', 'Pending'],
      ['3', 'Submitted'],
      ['4', 'Graded'],
      ['5', 'Non Graded'],
    ];
    for (const [digit, label] of cases) {
      if (counts[label] < 0) continue; // chip not found; skip defensively
      await page.keyboard.press(digit);
      // Visible task rows should equal the active filter's badge count.
      await expect(page.locator(TASK_SCOPE)).toHaveCount(counts[label]);
    }
  });
});
