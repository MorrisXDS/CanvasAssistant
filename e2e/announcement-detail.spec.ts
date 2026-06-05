/**
 * AnnouncementDetail route-gap coverage (`#/announcement/:id`). Discovers a
 * notification id by walking visible courses, navigates directly, and asserts
 * the `<h1>` matches the notification's title. The deterministic seed guarantees
 * >=2 announcements on Course A, so this is a hard precondition (ADR-0011).
 */
import { test, expect } from './fixtures/app';
import { getCourses } from './helpers';

test.describe('AnnouncementDetail route', () => {
  test('navigates to an announcement and renders its title', async ({ page }) => {
    const courses = await getCourses(page);

    // Find the first notification across visible courses.
    let found: { id: number; title: string } | null = null;
    for (const c of courses) {
      const notifs = await page.evaluate(async (cid) => {
        const api = (
          window as unknown as {
            api: {
              getCourseNotifications: (
                id: number
              ) => Promise<Array<{ id: number; title: string }>>;
            };
          }
        ).api;
        return api.getCourseNotifications(cid);
      }, c.id);
      if (Array.isArray(notifs) && notifs.length > 0 && notifs[0]?.title) {
        found = { id: notifs[0].id, title: notifs[0].title };
        break;
      }
    }

    // The deterministic seed always puts >=2 announcements on Course A (ADR-0011).
    expect(found).not.toBeNull();
    const notification = found as { id: number; title: string };

    await page.evaluate((id) => {
      location.hash = `#/announcement/${id}`;
    }, notification.id);

    // Retrying assertion (not one-shot textContent): the detail page can render
    // a pre-settle frame before the notification resolves into the store.
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(
      notification.title
    );
  });
});
