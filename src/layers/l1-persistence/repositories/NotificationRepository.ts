/**
 * NotificationRepository - Database operations for notifications
 *
 * Encapsulates all SQL operations for the notifications table.
 */

import type { Database } from '../Database';
import type { Notification } from '../../../shared/ipc-contract';
import { BaseRepository, NotificationRow } from './BaseRepository';

export interface NotificationUpdates {
  dismissedAt?: string | null;
}

export class NotificationRepository extends BaseRepository<Notification, NotificationRow> {
  constructor(db: Database) {
    super(db);
  }

  protected mapRowToEntity(row: NotificationRow): Notification {
    return {
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      courseId: row.course_id,
      title: row.title,
      message: row.message,
      messageHtml: row.message_html,
      publishedAt: row.published_at,
      dismissedAt: row.dismissed_at,
      url: row.url,
    };
  }

  protected mapEntityToRow(_entity: Partial<Notification>): Record<string, unknown> {
    return {};
  }

  /**
   * Find all notifications, ordered by published date descending.
   */
  findAll(): Notification[] {
    return this.queryAll<NotificationRow>(
      'SELECT * FROM notifications ORDER BY published_at DESC'
    );
  }

  /**
   * Find active (non-dismissed) notifications.
   */
  findActive(): Notification[] {
    return this.queryAll<NotificationRow>(
      'SELECT * FROM notifications WHERE dismissed_at IS NULL ORDER BY published_at DESC'
    );
  }

  /**
   * Find a notification by its ID.
   */
  findById(id: number): Notification | null {
    return this.queryOne<NotificationRow>(
      'SELECT * FROM notifications WHERE id = ?',
      [id]
    );
  }

  /**
   * Find notifications for a specific course.
   */
  findByCourseId(courseId: number): Notification[] {
    return this.queryAll<NotificationRow>(
      'SELECT * FROM notifications WHERE course_id = ? ORDER BY published_at DESC',
      [courseId]
    );
  }

  /**
   * Find a notification by source type and ID.
   */
  findBySource(sourceType: string, sourceId: string): Notification | null {
    return this.queryOne<NotificationRow>(
      'SELECT * FROM notifications WHERE source_type = ? AND source_id = ?',
      [sourceType, sourceId]
    );
  }

  /**
   * Dismiss a notification.
   */
  dismiss(id: number): Notification | null {
    this.db.executeWrite(
      'UPDATE notifications SET dismissed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id],
      'notifications'
    );
    return this.findById(id);
  }

  /**
   * Un-dismiss a notification.
   */
  undismiss(id: number): Notification | null {
    this.db.executeWrite(
      'UPDATE notifications SET dismissed_at = NULL WHERE id = ?',
      [id],
      'notifications'
    );
    return this.findById(id);
  }

  /**
   * Check if a notification exists.
   */
  exists(id: number): boolean {
    const row = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM notifications WHERE id = ?',
      [id]
    );
    return row !== undefined;
  }

  /**
   * Check if a notification is dismissed.
   */
  isDismissed(id: number): boolean {
    const row = this.db.executeReadOne<{ dismissed_at: string | null }>(
      'SELECT dismissed_at FROM notifications WHERE id = ?',
      [id]
    );
    // If row doesn't exist, notification is not dismissed (it doesn't exist)
    // Only return true if row exists AND dismissed_at is not null
    if (!row) return false;
    return row.dismissed_at !== null;
  }

  /**
   * Get count of active notifications.
   */
  countActive(): number {
    const row = this.db.executeReadOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE dismissed_at IS NULL'
    );
    return row?.count ?? 0;
  }

  /**
   * Get count of notifications for a course.
   */
  countByCourseId(courseId: number): number {
    const row = this.db.executeReadOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE course_id = ?',
      [courseId]
    );
    return row?.count ?? 0;
  }
}
