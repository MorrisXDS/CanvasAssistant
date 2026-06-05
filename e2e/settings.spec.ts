/**
 * Settings route-gap coverage (`#/settings`). The Settings page renders the
 * SettingsModalContent full-page (NOT via the Modal primitive) so it is NOT a
 * `[role="dialog"]`. Assert the `<h2>Settings</h2>` landmark + the search input.
 */
import { test, expect } from './fixtures/app';
import { gotoHash } from './helpers';

test.describe('Settings route', () => {
  test('renders the full-page Settings landmark and search input', async ({ page }) => {
    await gotoHash(page, '#/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();

    // Full-page settings is NOT a modal dialog.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // Settings search input (placeholder from SETTINGS_LABELS).
    await expect(page.getByPlaceholder('Search settings...')).toBeVisible();
  });
});
