/**
 * AnnouncementAttachmentReader — the only SQL surface for the
 * `notification_attachments` table (per ADR-0007 / ADR-0008).
 *
 * Stateless. Returns raw DB rows (snake_case). Consumers map to
 * FileEntity at the `FileEntityProvider` boundary.
 *
 * Visibility filtering is not the reader's job. Single-id lookups
 * bypass visibility; list-scope filtering is composed at the provider
 * or IPC handler layer.
 *
 * Asymmetry vs CanvasFileReader: a single Canvas File ID
 * (`external_id`) can match *many* rows — one per announcement that
 * attaches the same blob. Per-ID lookups return arrays, not single rows.
 */

import type { Database } from '../Database';
import type { NotificationAttachmentRow } from '../DatabaseRowTypes';

export class AnnouncementAttachmentReader {
  constructor(private readonly db: Database) {}

  /**
   * Get all attachment rows whose external_id matches. Empty array if
   * no announcement attaches this blob.
   */
  getByExternalId(externalId: string): NotificationAttachmentRow[] {
    return this.db.executeRead<NotificationAttachmentRow>(
      `SELECT * FROM notification_attachments WHERE external_id = ?
       ORDER BY notification_id`,
      [externalId]
    );
  }

  /**
   * Batch lookup. Returns a Map keyed by external_id; each value is the
   * (possibly multi-row) array of attachment rows for that blob. Misses
   * are omitted so callers can detect them by key.
   */
  getByExternalIds(
    externalIds: readonly string[]
  ): Map<string, NotificationAttachmentRow[]> {
    const result = new Map<string, NotificationAttachmentRow[]>();
    if (externalIds.length === 0) return result;
    const placeholders = externalIds.map(() => '?').join(', ');
    const rows = this.db.executeRead<NotificationAttachmentRow>(
      `SELECT * FROM notification_attachments
       WHERE external_id IN (${placeholders})
       ORDER BY external_id, notification_id`,
      [...externalIds]
    );
    for (const row of rows) {
      const existing = result.get(row.external_id);
      if (existing) {
        existing.push(row);
      } else {
        result.set(row.external_id, [row]);
      }
    }
    return result;
  }

  /**
   * All attachments belonging to one announcement (`notifications.id`).
   * Ordered by display_name. Visibility is not applied — caller knew
   * the notification id.
   */
  getByNotificationId(notificationId: number): NotificationAttachmentRow[] {
    return this.db.executeRead<NotificationAttachmentRow>(
      `SELECT * FROM notification_attachments
       WHERE notification_id = ?
       ORDER BY display_name`,
      [notificationId]
    );
  }

  /**
   * All attachments belonging to the given course ids. Caller composes
   * visibility via `VisibilityOracle.getVisibleCourseIds()` first.
   */
  getByCourseIds(courseIds: readonly number[]): NotificationAttachmentRow[] {
    if (courseIds.length === 0) return [];
    const placeholders = courseIds.map(() => '?').join(', ');
    return this.db.executeRead<NotificationAttachmentRow>(
      `SELECT * FROM notification_attachments
       WHERE course_id IN (${placeholders})
       ORDER BY external_id, notification_id`,
      [...courseIds]
    );
  }
}
