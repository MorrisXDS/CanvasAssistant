/**
 * ADR-0006 anchor tests — the modal-stack-aware hotkey foundation.
 *
 * These two specs lock in the *simple* properties of ModalStackContext that
 * don't need fixture-level seeding to verify. Deeper bug-class coverage
 * (DuplicateWarningModal page-leak, Customize-child nested-leak, full
 * scroll-suppression on a populated Tasks Section) is captured in
 * `docs/FOLLOWUPS.md` and depends on shared seed infrastructure that the
 * fixture and `scripts/manual-test-duplicate-warning.js` don't currently
 * share.
 *
 * What's covered here:
 *
 *   1. Help-modal-shows-modal-shortcuts:
 *      Opening the Archive ConfirmDialog (mod+shift+a) then pressing `?`
 *      shows the help modal with Tab 1 labeled "Confirm dialog" — the
 *      topmost OTHER modal's `shortcuts.title`, not the page's. Proves the
 *      <Modal shortcuts={...}> registration + KeyboardShortcutsModal's
 *      stack-walk lookup.
 *
 *   2. Arrow-key default-prevented while modal is open:
 *      With at least one modal on the stack, the ModalStackProvider's
 *      capture-phase keydown listener calls preventDefault() on
 *      ArrowUp/Down/Left/Right (and PageUp/Down/Home/End) so the browser's
 *      built-in scroll behavior doesn't fire on the page underneath.
 */

import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

/**
 * Navigate to the first non-archived course in the seeded DB. ConfirmDialog
 * via mod+shift+a requires a non-archived course.
 */
async function gotoFirstActiveCourse(page: Page): Promise<void> {
  const courseId = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        api: {
          getCourses: () => Promise<Array<{ id: number; archivedAt: string | null }>>;
        };
      }
    ).api;
    const courses = await api.getCourses();
    const active = courses.find((c) => !c.archivedAt);
    return active?.id ?? null;
  });
  expect(courseId).not.toBeNull();
  await page.evaluate((cid) => {
    location.hash = `#/course/${cid}`;
  }, courseId as number);
  // Wait for the course header to render — proxy for "page is interactive."
  await page.waitForSelector('h1', { state: 'visible', timeout: 5000 });
}

test.describe('Modal stack — ADR-0006', () => {
  test("Help shows the topmost modal's ShortcutCategory, not the page's", async ({
    page,
  }) => {
    await gotoFirstActiveCourse(page);

    // Open the Archive confirmation. CourseDetail's `nav` keymap binds
    // `mod+shift+a` to setConfirmDialog({...type:'warning'}), which renders
    // ConfirmDialog — registered as a Modal with shortcuts={CONFIRM_DIALOG_SHORTCUTS}.
    await page.keyboard.press('Control+Shift+KeyA');

    // ConfirmDialog rendered as role="dialog". Wait for it.
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 3000 });

    // Open the help modal. `?` is the Layout-level handler for help.
    await page.keyboard.press('Shift+Slash');

    // Two dialogs now on screen — wait for at least 2.
    await page.waitForFunction(
      () => document.querySelectorAll('[role="dialog"]').length >= 2,
      { timeout: 3000 }
    );

    // Help modal's Tab 1 should be labeled with the topmost-OTHER modal's
    // category title — "Confirm dialog" from CONFIRM_DIALOG_SHORTCUTS.
    // The tab is a role="tab" button inside the help dialog.
    //
    // Use a retrying assertion (not a one-shot textContent): the Help modal's
    // first render can momentarily show the page scope ("Course Detail") before
    // it re-renders with the resolved modal-stack category. A one-shot read can
    // catch that pre-settle frame; `toHaveText` polls until it settles.
    await expect(page.locator('[role="tab"][aria-selected="true"]').first()).toHaveText(
      'Confirm dialog'
    );
  });

  test('Arrow-key browser scroll is preventDefault()-ed while a modal is open', async ({
    page,
  }) => {
    await gotoFirstActiveCourse(page);

    // Note: we deliberately don't assert a baseline "no modal => not
    // prevented" here, because the page's own list-keyboard handlers
    // (useFocusedItem) legitimately call preventDefault() on ArrowDown to
    // suppress browser scroll while they walk the list. That makes the
    // baseline state already-prevented and uninteresting for this test.
    //
    // What we DO assert: with a modal open, page-level arrow handlers are
    // gated off by useStackAwareHotkeys (so they no longer preventDefault),
    // but the ModalStackProvider's capture-phase listener takes over and
    // preventDefault()s them anyway — preserving scroll suppression.

    // Open a modal. `?` opens the help modal — itself a Modal, pushes onto stack.
    await page.keyboard.press('Shift+Slash');
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 3000 });

    // With the modal on the stack, the synthetic ArrowDown's
    // `defaultPrevented` should be true — set by ModalStackProvider's
    // capture-phase listener.
    const withModalPrevented = await dispatchArrowAndCheckPrevented(page);
    expect(withModalPrevented).toBe(true);
  });
});

/**
 * Dispatches a synthetic ArrowDown keydown on document.body and returns
 * whether `defaultPrevented` was true after our capture-phase listener ran.
 *
 * Synthetic events don't trigger native scrolling, but they DO flow through
 * all `addEventListener` callbacks including capture-phase. A bubble-phase
 * listener attached fresh after dispatching can observe the
 * `defaultPrevented` flag set by our capture-phase preventDefault().
 */
async function dispatchArrowAndCheckPrevented(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return new Promise<boolean>((resolve) => {
      // Bubble-phase listener — runs AFTER ModalStackProvider's capture listener.
      const observer = (e: KeyboardEvent) => {
        if (e.key !== 'ArrowDown') return;
        document.removeEventListener('keydown', observer);
        resolve(e.defaultPrevented);
      };
      document.addEventListener('keydown', observer);
      const evt = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        code: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(evt);
      // Safety: if no observer fires (shouldn't happen), resolve false after a tick.
      setTimeout(() => resolve(false), 100);
    });
  });
}
