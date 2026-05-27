/**
 * Sync Updates IPC Handlers
 * Handles sync update notifications, marking items as seen, and conflict resolution
 */

import { ipcMain } from 'electron';
import type { IpcContext, IpcHandlerRegistrar } from './IpcContext';
import type { SyncUpdateRowWithCourse, SyncUpdateRow } from '../../layers/l1-persistence';

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
        const visibilityOracle = ctx.getVisibilityOracle();
        const visibleCourseIds = visibilityOracle?.getVisibleCourseIds() ?? [];

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
      const visibilityOracle = ctx.getVisibilityOracle();
      const visibleCourseIds = visibilityOracle?.getVisibleCourseIds() ?? [];

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
        const visibilityOracle = ctx.getVisibilityOracle();
        const visibleCourseIds = visibilityOracle?.getVisibleCourseIds() ?? [];

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

        // Mark informational updates for the SAME FIELD as seen
        // Only clears updates related to the specific field that was in conflict
        if (conflict.entity_id && conflict.conflict_field) {
          const markRelatedSql = `
            UPDATE sync_updates
            SET seen_at = CURRENT_TIMESTAMP
            WHERE entity_id = ?
            AND changed_field = ?
            AND entity_type != 'conflict'
            AND seen_at IS NULL
          `;
          db.executeWrite(
            markRelatedSql,
            [conflict.entity_id, conflict.conflict_field],
            'sync_updates'
          );

          logger.info(
            `[syncUpdates:resolveConflict] Marked updates as seen for entity_id=${conflict.entity_id}, field=${conflict.conflict_field}`
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

  // ============ Debug/Test Handlers ============

  /**
   * Create test sync updates for verifying notification dot system
   * Only available in development mode
   */
  ipcMain.handle('syncUpdates:createTestData', async () => {
    try {
      // Get first visible course, task, and file for test data
      const visibilityOracle = ctx.getVisibilityOracle();
      const visibleCourseIds = visibilityOracle?.getVisibleCourseIds() ?? [];

      if (visibleCourseIds.length === 0) {
        return { success: false, error: 'No visible courses found' };
      }

      const courseId = visibleCourseIds[0];

      // Get a task from this course
      const task = db.executeRead<{ id: number; title: string }>(
        'SELECT id, title FROM tasks WHERE course_id = ? LIMIT 1',
        [courseId]
      )[0];

      // Get a file from this course
      const file = db.executeRead<{ id: number; title: string }>(
        'SELECT id, title FROM resources WHERE course_id = ? LIMIT 1',
        [courseId]
      )[0];

      if (!task) {
        return { success: false, error: 'No tasks found in visible courses' };
      }

      const now = new Date().toISOString();

      // Create a test sync session first (required by sync_updates.sync_session_id NOT NULL)
      db.executeWrite(
        `INSERT INTO sync_sessions (status, started_at, created_at)
         VALUES ('completed', ?, ?)`,
        [now, now],
        'sync_sessions'
      );
      const sessionResult = db.executeRead<{ id: number }>(
        'SELECT last_insert_rowid() as id'
      );
      const syncSessionId = sessionResult[0]?.id;

      if (!syncSessionId) {
        return { success: false, error: 'Failed to create test sync session' };
      }

      const testUpdates = [
        // Blue dot: task field updated (due_at)
        {
          sync_session_id: syncSessionId,
          course_id: courseId,
          entity_type: 'task',
          entity_id: task.id,
          change_type: 'updated',
          changed_field: 'due_at',
          title: `[TEST] ${task.title}`,
          subtitle: 'Due date changed',
          old_value: '2025-02-10T23:59:00Z',
          new_value: '2025-02-15T23:59:00Z',
          created_at: now,
        },
        // Blue dot: task field updated (weight)
        {
          sync_session_id: syncSessionId,
          course_id: courseId,
          entity_type: 'task',
          entity_id: task.id,
          change_type: 'updated',
          changed_field: 'weight',
          title: `[TEST] ${task.title}`,
          subtitle: 'Weight changed',
          old_value: '10',
          new_value: '15',
          created_at: now,
        },
        // Orange dot: grade changed
        {
          sync_session_id: syncSessionId,
          course_id: courseId,
          entity_type: 'grade',
          entity_id: task.id,
          change_type: 'grade_changed',
          changed_field: 'grade',
          title: `[TEST] ${task.title}`,
          subtitle: 'Grade: 85%',
          old_value: '80',
          new_value: '85',
          created_at: now,
        },
      ];

      // Add file update if file exists
      if (file) {
        testUpdates.push({
          sync_session_id: syncSessionId,
          course_id: courseId,
          entity_type: 'file',
          entity_id: file.id,
          change_type: 'new',
          changed_field: null as unknown as string,
          title: `[TEST] ${file.title}`,
          subtitle: 'New file',
          old_value: null as unknown as string,
          new_value: null as unknown as string,
          created_at: now,
        });
      }

      // Insert test updates
      for (const update of testUpdates) {
        db.executeWrite(
          `INSERT INTO sync_updates (
            sync_session_id, course_id, entity_type, entity_id, change_type, changed_field,
            title, subtitle, old_value, new_value, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            update.sync_session_id,
            update.course_id,
            update.entity_type,
            update.entity_id,
            update.change_type,
            update.changed_field,
            update.title,
            update.subtitle,
            update.old_value,
            update.new_value,
            update.created_at,
          ],
          'sync_updates'
        );
      }

      logger.info(
        `[syncUpdates:createTestData] Created ${testUpdates.length} test updates`
      );

      return {
        success: true,
        data: {
          created: testUpdates.length,
          courseId,
          taskId: task.id,
          fileId: file?.id,
          syncSessionId,
        },
      };
    } catch (error) {
      logger.error('Failed to create test sync updates', toError(error));
      return { success: false, error: String(error) };
    }
  });

  /**
   * Clear test sync updates (those with [TEST] prefix)
   */
  ipcMain.handle('syncUpdates:clearTestData', async () => {
    try {
      const sql = `DELETE FROM sync_updates WHERE title LIKE '[TEST]%'`;
      db.executeWrite(sql, [], 'sync_updates');

      const result = db.executeRead<{ changes: number }>('SELECT changes() as changes');
      const deleted = result[0]?.changes ?? 0;

      logger.info(`[syncUpdates:clearTestData] Cleared ${deleted} test updates`);

      return { success: true, data: { deleted } };
    } catch (error) {
      logger.error('Failed to clear test sync updates', toError(error));
      return { success: false, error: String(error) };
    }
  });

  /**
   * Get sync updates status (for debugging)
   */
  ipcMain.handle('syncUpdates:getStatus', async () => {
    try {
      const stats = db.executeRead<{
        change_type: string;
        total: number;
        unseen: number;
      }>(`
        SELECT
          change_type,
          COUNT(*) as total,
          SUM(CASE WHEN seen_at IS NULL THEN 1 ELSE 0 END) as unseen
        FROM sync_updates
        GROUP BY change_type
      `);

      const totalUnseen =
        db.executeRead<{ count: number }>(
          'SELECT COUNT(*) as count FROM sync_updates WHERE seen_at IS NULL'
        )[0]?.count ?? 0;

      return {
        success: true,
        data: {
          totalUnseen,
          byType: stats,
        },
      };
    } catch (error) {
      logger.error('Failed to get sync updates status', toError(error));
      return { success: false, error: String(error) };
    }
  });
};
