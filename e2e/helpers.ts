/**
 * Shared e2e helpers — discovery + navigation + focus-signal probes reused
 * across the route-gap, section-jump and mutation specs.
 *
 * These factor the patterns the original specs grew independently
 * (`gotoCourse`/`focusKey`/`readFocus` from `page-keyboard.spec.ts` +
 * `course-detail-sections.spec.ts`) into one place so new specs don't
 * re-derive them. The existing specs are intentionally NOT rewritten here —
 * they can adopt these opportunistically later.
 *
 * Everything is data-tolerant: discovery helpers reach through `window.api.*`
 * (the same surface the renderer uses) and return `null`/`0` so callers can
 * `test.skip(...)` when the copied DB lacks the entity, mirroring the existing
 * suite's posture.
 */

import { expect } from './fixtures/app';
import type { Page } from '@playwright/test';

/** All visible (non-archived/hidden/term-filtered) courses. */
export function getCourses(
  page: Page
): Promise<Array<{ id: number; archivedAt: string | null }>> {
  return page.evaluate(async () => {
    const api = (
      window as unknown as {
        api: {
          getCourses: () => Promise<Array<{ id: number; archivedAt: string | null }>>;
        };
      }
    ).api;
    return api.getCourses();
  });
}

/** First visible course id, or null when the seed has none. */
export async function firstCourseId(page: Page): Promise<number | null> {
  const courses = await getCourses(page);
  return courses[0]?.id ?? null;
}

/** First visible non-archived course id, or null. */
export async function firstActiveCourseId(page: Page): Promise<number | null> {
  const courses = await getCourses(page);
  return courses.find((c) => !c.archivedAt)?.id ?? null;
}

/**
 * Navigate to a course detail page and wait for it to be interactive
 * (the always-present "Add Task" button on the Tasks card).
 */
export async function gotoCourse(page: Page, id: number): Promise<void> {
  await page.evaluate((cid) => {
    sessionStorage.clear();
    location.hash = `#/course/${cid}`;
  }, id);
  await page.getByRole('button', { name: 'Add Task' }).waitFor({ state: 'visible' });
}

/** Navigate to a top-level hash route and wait for the document to settle. */
export async function gotoHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

export const focusKey = (scope: string) => `focus:${scope}`;
export const readFocus = (page: Page, scope: string) =>
  page.evaluate((k) => sessionStorage.getItem(k), focusKey(scope));

/**
 * The SectionBar (`role="group"`) rendered by `useSectionScope` consumers.
 * Only present when >1 section is available.
 */
export function sectionBar(page: Page) {
  return page
    .locator('[role="group"]')
    .filter({ has: page.locator('kbd') })
    .first();
}

/** Count of available section chips in the SectionBar (0 when absent). */
export async function sectionChipCount(page: Page): Promise<number> {
  const bar = sectionBar(page);
  if ((await bar.count()) === 0) return 0;
  return bar.locator('button').count();
}

/**
 * The label text of the currently-active section chip (`aria-current="true"`).
 * Retrying assertion-friendly: pair with `expect.poll`.
 */
export async function activeSectionLabel(page: Page): Promise<string | null> {
  const chip = sectionBar(page).locator('button[aria-current="true"]').first();
  if ((await chip.count()) === 0) return null;
  // The chip contains a <span>label</span> + a <kbd>Alt+N</kbd>; read the span.
  return (await chip.locator('span').first().textContent())?.trim() ?? null;
}

/** Assert (with retry) that the active section chip label equals `label`. */
export async function expectActiveSection(page: Page, label: string): Promise<void> {
  await expect.poll(() => activeSectionLabel(page), { timeout: 4000 }).toBe(label);
}
