/**
 * Dashboard route-gap coverage. The Dashboard (`#/`) had no e2e today.
 *
 * Dashboard is a card grid, not a list-nav page, so there is no
 * `data-focus-scope` to assert on — we assert the render landmark
 * (`<h1>Dashboard</h1>`) and that the course IPC read-path resolves.
 */
import { test, expect } from './fixtures/app';
import { getCourses } from './helpers';

test.describe('Dashboard route', () => {
  test('renders the Dashboard landmark and resolves courses over IPC', async ({
    page,
  }) => {
    await page.evaluate(() => {
      location.hash = '#/';
    });

    await expect(
      page.getByRole('heading', { name: 'Dashboard', level: 1 })
    ).toBeVisible();

    // IPC read-path is wired: getCourses resolves to an array (data-tolerant —
    // the array may be empty on a sparse seed).
    const courses = await getCourses(page);
    expect(Array.isArray(courses)).toBe(true);
  });
});
