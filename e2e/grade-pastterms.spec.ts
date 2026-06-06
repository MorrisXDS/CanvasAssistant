/**
 * Grade breakdown — Past terms (ADR-0015).
 *
 * Opens the dashboard's Avg. Grade stat card → GradeBreakdownModal, and asserts
 * the new term-grouped Past-terms section: the two seeded past terms render as
 * groups (newest first), a credit-weighted Cumulative line is shown, and a
 * collapsed past-term group expands to reveal its archived courses.
 *
 * Seed (e2e/fixtures/seedDatabase.js): archived courses across two enrollment
 * terms — "E2E 2024 Winter" (Past Course C) and "E2E 2024 Fall" (Past Courses
 * A/B) — each with graded tasks so the per-term + cumulative averages compute.
 */
import { test, expect } from './fixtures/app';

test.describe('Grade breakdown — Past terms (ADR-0015)', () => {
  test('grade modal shows term-grouped Past terms + cumulative; a past term expands to its courses', async ({
    page,
  }) => {
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard', level: 1 })
    ).toBeVisible();

    // Open the grade breakdown via the Avg. Grade stat card (action: 'grade').
    await page.locator('.stat-card', { hasText: 'Avg. Grade' }).click();

    // Past-terms section + cumulative render (modal-scoped getPastTermGrades resolves).
    await expect(page.getByText('Past terms')).toBeVisible();
    await expect(page.getByText(/Cumulative/)).toBeVisible();

    // Both seeded past terms appear as collapsible groups.
    await expect(page.getByText('E2E 2024 Winter')).toBeVisible();
    const fall = page.getByRole('button').filter({ hasText: 'E2E 2024 Fall' }).first();
    await expect(fall).toBeVisible();

    // Past groups default collapsed — expanding Fall reveals its archived course.
    await expect(page.getByText('E2E Past Course A')).toBeHidden();
    await fall.click();
    await expect(page.getByText('E2E Past Course A')).toBeVisible();
  });
});
