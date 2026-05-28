/**
 * NotificationReader — the only SQL surface for the `notifications` table.
 *
 * Per ADR-0007 / PR-E, IPC handlers MUST go through this reader (or
 * another named L1 service). Raw `database.execute*` calls against
 * `notifications` are confined to this file (plus migrations and sync
 * code, neither of which lives in IPC handlers).
 *
 * Stateless. Returns raw DB rows (snake_case). Consumers map to DTOs
 * at their boundary.
 *
 * Visibility filtering is NOT this reader's job — single-id getters
 * bypass; list endpoints compose with `VisibilityOracle.getVisibleCourseIds()`
 * at the caller (per ADR-0007 sub-decision α).
 *
 * Note on naming: CONTEXT.md flags `notifications` as a misnomer — the
 * table is currently used only for Announcements. The reader's name
 * mirrors the schema table for clarity; if the table is renamed in a
 * future migration, this reader follows.
 */

import type { Database } from '../Database';
import type { NotificationRow } from '../DatabaseRowTypes';

export class NotificationReader {
  constructor(private readonly db: Database) {}

  /**
   * One notification by primary key. Returns null when missing.
   * Bypasses visibility — caller knew the id.
   */
  getById(id: number): NotificationRow | null {
    return (
      this.db.executeReadOne<NotificationRow>(
        `SELECT * FROM notifications WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /**
   * All notifications scoped to a single course, ordered by
   * `published_at DESC` (newest first). Caller verifies course visibility
   * upstream; the reader does not.
   */
  getByCourseId(courseId: number): NotificationRow[] {
    return this.db.executeRead<NotificationRow>(
      `SELECT * FROM notifications
       WHERE course_id = ?
       ORDER BY published_at DESC`,
      [courseId]
    );
  }

  /**
   * Notifications across the given course ids PLUS all system
   * notifications (`course_id IS NULL`). System notifications are
   * always included regardless of the course-id set — they represent
   * the user-global feed and are not course-scoped. Ordered by
   * `published_at DESC`.
   *
   * Empty `courseIds` → only system notifications.
   */
  getByCourseIdsIncludingSystem(courseIds: readonly number[]): NotificationRow[] {
    if (courseIds.length === 0) {
      return this.db.executeRead<NotificationRow>(
        `SELECT * FROM notifications
         WHERE course_id IS NULL
         ORDER BY published_at DESC`
      );
    }
    const placeholders = courseIds.map(() => '?').join(', ');
    return this.db.executeRead<NotificationRow>(
      `SELECT * FROM notifications
       WHERE course_id IS NULL OR course_id IN (${placeholders})
       ORDER BY published_at DESC`,
      [...courseIds]
    );
  }
}
