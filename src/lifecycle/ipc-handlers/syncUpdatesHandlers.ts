/**
 * Sync Updates IPC Handlers
 * Handles sync update notifications, marking items as seen, and conflict resolution
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads route
 * through `SyncUpdateReader` (L1); writes route through the sync-update
 * commands (L4). The handler keeps the visibility composition, result shaping
 * / logging, and the test-data orchestration. The post-write affected-row
 * counts come straight from the command return values (better-sqlite3's
 * `changes`, identical to the `SELECT changes()` the handler previously ran).
 */

import { ipcMain } from 'electron';
import type { IpcContext, IpcHandlerRegistrar } from './IpcContext';
import type { SyncUpdateRowWithCourse } from '../../layers/l1-persistence';
import { SyncUpdateReader } from '../../layers/l1-persistence';
import {
  MarkSyncUpdatesSeenCommand,
  ResolveSyncConflictCommand,
  CleanupSyncUpdatesCommand,
  SyncTestDataCommand,
  type TestSyncUpdateInput,
} from '../../layers/l4-controller/commands/syncUpdate';

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

  const syncUpdateReader = new SyncUpdateReader(db);
  const markSeenCommand = new MarkSyncUpdatesSeenCommand(db);
  const resolveConflictCommand = new ResolveSyncConflictCommand(db);
  const cleanupCommand = new CleanupSyncUpdatesCommand(db);
  const testDataCommand = new SyncTestDataCommand(db);

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

        const rows = syncUpdateReader.getAllWithCourse(
          visibleCourseIds,
          includeResolved,
          limit
        );
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

      const counts = syncUpdateReader.getCounts(visibleCourseIds);

      const result = {
        total: counts.informational + counts.conflicts + counts.actionRequired,
        conflicts: counts.conflicts,
        informational: counts.informational,
        actionRequired: counts.actionRequired,
        byCourse: counts.byCourse,
        byType: counts.byType,
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

      const marked = markSeenCommand.byIds(params.ids);
      return { success: true, data: { marked } };
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
        // Get visible course IDs
        const visibilityOracle = ctx.getVisibilityOracle();
        const visibleCourseIds = visibilityOracle?.getVisibleCourseIds() ?? [];

        if (visibleCourseIds.length === 0) {
          return { success: true, data: { marked: 0 } };
        }

        const marked = markSeenCommand.all(visibleCourseIds, {
          courseId: params?.courseId,
          entityType: params?.entityType,
          excludeConflicts: params?.excludeConflicts,
          excludeActionRequired: params?.excludeActionRequired,
        });

        return { success: true, data: { marked } };
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
        const marked = markSeenCommand.byEntity(params.entityType, params.entityId);
        return { success: true, data: { marked } };
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
        const conflict = syncUpdateReader.getConflictById(params.updateId);

        if (!conflict) {
          return { success: false, error: 'Conflict not found' };
        }

        resolveConflictCommand.execute(
          params.updateId,
          params.resolution,
          params.rememberChoice ?? false,
          conflict
        );

        // Mark informational updates for the SAME FIELD as seen
        // Only clears updates related to the specific field that was in conflict
        if (conflict.entity_id && conflict.conflict_field) {
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
        const deleted = cleanupCommand.execute(days);
        return { success: true, data: { deleted } };
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
      const task = syncUpdateReader.getFirstTaskInCourse(courseId);

      // Get a file from this course
      const file = syncUpdateReader.getFirstResourceInCourse(courseId);

      if (!task) {
        return { success: false, error: 'No tasks found in visible courses' };
      }

      const now = new Date().toISOString();

      // Create a test sync session first (required by sync_updates.sync_session_id NOT NULL)
      const syncSessionId = testDataCommand.createTestSession(now);

      if (!syncSessionId) {
        return { success: false, error: 'Failed to create test sync session' };
      }

      const testUpdates: TestSyncUpdateInput[] = [
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
          changed_field: null,
          title: `[TEST] ${file.title}`,
          subtitle: 'New file',
          old_value: null,
          new_value: null,
          created_at: now,
        });
      }

      // Insert test updates
      for (const update of testUpdates) {
        testDataCommand.insertTestUpdate(update);
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
      const deleted = testDataCommand.clearTestData();

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
      const status = syncUpdateReader.getStatus();

      return {
        success: true,
        data: {
          totalUnseen: status.totalUnseen,
          byType: status.byType,
        },
      };
    } catch (error) {
      logger.error('Failed to get sync updates status', toError(error));
      return { success: false, error: String(error) };
    }
  });
};
