/**
 * Mutation flow — archive a course, proving persistence through IPC.
 *
 * `mod+shift+a` on CourseDetail opens a ConfirmDialog (confirmText "Archive").
 * Confirming dispatches ArchiveCourse. Read-back: `getCourses()` no longer
 * lists the id (archived = invisible) and `getArchivedCourses()` now does.
 *
 * One-way mutation on the disposable per-run DB copy — discarded by the
 * fixture's `cleanup()`, so no restore needed.
 */
import { test, expect } from './fixtures/app';
import { getCourses, gotoCourse } from './helpers';

test.describe('Mutation — archive course', () => {
  test('archiving a course persists (visible→archived via IPC read-back)', async ({
    page,
  }) => {
    const courses = await getCourses(page);
    const active = courses.find((c) => !c.archivedAt);
    test.skip(active === undefined, 'No non-archived visible course in the seed');
    const courseId = (active as { id: number }).id;

    await gotoCourse(page, courseId);

    // mod+shift+a → Archive ConfirmDialog.
    await page.keyboard.press('Control+Shift+KeyA');
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 3000 });

    // Confirm via the "Archive" button (ConfirmDialog confirmText).
    await page.getByRole('button', { name: 'Archive', exact: true }).click();

    // Read-back: course leaves the visible set …
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const api = (
              window as unknown as {
                api: { getCourses: () => Promise<Array<{ id: number }>> };
              }
            ).api;
            return (await api.getCourses()).map((c) => c.id);
          }),
        { timeout: 5000 }
      )
      .not.toContain(courseId);

    // … and joins the archived set.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const api = (
            window as unknown as {
              api: { getArchivedCourses: () => Promise<Array<{ id: number }>> };
            }
          ).api;
          return (await api.getArchivedCourses()).map((c) => c.id);
        })
      )
      .toContain(courseId);
  });
});
