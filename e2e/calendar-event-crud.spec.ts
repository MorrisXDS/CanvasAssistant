/**
 * Calendar event CRUD (nice-to-have, Batch 3).
 *
 * Two deterministic halves, each on a signal the architect plan calls out:
 *
 *   1. Keyboard entry point — on the Calendar page, `n` opens the EventFormModal
 *      (Calendar/index.tsx keymap `n` → setShowEventFormModal(true)). We assert
 *      the modal appears (role=dialog with the "Add Event" / form heading) and
 *      closes on Escape. This is the deterministic part of the `n` flow.
 *
 *   2. Persistence round-trip — create an event via the calendar IPC, read it
 *      back with getCalendarEventsForRange (the preload getter the plan names),
 *      then delete it and confirm it is gone. This validates the calendar CRUD
 *      contract end-to-end without depending on the EventFormModal's brittle
 *      date-input plumbing (the architect flagged that submit path as the most
 *      flake-prone; we keep the UI assertion to "modal opens" and exercise the
 *      data round-trip through the stable IPC, which is the actual read-back the
 *      plan specifies).
 *
 * All signals deterministic: role/text for the modal; IPC read-back arrays
 * (toContain / not.toContain by id) for persistence. No test.skip.
 */

import { test, expect } from './fixtures/app';
import type { Page } from '@playwright/test';

interface EventLite {
  id: number;
}

const COURSE_A_ID = 90001; // mirrors seedDatabase.js COURSE_A

/** Wide range that brackets the created event's date. */
function range(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

async function gotoCalendar(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/calendar';
  });
  await page
    .locator('[data-testid="calendar-page"]')
    .waitFor({ state: 'visible', timeout: 6000 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.describe('Calendar — event CRUD', () => {
  test('keyboard n opens the EventFormModal', async ({ page }) => {
    await gotoCalendar(page);
    // No dialog open initially.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    await page.keyboard.press('n');

    // The EventFormModal mounts as a role=dialog. Wait for it deterministically.
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 4000 });

    // Escape closes it again (EventFormModal handles Esc).
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('create → read-back → delete round-trip via the calendar IPC', async ({
    page,
  }) => {
    const { startDate, endDate } = range();
    const startAt = new Date().toISOString();

    // Create an event on Course A.
    const created = await page.evaluate(
      async ({ start, courseId }) => {
        const api = (
          window as unknown as {
            api: {
              createCalendarEvent: (d: {
                title: string;
                startAt: string;
                allDay: boolean;
                courseId?: number;
              }) => Promise<{ success: boolean; data?: { id: number } }>;
            };
          }
        ).api;
        return api.createCalendarEvent({
          title: 'E2E CRUD Event',
          startAt: start,
          allDay: false,
          courseId,
        });
      },
      { start: startAt, courseId: COURSE_A_ID }
    );
    expect(created.success).toBe(true);
    const newId = created.data?.id;
    expect(typeof newId).toBe('number');

    // Read it back via getCalendarEventsForRange — the new id must be present.
    const fetchEvents = (): Promise<EventLite[]> =>
      page.evaluate(
        async (r) => {
          const api = (
            window as unknown as {
              api: {
                getCalendarEventsForRange: (p: {
                  startDate: string;
                  endDate: string;
                }) => Promise<EventLite[]>;
              };
            }
          ).api;
          return api.getCalendarEventsForRange(r);
        },
        { startDate, endDate }
      );

    await expect
      .poll(async () => (await fetchEvents()).map((e) => e.id))
      .toContain(newId as number);

    // Delete it, then confirm it is gone from the read-back.
    const deleted = await page.evaluate(async (id) => {
      const api = (
        window as unknown as {
          api: {
            deleteCalendarEvent: (id: number) => Promise<{ success: boolean }>;
          };
        }
      ).api;
      return api.deleteCalendarEvent(id);
    }, newId as number);
    expect(deleted.success).toBe(true);

    await expect
      .poll(async () => (await fetchEvents()).map((e) => e.id))
      .not.toContain(newId as number);
  });
});
