/**
 * Global `Mod+1..5` page-switcher coverage (`hooks/useAppShortcuts.ts`).
 * NAV_ROUTES = ['/', '/calendar', '/courses', '/files', '/settings'], bound
 * with plain `useHotkeys` (the intentional ADR-0006 escape — must fire over
 * modals). On win32 `Mod` = `Control`. Observable: `location.hash`.
 *
 * Also asserts the escapeStackGate positive: the page-nav fires even with the
 * `?` help modal open (proves the exemption that `useAppShortcuts`'s plain
 * `useHotkeys` is supposed to give).
 */
import { test, expect } from './fixtures/app';

const NAV = [
  { key: 'Control+1', hash: '#/' },
  { key: 'Control+2', hash: '#/calendar' },
  { key: 'Control+3', hash: '#/courses' },
  { key: 'Control+4', hash: '#/files' },
  { key: 'Control+5', hash: '#/settings' },
];

test.describe('Global page navigation (Mod+1..5)', () => {
  test('each Control+N navigates to its route', async ({ page }) => {
    for (const { key, hash } of NAV) {
      // Start from a different route so each assertion is a real transition.
      await page.evaluate(() => {
        location.hash = '#/updates';
      });
      await page.keyboard.press(key);
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
    }
  });

  test('page-nav fires over an open help modal (escapeStackGate exemption)', async ({
    page,
  }) => {
    // Land somewhere other than the target and wait for it to be interactive.
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard', level: 1 })
    ).toBeVisible();
    // Ensure no input/select has focus (the `?` handler ignores form-tag focus).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Open the `?` help modal.
    await page.keyboard.press('Shift+Slash');
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 3000 });

    // With the modal on the stack, Control+2 must still navigate to Calendar.
    await page.keyboard.press('Control+2');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/calendar');
  });
});
