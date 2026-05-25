import { test, expect } from './fixtures/app';

test('boots to the main UI with the seeded DB wired through IPC', async ({ page }) => {
  const courses = await page.evaluate(
    async () =>
      await (window as { api: { getCourses: () => Promise<unknown[]> } }).api.getCourses()
  );
  expect(Array.isArray(courses)).toBe(true);
  expect(courses.length).toBeGreaterThan(0);
});
