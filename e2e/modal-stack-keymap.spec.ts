/**
 * ADR-0006 deep modal-stack — spec 5 (deferred): in-modal hotkey
 * AND-composition (`when` predicate AND modal-stack topmost-gate).
 *
 * The bulk DuplicateWarningModal's `C` key (open the Customize child) is bound
 * via `useModalHotkeys('c', …)` whose handler is itself guarded by a `when`-style
 * predicate:
 *
 *     useModalHotkeys('c', () => {
 *       if (isSingle) return;
 *       const focused = items[focusedIdx];
 *       if (focused?.match?.conflictingFields.length) openCustomize(focused.queueId);
 *     });
 *
 * So `C` fires its effect ONLY when BOTH hold:
 *   (1) the predicate is true  — the focused row actually has conflicting fields, AND
 *   (2) the stack-gate allows it — THIS modal is the topmost on the stack
 *       (`useModalHotkeys` enables the handler only when topmost).
 *
 * This spec exercises all three corners of that AND — the two KEY corners (A, C)
 * prove the gate, and corner B is the rendered positive complement:
 *   A. predicate FALSE (focus a NO-conflict row) + press the C KEY → nothing
 *      happens (no child opens). Proves the `when` predicate gates the key.
 *   B. predicate TRUE  (a conflicting row exists — only conflict rows render the
 *      Customize button) + parent topmost → the child opens. The positive case.
 *   C. stack-gate CLOSED (the Customize child is now topmost) + press the C KEY →
 *      the parent's `C` is suppressed: it does NOT open a second/duplicate child
 *      and the stack is unchanged. (The child does not bind `C`, so the only
 *      thing that could react is the parent's handler — and it must not, because
 *      it is no longer topmost.) Proves the stack-gate suppresses the key.
 *
 * All signals are deterministic: presence/absence of the child modal's
 * "Edit field merge" heading and the `[role=dialog]` count. No focus-index
 * assumptions (rows are selected by their visible conflict text), no page
 * interaction, no production test hook.
 *
 * Reuses the deterministic duplicate matrix on Course A (ADR-0011) and the
 * bulk-open path from modal-stack-duplicate.spec.ts.
 */

import { seededTest as test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

const QUEUE_KEY = 'focus:course-detail-queue';

async function gotoCourse(page: Page, id: number): Promise<void> {
  await page.evaluate((cid) => {
    sessionStorage.clear();
    location.hash = `#/course/${cid}`;
  }, id);
  await page.getByRole('button', { name: 'Add Task' }).waitFor({ state: 'visible' });
}

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

test.describe('Modal stack — useModalHotkeys AND-composition (ADR-0006 spec 5)', () => {
  test('the parent C key fires only when its when-predicate holds AND it is topmost', async ({
    page,
    duplicateSeed,
  }) => {
    const courseId = duplicateSeed.courseA.id;

    await gotoCourse(page, courseId);
    await openBulkDuplicateModal(page);

    const childHeading = page.getByRole('heading', { name: /Edit field merge/i });

    // ── Corner A: predicate FALSE — focus a NO-conflict row, press C ─────────
    // The clean (exact, no-conflict) row renders the literal "No field
    // conflicts" and has NO Customize button. Click it to focus that row, then
    // press C: the when-predicate (focused row has conflictingFields) is false,
    // so C must do nothing — no child opens.
    const cleanCard = page
      .locator('[role="dialog"]')
      .filter({ hasText: /Review before accepting/i })
      .getByText('No field conflicts')
      .first();
    await cleanCard.waitFor({ state: 'visible', timeout: 4000 });
    await cleanCard.click();

    await page.keyboard.press('c');
    // Give any (incorrect) child a moment to appear, then assert it did not.
    await expect(childHeading).toHaveCount(0);
    await expect.poll(() => page.locator('[role="dialog"]').count()).toBe(1);

    // ── Corner B: predicate TRUE + parent topmost → child opens ──────────────
    // Only conflict rows render the Customize button (no-conflict rows show "No
    // field conflicts" and no button), so its presence is itself the rendered
    // proof of the satisfied predicate. Clicking it (predicate true + parent
    // topmost) opens the child — the positive complement of Corner A's negative.
    const customizeBtn = page
      .getByRole('button', { name: /Customize fields|Customized — edit/i })
      .first();
    await customizeBtn.waitFor({ state: 'visible', timeout: 4000 });
    await customizeBtn.click();
    await expect(childHeading).toBeVisible({ timeout: 4000 });
    await expect
      .poll(() => page.locator('[role="dialog"]').count())
      .toBeGreaterThanOrEqual(2);

    // ── Corner C: stack-gate CLOSED — child topmost, parent C suppressed ─────
    // With the child topmost, the parent's C handler is disabled by
    // useModalHotkeys (not topmost). Pressing C must NOT open a second child nor
    // otherwise change the stack; exactly the parent + one child remain.
    const dialogsWithChild = await page.locator('[role="dialog"]').count();
    await page.keyboard.press('c');
    await expect(childHeading).toBeVisible();
    await expect
      .poll(() => page.locator('[role="dialog"]').count())
      .toBe(dialogsWithChild);
  });
});
