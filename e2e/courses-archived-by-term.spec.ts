/**
 * Courses page — Archived drawer grouped by term (ADR-0015).
 *
 * The Archived Courses drawer now renders collapsible per-term subgroups
 * (newest first). This opens the drawer and asserts the two seeded past terms
 * appear as groups, the newest (open by default) shows its course, and a
 * collapsed term expands to reveal its archived courses.
 *
 * Seed (e2e/fixtures/seedDatabase.js): "E2E 2024 Winter" (Past Course C, newest)
 * + "E2E 2024 Fall" (Past Courses A/B).
 */
import { test, expect } from './fixtures/app';

test.describe('Courses — Archived grouped by term (ADR-0015)', () => {
  test('archived drawer groups by term; newest open by default, older expands on click', async ({
    page,
  }) => {
    await page.evaluate(() => {
      location.hash = '#/courses';
    });

    // Open the Archived Courses drawer.
    const drawerToggle = page
      .getByRole('button')
      .filter({ hasText: 'Archived Courses' })
      .first();
    await expect(drawerToggle).toBeVisible();
    await drawerToggle.click();

    // Per-term subgroups render for both seeded terms.
    await expect(page.getByText('E2E 2024 Winter')).toBeVisible();
    const fall = page.getByRole('button').filter({ hasText: 'E2E 2024 Fall' }).first();
    await expect(fall).toBeVisible();

    // Newest term (Winter) is open by default → its archived course is visible.
    await expect(page.getByText('E2E Past Course C')).toBeVisible();

    // Older term (Fall) is collapsed by default → expanding reveals its course.
    await expect(page.getByText('E2E Past Course A')).toBeHidden();
    await fall.click();
    await expect(page.getByText('E2E Past Course A')).toBeVisible();
  });
});
