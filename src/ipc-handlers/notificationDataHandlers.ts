/**
 * Notification Data IPC Handlers
 * Handlers for notification data operations
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register notification data handlers
 */
export function registerNotificationDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibleDataProvider = ctx.getVisibleDataProvider;

  ipcMain.handle(
    'data:getNotifications',
    (_event, options?: { courseIds?: number[] }) => {
      try {
        // Use VisibleDataProvider as single source of truth for visibility
        // Always include system notifications (course_id IS NULL)
        const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
        let sql: string;
        let params: number[] = [];

        if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          // Filter provided courseIds to only visible ones
          const visibleSet = new Set(visibleIds);
          const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

          if (filteredCourseIds.length === 0) {
            // Only system notifications when no visible courses match
            sql = `SELECT * FROM notifications WHERE course_id IS NULL ORDER BY published_at DESC`;
          } else {
            const placeholders = filteredCourseIds.map(() => '?').join(', ');
            sql = `SELECT * FROM notifications
                   WHERE course_id IS NULL OR course_id IN (${placeholders})
                   ORDER BY published_at DESC`;
            params = filteredCourseIds;
          }
        } else {
          // No filter - return notifications from all visible courses + system
          if (visibleIds.length === 0) {
            sql = `SELECT * FROM notifications WHERE course_id IS NULL ORDER BY published_at DESC`;
          } else {
            const placeholders = visibleIds.map(() => '?').join(', ');
            sql = `SELECT * FROM notifications
                   WHERE course_id IS NULL OR course_id IN (${placeholders})
                   ORDER BY published_at DESC`;
            params = visibleIds;
          }
        }

        const rows = database.executeRead<{
          id: number;
          source_type: string;
          source_id: string;
          course_id: number | null;
          title: string;
          message: string;
          message_html: string | null;
          published_at: string;
          dismissed_at: string | null;
          url: string | null;
        }>(sql, params);

        return rows.map((row) => ({
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
        }));
      } catch (error) {
        logger.error(`Failed to get notifications: ${error}`);
        throw error;
      }
    }
  );

  // Get a single notification by ID
  ipcMain.handle('data:getNotification', (_event, notificationId: number) => {
    try {
      const row = database.executeReadOne<{
        id: number;
        source_type: string;
        source_id: string;
        course_id: number | null;
        title: string;
        message: string;
        message_html: string | null;
        published_at: string;
        dismissed_at: string | null;
        url: string | null;
      }>('SELECT * FROM notifications WHERE id = ?', [notificationId]);

      if (!row) {
        return null;
      }

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
    } catch (error) {
      logger.error(`Failed to get notification: ${error}`);
      throw error;
    }
  });

  // Get announcements for a specific course
  ipcMain.handle('data:getCourseNotifications', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        source_type: string;
        source_id: string;
        course_id: number | null;
        title: string;
        message: string;
        message_html: string | null;
        published_at: string;
        dismissed_at: string | null;
        url: string | null;
      }>(
        'SELECT * FROM notifications WHERE course_id = ? ORDER BY published_at DESC',
        [courseId]
      );

      return rows.map((row) => ({
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
      }));
    } catch (error) {
      logger.error(`Failed to get course notifications: ${error}`);
      throw error;
    }
  });
}
