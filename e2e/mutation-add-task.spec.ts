/**
 * Mutation flow — add a task, proving persistence through IPC.
 *
 * Writes to the fixture's isolated, per-run copy of `canvas.db` (disposable —
 * `seed.ts` mkdtemps a fresh DB copy and `cleanup()` rm's it), then reads the
 * result back through `window.api.getTasks` to prove the CreateTask dispatch
 * landed. Self-contained: discovers its own target course, asserts its own row.
 */
import { test, expect } from './fixtures/app';
import { getCourses } from './helpers';

test.describe('Mutation — add task', () => {
  test('creating a task via the Add-Task modal persists (IPC read-back)', async ({
    page,
  }) => {
    const courses = await getCourses(page);
    // The deterministic seed always inserts 2 visible courses (ADR-0011).
    expect(courses.length).toBeGreaterThan(0);
    const courseId = courses[0].id;

    const title = `e2e-add-${Date.now()}`;

    // Land on the Tasks page and ensure the page keyboard scope is active.
    await page.evaluate(() => {
      location.hash = '#/tasks';
    });
    await page.getByRole('heading', { name: 'All Tasks' }).waitFor({ state: 'visible' });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // `n` opens the Add-Task modal.
    await page.keyboard.press('n');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Select the target course by its option value (the course id) — the select
    // has no accessible name, so address it as the dialog's first <select>.
    await dialog.locator('select').first().selectOption(String(courseId));

    // Type a unique title.
    await dialog.getByPlaceholder('Task title').fill(title);

    // "Create Task" is disabled until title + course are set.
    const createBtn = page.getByRole('button', { name: 'Create Task' });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Modal closes on success.
    await expect(dialog).toHaveCount(0);

    // Read-back through IPC: the new title appears in the course's tasks.
    await expect
      .poll(
        () =>
          page.evaluate(async (cid) => {
            const api = (
              window as unknown as {
                api: {
                  getTasks: (o: {
                    courseIds: number[];
                  }) => Promise<Array<{ title: string }>>;
                };
              }
            ).api;
            const tasks = await api.getTasks({ courseIds: [cid] });
            return tasks.map((t) => t.title);
          }, courseId),
        { timeout: 5000 }
      )
      .toContain(title);
  });
});
