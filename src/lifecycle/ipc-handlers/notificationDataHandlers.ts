/**
 * Notification Data IPC Handlers
 *
 * Per ADR-0007 / PR-E: no `database.execute*` calls in this file —
 * all reads route through `NotificationReader`. Visibility filtering
 * is composed at the handler layer via `VisibilityOracle`.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import { NotificationReader } from '../../layers/l1-persistence';
import type { NotificationRow } from '../../layers/l1-persistence/DatabaseRowTypes';

function mapNotificationRowToResponse(row: NotificationRow) {
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

/**
 * Register notification data handlers
 */
export function registerNotificationDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibilityOracle = ctx.getVisibilityOracle;

  const reader = new NotificationReader(database);

  // List notifications: caller may scope to specific course ids. We
  // always include system notifications (course_id IS NULL). Visibility
  // composes via the Oracle — if no visible courses, only system
  // notifications are returned.
  ipcMain.handle(
    'data:getNotifications',
    (_event, options?: { courseIds?: number[] }) => {
      try {
        const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];

        let scopeIds: number[];
        if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          const visibleSet = new Set(visibleIds);
          scopeIds = options.courseIds.filter((id) => visibleSet.has(id));
        } else {
          scopeIds = visibleIds;
        }

        return reader
          .getByCourseIdsIncludingSystem(scopeIds)
          .map(mapNotificationRowToResponse);
      } catch (error) {
        logger.error(`Failed to get notifications: ${error}`);
        throw error;
      }
    }
  );

  // Single-id lookup. Bypasses visibility (ADR-0007 sub-decision α).
  ipcMain.handle('data:getNotification', (_event, notificationId: number) => {
    try {
      const row = reader.getById(notificationId);
      return row ? mapNotificationRowToResponse(row) : null;
    } catch (error) {
      logger.error(`Failed to get notification: ${error}`);
      throw error;
    }
  });

  // Notifications for one specific course. Caller knew the course id;
  // no visibility filter applied at the reader layer (matches legacy
  // behaviour — this endpoint returns the course's notifications even
  // when the course is hidden, useful for archived-course views).
  ipcMain.handle('data:getCourseNotifications', (_event, courseId: number) => {
    try {
      return reader.getByCourseId(courseId).map(mapNotificationRowToResponse);
    } catch (error) {
      logger.error(`Failed to get course notifications: ${error}`);
      throw error;
    }
  });
}
