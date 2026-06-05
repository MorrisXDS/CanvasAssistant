/**
 * ADR-0006 deep modal-stack — spec 2 (deferred): nested Customize-child leak.
 *
 * Completes the modal-stack story alongside modal-stack-duplicate.spec.ts
 * (specs 1 + 3). Here we open a THIRD layer of the stack: the bulk
 * DuplicateWarningModal (zIndex 1100) → its per-item "Customize fields" child
 * modal (zIndex 1200) — and prove that a key the CHILD owns acts on the CHILD
 * only, never leaking down to the parent bulk modal behind it nor to the
 * CourseDetail page two layers below.
 *
 * Concretely: the Customize child binds `E` → "Use ALL your task values"
 * (`pickAll('user')` — see DuplicateWarningModal.tsx CustomizeHotkeys). The
 * field defaults are all-Canvas, so pressing `E` flips them to user — which the
 * parent bulk row reflects with a visible "(customized)" badge. We assert:
 *   - the child stays open (its [role=dialog] is still topmost),
 *   - the press took effect ON THE CHILD (the focused row now shows the
 *     "(customized)" marker, proving the child handled `E`),
 *   - the parent's CourseDetail section focus keys behind BOTH modals are
 *     unchanged (no page-section cycle leaked through),
 *   - both modals remain on the stack ([role=dialog] count stays >= 2).
 *
 * Reuses the deterministic duplicate matrix on Course A (ADR-0011) and the
 * exact bulk-open path from modal-stack-duplicate.spec.ts.
 *
 * Verified empirically on the Windows dev machine (seed runs under
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

/** Open the bulk DuplicateWarningModal (header "Review before accepting (N items)"). */
async function openBulkDuplicateModal(page: Page): Promise<void> {
  await focusQueueSection(page);
  await page.keyboard.press('Shift+A');

  const confirmDialog = page.locator('[role="dialog"]');
  await confirmDialog.first().waitFor({ state: 'visible', timeout: 4000 });
  const confirmBtn = confirmDialog.getByRole('button', { name: 'Accept All' });
  await confirmBtn.waitFor({ state: 'visible', timeout: 4000 });
  await confirmBtn.click();

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

test.describe('Modal stack — nested Customize child (ADR-0006 spec 2)', () => {
  test('a key the Customize child owns (E) acts on the child, not the parent/page behind it', async ({
    page,
    duplicateSeed,
  }) => {
    const courseId = duplicateSeed.courseA.id;

    await gotoCourse(page, courseId);
    await openBulkDuplicateModal(page);

    // Open the per-item Customize child. Only items WITH conflicting fields
    // render the Customize button (cards without conflicts show "No field
    // conflicts" and no button) — Course A's matrix guarantees several
    // conflicting items. Click the first such button to (a) set that row's
    // focus and (b) open the child modal deterministically (no reliance on the
    // store's render order or a focus-index walk).
    const customizeBtn = page
      .getByRole('button', { name: /Customize fields|Customized — edit/i })
      .first();
    await customizeBtn.waitFor({ state: 'visible', timeout: 4000 });
    await customizeBtn.click();

    // The child modal mounts above the parent (zIndex 1200 > 1100). Its header
    // reads "Edit field merge — <title>". Wait for it as the "child is topmost"
    // signal.
    const childHeading = page.getByRole('heading', { name: /Edit field merge/i });
    await expect(childHeading).toBeVisible({ timeout: 4000 });

    // Both modals are on the stack now (parent bulk + Customize child).
    await expect
      .poll(() => page.locator('[role="dialog"]').count())
      .toBeGreaterThanOrEqual(2);

    // Snapshot the page's CourseDetail section focus keys BEFORE the key press.
    // These must NOT move (the page is two layers down, fully gated).
    const beforePageFocus = await snapshotSectionFocus(page, courseId);

    // Pre-condition: no "(customized)" marker yet (defaults are all-Canvas).
    await expect(page.getByText('(customized)')).toHaveCount(0);

    // Press E — owned by the CHILD (pickAll('user')). It must act on the child,
    // flipping its fields to the user's values, NOT cycle a section behind it.
    await page.keyboard.press('e');

    // The child handled E: the parent bulk row now shows the "(customized)"
    // badge (isCustomized() is true once any conflicting field != 'canvas').
    await expect(page.getByText('(customized)').first()).toBeVisible({ timeout: 4000 });

    // The child stays open (E didn't dismiss it) and both modals remain stacked.
    await expect(childHeading).toBeVisible();
    await expect
      .poll(() => page.locator('[role="dialog"]').count())
      .toBeGreaterThanOrEqual(2);

    // The CourseDetail section focus behind both modals never moved.
    const afterPageFocus = await snapshotSectionFocus(page, courseId);
    expect(afterPageFocus).toEqual(beforePageFocus);
  });
});
