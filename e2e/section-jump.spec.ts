/**
 * Section direct-jump (`Alt+1..N`) coverage via `useSectionScope` + SectionBar.
 * The clean observable is SectionBar's `aria-current="true"` chip (the active
 * section). SectionBar only renders when >1 section is available.
 *
 * - CourseDetail: sections [Tasks, Queue?, Announcements?, Preferences?].
 *   Needs ≥2 available sections to render the bar → discover a course that does,
 *   else skip. Alt+1 = Tasks; Alt+2 = the 2nd available section.
 * - CoursesPage: sections [Courses, Filter?]. Filter is only available once `F`
 *   opens the filter panel. Press F, then Alt+1/Alt+2 move the active chip.
 */
import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';
import {
  getCourses,
  gotoCourse,
  gotoHash,
  sectionBar,
  sectionChipCount,
  expectActiveSection,
} from './helpers';

/** Find a course whose CourseDetail renders ≥2 section chips; null if none. */
async function findCourseWithSections(page: Page): Promise<number | null> {
  const courses = await getCourses(page);
  for (const c of courses.filter((x) => !x.archivedAt)) {
    await gotoCourse(page, c.id);
    if ((await sectionChipCount(page)) >= 2) return c.id;
  }
  return null;
}

test.describe('Section direct-jump (Alt+1..N)', () => {
  test('CourseDetail: Alt+1/Alt+2 move the active section chip', async ({ page }) => {
    const courseId = await findCourseWithSections(page);
    // Course A has Tasks + Queue + Announcements → SectionBar (>=2) guaranteed (ADR-0011).
    expect(courseId).not.toBeNull();

    await gotoCourse(page, courseId as number);
    const bar = sectionBar(page);
    await expect(bar).toBeVisible();

    // The 2nd available chip's label (whatever queue/announcements/prefs landed).
    const secondLabel = (
      await bar.locator('button').nth(1).locator('span').first().textContent()
    )?.trim() as string;
    expect(secondLabel).toBeTruthy();

    // Alt+1 → Tasks (always the first available section).
    await page.keyboard.press('Alt+1');
    await expectActiveSection(page, 'Tasks');

    // Alt+2 → the second available section.
    await page.keyboard.press('Alt+2');
    await expectActiveSection(page, secondLabel);
  });

  test('CoursesPage: F opens Filter, then Alt+1/Alt+2 move the chip', async ({
    page,
  }) => {
    await gotoHash(page, '#/courses');
    // Wait for the Courses page to be interactive.
    await page.locator('[data-focus-scope="courses-page"]').first().waitFor({
      state: 'visible',
      timeout: 6000,
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // F opens the filter panel (Filter section becomes available) AND jumps to it.
    await page.keyboard.press('f');

    const bar = sectionBar(page);
    await expect(bar).toBeVisible();
    await expect.poll(() => sectionChipCount(page)).toBe(2);

    // After F, Filter is active. Alt+1 → Courses, Alt+2 → Filter.
    await page.keyboard.press('Alt+1');
    await expectActiveSection(page, 'Courses');

    await page.keyboard.press('Alt+2');
    await expectActiveSection(page, 'Filter');
  });
});
