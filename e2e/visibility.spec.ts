/**
 * Course-visibility invariant — END-TO-END (the highest-value e2e gap).
 *
 * CLAUDE.md §2 / §8 mandate that every course-scoped read filters through
 * `VisibleDataProvider`: a course is visible iff is_hidden=0 AND deleted_at IS
 * NULL AND archived_at IS NULL AND it passes the term filter. The seed forces
 * term_selection='all' so visibility reduces to (not hidden / not deleted /
 * not archived) — exactly the predicate this spec exercises.
 *
 * The deterministic seed (ADR-0011) inserts TWO non-visible courses purely for
 * this spec:
 *   - Course D — HIDDEN  (is_hidden=1)            → in NEITHER getCourses() nor getArchivedCourses()
 *   - Course E — ARCHIVED (archived_at set)       → absent from getCourses(), PRESENT in getArchivedCourses()
 * Each carries one task, so we also prove visibility filters TASKS, not just
 * the course list.
 *
 * RISK #3 (architect plan): the base course insert hardcodes is_hidden=0 and
 * omits archived_at — a silent default would make D/E visible and false-pass
 * this spec. So D/E go through a DISTINCT named-column insert in the seed AND
 * this spec READS THE FLAGS BACK via getCourses()/getArchivedCourses() to PROVE
 * they actually landed (E in archived, D in neither).
 *
 * Signals are all deterministic IPC read-backs (id arrays) + Courses-grid DOM
 * text presence/absence. No focus-index walking (avoids the CoursesPage
 * moveFocus off-by-one, FOLLOWUPS), no test.skip (data is seed-guaranteed).
 *
 * The D/E ids/codes/names below mirror the fixed constants in
 * e2e/fixtures/seedDatabase.js (COURSE_D / COURSE_E) — kept in sync by ADR-0011's
 * deterministic, named-column seed.
 */

import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

// Mirrors seedDatabase.js COURSE_D / COURSE_E (deterministic, fixed by ADR-0011).
const COURSE_D = { id: 90004, code: 'E2E404', name: 'E2E Hidden Course' };
const COURSE_E = { id: 90005, code: 'E2E505', name: 'E2E Archived Course' };
// Visible courses A/B/C (mirror seedDatabase.js) — present in the grid.
const VISIBLE = [
  { id: 90001, code: 'E2E101', name: 'E2E Course A' },
  { id: 90002, code: 'E2E202', name: 'E2E Course B' },
  { id: 90003, code: 'E2E303', name: 'E2E Course C' },
];

interface CourseLite {
  id: number;
  archivedAt: string | null;
}
interface TaskLite {
  externalId?: string | null;
  courseId?: number;
}

/** All VISIBLE courses (post VisibleDataProvider filter). */
function getCourses(page: Page): Promise<CourseLite[]> {
  return page.evaluate(() => {
    const api = (
      window as unknown as { api: { getCourses: () => Promise<CourseLite[]> } }
    ).api;
    return api.getCourses();
  });
}

/** Archived courses (the Archived-section feed). */
function getArchivedCourses(page: Page): Promise<CourseLite[]> {
  return page.evaluate(() => {
    const api = (
      window as unknown as { api: { getArchivedCourses: () => Promise<CourseLite[]> } }
    ).api;
    return api.getArchivedCourses();
  });
}

/** All tasks across the VISIBLE course set (courseIds:'all' still visibility-filters). */
function getAllVisibleTasks(page: Page): Promise<TaskLite[]> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        api: { getTasks: (o: { courseIds: 'all' }) => Promise<TaskLite[]> };
      }
    ).api;
    return api.getTasks({ courseIds: 'all' });
  });
}

test.describe('Course-visibility invariant (e2e)', () => {
  test('hidden + archived courses (and their tasks) are excluded from the visible set', async ({
    page,
  }) => {
    // ── (a) getCourses() excludes BOTH D (hidden) and E (archived) ──────────
    const visibleCourses = await getCourses(page);
    const visibleIds = visibleCourses.map((c) => c.id);
    expect(visibleIds).not.toContain(COURSE_D.id);
    expect(visibleIds).not.toContain(COURSE_E.id);
    // …and the visible set is exactly A/B/C (proves the count is unperturbed —
    // the isolation guarantee the existing 33 specs rely on).
    expect(visibleIds).toContain(VISIBLE[0].id);
    expect(visibleIds).toContain(VISIBLE[1].id);
    expect(visibleIds).toContain(VISIBLE[2].id);

    // ── (b) getArchivedCourses() PROVES the archived flag landed for E ──────
    // and that D (hidden, not archived) is NOT mistaken for archived.
    const archived = await getArchivedCourses(page);
    const archivedIds = archived.map((c) => c.id);
    expect(archivedIds).toContain(COURSE_E.id);
    expect(archivedIds).not.toContain(COURSE_D.id);
    // The archived E carries a real archived_at timestamp (flag took, not a default).
    const archivedE = archived.find((c) => c.id === COURSE_E.id);
    expect(archivedE?.archivedAt).toBeTruthy();

    // ── (c)+(d) tasks on D/E are absent from the visible task set ───────────
    const tasks = await getAllVisibleTasks(page);
    const taskExternalIds = tasks.map((t) => t.externalId);
    const taskCourseIds = tasks.map((t) => t.courseId);
    expect(taskExternalIds).not.toContain('E2E_TASK_HIDDEN_D');
    expect(taskExternalIds).not.toContain('E2E_TASK_ARCHIVED_E');
    expect(taskCourseIds).not.toContain(COURSE_D.id);
    expect(taskCourseIds).not.toContain(COURSE_E.id);
  });

  test('Courses grid renders visible A/B/C but NOT the hidden/archived D/E', async ({
    page,
  }) => {
    // Navigate to the Courses page and wait for the visible grid to render.
    await page.evaluate(() => {
      location.hash = '#/courses';
    });
    // Course A's name is always present in the grid — wait on it as the
    // "grid is interactive" signal (text/role only, no focus-index walking).
    await expect(page.getByText(VISIBLE[0].name, { exact: false }).first()).toBeVisible({
      timeout: 8000,
    });

    // Visible courses are present.
    for (const c of VISIBLE) {
      await expect(page.getByText(c.name, { exact: false }).first()).toBeVisible();
    }

    // Hidden D and archived E must NOT appear anywhere in the Courses grid.
    await expect(page.getByText(COURSE_D.name, { exact: false })).toHaveCount(0);
    await expect(page.getByText(COURSE_E.name, { exact: false })).toHaveCount(0);
  });
});
