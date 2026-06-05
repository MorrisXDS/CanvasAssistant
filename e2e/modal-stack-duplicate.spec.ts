/**
 * ADR-0006 deep modal-stack specs (specs 1 + 3 from docs/FOLLOWUPS.md
 * "Deeper e2e coverage for modal-stack-aware hotkeys").
 *
 * These upgrade the synthetic anchors in `modal-stack.spec.ts` to real,
 * populated-state behavioral assertions using the deterministic duplicate-warning
 * matrix, which the unified seed always applies to Course A (ADR-0011) and exposes
 * via the always-present `duplicateSeed` fixture — see e2e/fixtures/seed.ts.
 *
 *   Spec 1 — page-leak: with the bulk DuplicateWarningModal open, a page-level
 *     `Q` (CourseDetail section cycle, owned by useSectionScope) is gated off by
 *     useStackAwareHotkeys, so the section behind the modal does NOT cycle. We
 *     snapshot the three CourseDetail section `focus:*` sessionStorage keys,
 *     press `q`, and assert they are unchanged AND the modal is still open.
 *
 *   Spec 3 — scroll-suppression (real flow): with the modal open, the
 *     ModalStackProvider's capture-phase listener preventDefault()s ArrowDown so
 *     the page's `<main>` scroll container does not move. We read `<main>`
 *     scrollTop, press ArrowDown ×10, and assert scrollTop is unchanged AND the
 *     modal is still open.
 *
 * Both open the modal via the BULK path (`shift+a` → "Accept All" ConfirmDialog →
 * confirm → bulk DuplicateWarningModal). The bulk path is deterministic regardless
 * of the store's render order (the single-`a` accept path requires a duplicate-
 * matched card at focus index 0). Course A's seed has 6 matched items, so the bulk
 * modal always opens.
 *
 * Verified empirically on the Windows dev machine (the seed runs under
 * Electron-as-Node so it shares the launched app's Electron ABI — see seed.ts).
 */

import { seededTest as test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

const QUEUE_KEY = 'focus:course-detail-queue';
const TASKS_KEY = 'focus:course-detail-tasks';
const announceKey = (id: number) => `focus:course-${id}-announcements`;

/** Navigate to a course detail page and wait for its always-present Add Task button. */
async function gotoCourse(page: Page, id: number): Promise<void> {
  await page.evaluate((cid) => {
    sessionStorage.clear();
    location.hash = `#/course/${cid}`;
  }, id);
  await page.getByRole('button', { name: 'Add Task' }).waitFor({ state: 'visible' });
}

/**
 * Cycle sections with Q until the Queue section is keyboard-active — detected by
 * the queue focus key responding to S. Returns once a queued card is focused.
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

/**
 * Open the bulk DuplicateWarningModal: focus Queue → `shift+a` opens the
 * "Accept All Tasks" ConfirmDialog → click "Accept All" → the bulk
 * DuplicateWarningModal mounts (role="dialog").
 */
async function openBulkDuplicateModal(page: Page): Promise<void> {
  await focusQueueSection(page);
  await page.keyboard.press('Shift+A');

  // ConfirmDialog ("Accept All Tasks") mounts as role="dialog". Its confirm button
  // reads "Accept All" — scope to the dialog to disambiguate from the section
  // header's own "Accept All" bulk-accept button (same accessible name).
  const confirmDialog = page.locator('[role="dialog"]');
  await confirmDialog.first().waitFor({ state: 'visible', timeout: 4000 });
  const confirmBtn = confirmDialog.getByRole('button', { name: 'Accept All' });
  await confirmBtn.waitFor({ state: 'visible', timeout: 4000 });
  await confirmBtn.click();

  // The ConfirmDialog closes; gatedBulkAccept then opens the bulk
  // DuplicateWarningModal (Course A has 6 matched items). Its header reads
  // "Review before accepting (N items)" — poll for that specific marker so we
  // don't false-pass on the transient between the two dialogs.
  await expect(
    page.getByRole('heading', { name: /Review before accepting/i })
  ).toBeVisible({ timeout: 8000 });
}

/** Read the current values of the three CourseDetail section focus keys. */
async function snapshotSectionFocus(
  page: Page,
  courseId: number
): Promise<Record<string, string | null>> {
  return page.evaluate(
    (keys) => {
      const out: Record<string, string | null> = {};
      for (const k of keys) out[k] = sessionStorage.getItem(k);
      return out;
    },
    [TASKS_KEY, QUEUE_KEY, announceKey(courseId)]
  );
}

test.describe('Modal stack — deep (ADR-0006 specs 1 + 3)', () => {
  test('Spec 1: page-level Q does NOT cycle the section behind the duplicate modal', async ({
    page,
    duplicateSeed,
  }) => {
    // The deterministic seed always applies the duplicate matrix to Course A (ADR-0011).
    const courseId = duplicateSeed.courseA.id;

    await gotoCourse(page, courseId);
    await openBulkDuplicateModal(page);

    // Snapshot the section focus keys BEFORE pressing Q.
    const before = await snapshotSectionFocus(page, courseId);

    // Page-level Q is gated off by useStackAwareHotkeys while a modal is open.
    await page.keyboard.press('q');

    // The modal must still be open (Q didn't dismiss it) and the section behind
    // it must not have cycled (focus keys unchanged).
    await expect
      .poll(() => page.locator('[role="dialog"]').count())
      .toBeGreaterThanOrEqual(1);

    const after = await snapshotSectionFocus(page, courseId);
    expect(after).toEqual(before);
  });

  test('Spec 3: ArrowDown does NOT scroll the page <main> while the duplicate modal is open', async ({
    page,
    duplicateSeed,
  }) => {
    // The deterministic seed always applies the duplicate matrix to Course A (ADR-0011).
    const courseId = duplicateSeed.courseA.id;

    await gotoCourse(page, courseId);
    await openBulkDuplicateModal(page);

    const main = page.locator('main');
    const before = await main.evaluate((el) => el.scrollTop);

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // The page-behind <main> must not have scrolled (capture-phase suppression),
    // and the modal must still be open (ArrowDowns didn't dismiss it).
    await expect
      .poll(() => page.locator('[role="dialog"]').count())
      .toBeGreaterThanOrEqual(1);

    const after = await main.evaluate((el) => el.scrollTop);
    expect(after).toBe(before);
  });
});
