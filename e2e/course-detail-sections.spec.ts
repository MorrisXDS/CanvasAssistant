import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

const QUEUE_SCOPE = '[data-focus-scope="course-detail-queue"]';
const QUEUE_KEY = 'focus:course-detail-queue';

/** Find the first course that has queued Canvas tasks; null if none in the seed. */
async function findCourseWithQueue(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const api = (
      window as unknown as {
        api: {
          getCourses: () => Promise<{ id: number }[]>;
          getTaskQueueForCourse: (id: number) => Promise<unknown[]>;
        };
      }
    ).api;
    const courses = await api.getCourses();
    for (const c of courses) {
      const q = await api.getTaskQueueForCourse(c.id);
      if (Array.isArray(q) && q.length > 0) return c.id;
    }
    return null;
  });
}

async function gotoCourse(page: Page, id: number): Promise<void> {
  await page.evaluate((cid) => {
    sessionStorage.clear();
    location.hash = `#/course/${cid}`;
  }, id);
  // Tasks card (with its "Add Task" button) always renders on course detail.
  await page.getByRole('button', { name: 'Add Task' }).waitFor({ state: 'visible' });
}

/**
 * Cycle sections with Q until the Queue section is the active one — detected by
 * the queue focus key responding to S. Returns once focused (queue index '0').
 */
async function focusQueueSection(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.evaluate((k) => sessionStorage.removeItem(k), QUEUE_KEY);
    await page.keyboard.press('s');
    const q = await page.evaluate((k) => sessionStorage.getItem(k), QUEUE_KEY);
    if (q !== null) return;
    await page.keyboard.press('q');
  }
  throw new Error('Queue section never became keyboard-active after cycling');
}

test.describe('Course Detail — Queue section keyboard (item 3)', () => {
  test('Q focuses Queue (auto-expands); W/S walk queued cards', async ({ page }) => {
    const courseId = await findCourseWithQueue(page);
    // The deterministic seed always puts the duplicate-warning matrix on Course A,
    // so a course with queued tasks is guaranteed (ADR-0011).
    expect(courseId).not.toBeNull();

    await gotoCourse(page, courseId as number);
    await focusQueueSection(page);

    // Auto-expanded: queued cards are rendered and focus landed on the first.
    const cards = page.locator(QUEUE_SCOPE);
    await expect(cards.first()).toBeVisible();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), QUEUE_KEY)).toBe('0');

    const count = await cards.count();
    if (count >= 2) {
      await page.keyboard.press('s');
      expect(await page.evaluate((k) => sessionStorage.getItem(k), QUEUE_KEY)).toBe('1');
      await page.keyboard.press('w');
      expect(await page.evaluate((k) => sessionStorage.getItem(k), QUEUE_KEY)).toBe('0');
    }
  });
});

const announceScope = (id: number) => `[data-focus-scope="course-${id}-announcements"]`;
const announceKey = (id: number) => `focus:course-${id}-announcements`;

/** First course whose CourseDetail renders announcement items (DOM-detected). */
async function findCourseWithAnnouncements(page: Page): Promise<number | null> {
  const ids = await page.evaluate(async () => {
    const api = (
      window as unknown as { api: { getCourses: () => Promise<{ id: number }[]> } }
    ).api;
    return (await api.getCourses()).map((c) => c.id);
  });
  for (const id of ids) {
    await gotoCourse(page, id);
    if ((await page.locator(announceScope(id)).count()) > 0) return id;
  }
  return null;
}

/** Cycle with Q until the given scope key responds to S (that section is active). */
async function focusSectionByKey(page: Page, key: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.evaluate((k) => sessionStorage.removeItem(k), key);
    await page.keyboard.press('s');
    if ((await page.evaluate((k) => sessionStorage.getItem(k), key)) !== null) return;
    await page.keyboard.press('q');
  }
  throw new Error(`Section ${key} never became keyboard-active after cycling`);
}

test.describe('Course Detail — Announcements section keyboard (item 4)', () => {
  test('cycle focuses Announcements; W/S walk; Enter opens the announcement', async ({
    page,
  }) => {
    const id = await findCourseWithAnnouncements(page);
    // The deterministic seed always puts >=2 announcements on Course A (ADR-0011).
    expect(id).not.toBeNull();
    const courseId = id as number;

    await focusSectionByKey(page, announceKey(courseId));

    const items = page.locator(announceScope(courseId));
    await expect(items.first()).toBeVisible();
    expect(
      await page.evaluate((k) => sessionStorage.getItem(k), announceKey(courseId))
    ).toBe('0');

    if ((await items.count()) >= 2) {
      await page.keyboard.press('s');
      expect(
        await page.evaluate((k) => sessionStorage.getItem(k), announceKey(courseId))
      ).toBe('1');
      await page.keyboard.press('w');
      expect(
        await page.evaluate((k) => sessionStorage.getItem(k), announceKey(courseId))
      ).toBe('0');
    }

    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => location.hash))
      .toMatch(/^#\/announcement\//);
  });
});

test.describe('Course Detail — Q/E section cycling', () => {
  test('Q/E move keyboard control across ≥2 sections', async ({ page }) => {
    const id = await findCourseWithAnnouncements(page);
    // Course A has Tasks + Queue + Announcements → >=2 sections guaranteed (ADR-0011).
    expect(id).not.toBeNull();
    const courseId = id as number;

    const scopeKeys = [
      'focus:course-detail-tasks',
      'focus:course-detail-queue',
      announceKey(courseId),
    ];

    // Which section currently consumes keys: clear all, press S, see which wrote.
    const activeScope = async (): Promise<string | null> => {
      await page.evaluate(
        (ks) => ks.forEach((k) => sessionStorage.removeItem(k)),
        scopeKeys
      );
      await page.keyboard.press('s');
      return page.evaluate((ks) => {
        for (const k of ks) if (sessionStorage.getItem(k) !== null) return k;
        return null;
      }, scopeKeys);
    };

    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const s = await activeScope();
      if (s) seen.add(s);
      await page.keyboard.press('q');
    }

    // Cycling exposed at least two distinct keyboard-active sections.
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
