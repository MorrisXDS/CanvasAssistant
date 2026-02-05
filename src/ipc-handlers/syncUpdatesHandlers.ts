/**
 * Sync Updates IPC Handlers
 * Handles sync update notifications, marking items as seen, and conflict resolution
 */

import { ipcMain } from 'electron';
import type { IpcContext, IpcHandlerRegistrar } from './IpcContext';
import type {
  SyncUpdateRowWithCourse,
  SyncUpdateRow,
} from '../layers/l1-persistence/DatabaseRowTypes';

/**
 * Map database row to API response format
 */
function mapSyncUpdateRow(row: SyncUpdateRowWithCourse) {
  return {
    id: row.id,
    syncSessionId: row.sync_session_id,
    courseId: row.course_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    externalId: row.external_id,
    changeType: row.change_type,
    title: row.title,
    subtitle: row.subtitle,
    oldValue: row.old_value,
    newValue: row.new_value,
    conflictField: row.conflict_field,
    conflictResolution: row.conflict_resolution,
    rememberChoice: row.remember_choice === 1,
    isActionRequired: row.is_action_required === 1,
    seenAt: row.seen_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at, // For tracking Canvas value changes on unresolved items
    courseCode: row.course_code,
    courseName: row.course_name,
    courseColor: row.course_color,
  };
}

/**
 * Safely convert unknown error to Error instance
 */
function toError(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
}

export const registerSyncUpdatesHandlers: IpcHandlerRegistrar = (ctx: IpcContext) => {
  const db = ctx.getDatabase();
  const logger = ctx.getLogger();

  /**
   * Get all unseen sync updates (grouped by course in UI)
   */
  ipcMain.handle(
    'syncUpdates:getAll',
    async (_event, options?: { includeResolved?: boolean; limit?: number }) => {
      try {
        const includeResolved = options?.includeResolved ?? false;
        const limit = options?.limit ?? 500;

        // Get visible course IDs
        const visibleDataProvider = ctx.getVisibleDataProvider();
        const visibleCourseIds = visibleDataProvider?.getVisibleCourseIds() ?? [];

        if (visibleCourseIds.length === 0) {
          return [];
        }

        const placeholders = visibleCourseIds.map(() => '?').join(', ');
        const seenCondition = includeResolved
          ? ''
          : 'AND (su.seen_at IS NULL OR (su.entity_type = ? AND su.resolved_at IS NULL))';

        const params = includeResolved
          ? [...visibleCourseIds, limit]
          : [...visibleCourseIds, 'conflict', limit];

        const sql = `
          SELECT
            su.*,
            c.code as course_code,
            c.name as course_name,
            c.color as course_color
          FROM sync_updates su
          JOIN courses c ON su.course_id = c.id
          WHERE su.course_id IN (${placeholders})
          ${seenCondition}
          ORDER BY su.created_at DESC
          LIMIT ?
        `;

        const rows = db.executeRead<SyncUpdateRowWithCourse>(sql, params);
        return rows.map(mapSyncUpdateRow);
      } catch (error) {
        logger.error('Failed to get sync updates', toError(error));
        return [];
      }
    }
  );

  /**
   * Get counts of unseen updates (for FAB badge)
   */
  ipcMain.handle('syncUpdates:getCount', async () => {
    try {
      // Get visible course IDs
      const visibleDataProvider = ctx.getVisibleDataProvider();
      const visibleCourseIds = visibleDataProvider?.getVisibleCourseIds() ?? [];

      logger.info(`[syncUpdates:getCount] visibleCourseIds: ${visibleCourseIds.length}`);

      if (visibleCourseIds.length === 0) {
        logger.info('[syncUpdates:getCount] No visible courses, returning 0');
        return {
          total: 0,
          conflicts: 0,
          informational: 0,
          byCourse: {},
          byType: {},
        };
      }

      const placeholders = visibleCourseIds.map(() => '?').join(', ');

      // Count unseen informational updates (NOT action-required, NOT conflicts)
      const informationalSql = `
        SELECT COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND seen_at IS NULL
        AND entity_type != 'conflict'
        AND (is_action_required IS NULL OR is_action_required = 0)
      `;
      const informationalResult = db.executeRead<{ count: number }>(
        informationalSql,
        visibleCourseIds
      );
      const informational = informationalResult[0]?.count ?? 0;

      // Count unresolved conflicts
      const conflictsSql = `
        SELECT COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND entity_type = 'conflict'
        AND resolved_at IS NULL
      `;
      const conflictsResult = db.executeRead<{ count: number }>(
        conflictsSql,
        visibleCourseIds
      );
      const conflicts = conflictsResult[0]?.count ?? 0;

      // Count action-required items (queued tasks that need accept/dismiss)
      // Exclude conflicts since they're counted separately
      const actionRequiredSql = `
        SELECT COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND seen_at IS NULL
        AND is_action_required = 1
        AND entity_type != 'conflict'
      `;
      const actionRequiredResult = db.executeRead<{ count: number }>(
        actionRequiredSql,
        visibleCourseIds
      );
      const actionRequired = actionRequiredResult[0]?.count ?? 0;

      // Count by course
      const byCourseSql = `
        SELECT course_id, COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND (seen_at IS NULL OR (entity_type = 'conflict' AND resolved_at IS NULL))
        GROUP BY course_id
      `;
      const byCourseResult = db.executeRead<{ course_id: number; count: number }>(
        byCourseSql,
        visibleCourseIds
      );
      const byCourse: Record<string, number> = {};
      for (const row of byCourseResult) {
        byCourse[String(row.course_id)] = row.count;
      }

      // Count by type
      const byTypeSql = `
        SELECT entity_type, COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND (seen_at IS NULL OR (entity_type = 'conflict' AND resolved_at IS NULL))
        GROUP BY entity_type
      `;
      const byTypeResult = db.executeRead<{ entity_type: string; count: number }>(
        byTypeSql,
        visibleCourseIds
      );
      const byType: Record<string, number> = {};
      for (const row of byTypeResult) {
        byType[row.entity_type] = row.count;
      }

      const result = {
        total: informational + conflicts + actionRequired,
        conflicts,
        informational,
        actionRequired,
        byCourse,
        byType,
      };
      logger.info(
        `[syncUpdates:getCount] Returning: total=${result.total}, conflicts=${result.conflicts}, informational=${result.informational}, actionRequired=${result.actionRequired}`
      );
      return result;
    } catch (error) {
      logger.error('Failed to get sync updates count', toError(error));
      return {
        total: 0,
        conflicts: 0,
        informational: 0,
        byCourse: {},
        byType: {},
      };
    }
  });

  /**
   * Mark specific updates as seen
   */
  ipcMain.handle('syncUpdates:markSeen', async (_event, params: { ids: number[] }) => {
    try {
      if (!params.ids || params.ids.length === 0) {
        return { success: true, data: { marked: 0 } };
      }

      const placeholders = params.ids.map(() => '?').join(', ');
      const sql = `
        UPDATE sync_updates
        SET seen_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders}) AND seen_at IS NULL
      `;
      db.executeWrite(sql, params.ids, 'sync_updates');

      const result = db.executeRead<{ changes: number }>('SELECT changes() as changes');

      return { success: true, data: { marked: result[0]?.changes ?? 0 } };
    } catch (error) {
      logger.error('Failed to mark sync updates as seen', toError(error));
      return { success: false, error: String(error) };
    }
  });

  /**
   * Mark all updates as seen (with optional filters)
   */
  ipcMain.handle(
    'syncUpdates:markAllSeen',
    async (
      _event,
      params?: {
        courseId?: number;
        entityType?: string;
        excludeConflicts?: boolean;
        excludeActionRequired?: boolean;
      }
    ) => {
      try {
        const conditions: string[] = ['seen_at IS NULL'];
        const values: (number | string)[] = [];

        // Get visible course IDs
        const visibleDataProvider = ctx.getVisibleDataProvider();
        const visibleCourseIds = visibleDataProvider?.getVisibleCourseIds() ?? [];

        if (visibleCourseIds.length === 0) {
          return { success: true, data: { marked: 0 } };
        }

        const placeholders = visibleCourseIds.map(() => '?').join(', ');
        conditions.push(`course_id IN (${placeholders})`);
        values.push(...visibleCourseIds);

        if (params?.courseId !== undefined) {
          conditions.push('course_id = ?');
          values.push(params.courseId);
        }

        if (params?.entityType) {
          conditions.push('entity_type = ?');
          values.push(params.entityType);
        }

        if (params?.excludeConflicts) {
          conditions.push("entity_type != 'conflict'");
        }

        // Exclude action-required items (queued tasks that need accept/dismiss)
        if (params?.excludeActionRequired !== false) {
          // Default to excluding action-required when marking informational as read
          conditions.push('(is_action_required IS NULL OR is_action_required = 0)');
        }

        const sql = `
          UPDATE sync_updates
          SET seen_at = CURRENT_TIMESTAMP
          WHERE ${conditions.join(' AND ')}
        `;
        db.executeWrite(sql, values, 'sync_updates');

        const result = db.executeRead<{ changes: number }>('SELECT changes() as changes');

        return { success: true, data: { marked: result[0]?.changes ?? 0 } };
      } catch (error) {
        logger.error('Failed to mark all sync updates as seen', toError(error));
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Mark update seen by entity reference (for cross-page communication)
   */
  ipcMain.handle(
    'syncUpdates:markSeenByEntity',
    async (_event, params: { entityType: string; entityId: number }) => {
      try {
        const sql = `
          UPDATE sync_updates
          SET seen_at = CURRENT_TIMESTAMP
          WHERE entity_type = ? AND entity_id = ? AND seen_at IS NULL
        `;
        db.executeWrite(sql, [params.entityType, params.entityId], 'sync_updates');

        const result = db.executeRead<{ changes: number }>('SELECT changes() as changes');

        return { success: true, data: { marked: result[0]?.changes ?? 0 } };
      } catch (error) {
        logger.error('Failed to mark sync update by entity', toError(error));
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Resolve a conflict update
   */
  ipcMain.handle(
    'syncUpdates:resolveConflict',
    async (
      _event,
      params: {
        updateId: number;
        resolution: 'local' | 'canvas';
        rememberChoice?: boolean;
      }
    ) => {
      try {
        // Get the conflict details first
        const conflictSql = `
          SELECT * FROM sync_updates WHERE id = ? AND entity_type = 'conflict'
        `;
        const conflicts = db.executeRead<SyncUpdateRow>(conflictSql, [params.updateId]);

        if (conflicts.length === 0) {
          return { success: false, error: 'Conflict not found' };
        }

        const conflict = conflicts[0];

        // Mark conflict as resolved
        const updateSql = `
          UPDATE sync_updates
          SET
            conflict_resolution = ?,
            remember_choice = ?,
            resolved_at = CURRENT_TIMESTAMP,
            seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP)
          WHERE id = ?
        `;
        db.executeWrite(
          updateSql,
          [params.resolution, params.rememberChoice ? 1 : 0, params.updateId],
          'sync_updates'
        );

        // If rememberChoice, save to sync_preferences table
        if (params.rememberChoice && conflict.conflict_field) {
          const prefSql = `
            INSERT OR REPLACE INTO sync_preferences
            (entity, entity_id, field, prefer_local, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `;
          db.executeWrite(
            prefSql,
            [
              conflict.entity_type,
              conflict.entity_id,
              conflict.conflict_field,
              params.resolution === 'local' ? 1 : 0,
            ],
            'sync_preferences'
          );
        }

        // Apply the resolution to the actual entity
        // This would need to call the appropriate sync resolution logic
        // For now, we just mark the conflict as resolved

        return { success: true };
      } catch (error) {
        logger.error('Failed to resolve sync conflict', toError(error));
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Cleanup old sync updates (older than X days)
   */
  ipcMain.handle(
    'syncUpdates:cleanup',
    async (_event, params: { olderThanDays?: number }) => {
      try {
        const days = params.olderThanDays ?? 30;

        // Delete seen updates older than X days
        const deleteUpdatesSql = `
          DELETE FROM sync_updates
          WHERE seen_at IS NOT NULL
          AND datetime(seen_at) < datetime('now', '-' || ? || ' days')
        `;
        db.executeWrite(deleteUpdatesSql, [days], 'sync_updates');

        const updatesResult = db.executeRead<{ changes: number }>(
          'SELECT changes() as changes'
        );
        const deletedUpdates = updatesResult[0]?.changes ?? 0;

        // Delete old sync sessions with no remaining updates
        const deleteSessionsSql = `
          DELETE FROM sync_sessions
          WHERE id NOT IN (SELECT DISTINCT sync_session_id FROM sync_updates)
          AND datetime(created_at) < datetime('now', '-' || ? || ' days')
        `;
        db.executeWrite(deleteSessionsSql, [days], 'sync_sessions');

        return { success: true, data: { deleted: deletedUpdates } };
      } catch (error) {
        logger.error('Failed to cleanup sync updates', toError(error));
        return { success: false, error: String(error) };
      }
    }
  );
};
