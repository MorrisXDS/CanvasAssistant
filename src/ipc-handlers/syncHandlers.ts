/**
 * Sync IPC Handlers
 * Handlers for sync operations:
 * - Course sync
 * - File references processing
 * - Folder sync
 * - Sync conflicts
 * - Last sync time
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register all sync-related IPC handlers
 */
export function registerSyncHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const systemMonitor = ctx.getSystemMonitor();
  const getSyncEngine = ctx.getSyncEngine;
  const getMainWindow = ctx.getMainWindow;

  // ============ Full Sync ============

  ipcMain.handle(
    'sync:full',
    async (
      _event,
      options?: {
        termSelection?: 'all' | 'auto' | string;
        syncCanvasFiles?: boolean;
        syncAnnouncements?: boolean;
        courseIds?: number[];
        deferFileProcessing?: boolean;
      }
    ) => {
      const syncEngine = getSyncEngine();
      const mainWindow = getMainWindow();

      logger.debug(`[IPC sync:full] Received options: ${JSON.stringify(options)}`);

      if (!syncEngine) {
        logger.warn('Sync attempted but Canvas client not initialized');
        return {
          success: false,
          error: 'Canvas client not initialized. Please reconnect to Canvas.',
        };
      }

      if (!systemMonitor.getState().canSync) {
        logger.warn('Sync blocked due to system state');
        return {
          success: false,
          error: 'Sync disabled due to system state (battery/focus)',
        };
      }

      const courseIdsStr = options?.courseIds
        ? `courseIds=[${options.courseIds.length} courses]`
        : 'courseIds=all';
      logger.info(
        `Sync requested with options: termSelection=${options?.termSelection ?? 'all'}, syncCanvasFiles=${options?.syncCanvasFiles ?? true}, syncAnnouncements=${options?.syncAnnouncements ?? true}, ${courseIdsStr}`
      );

      // Emit any pending conflicts from previous sessions before starting sync
      const pendingConflicts = syncEngine.getConflictResolver().getPendingConflicts();
      if (pendingConflicts.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
        logger.info(
          `[Sync] Emitting ${pendingConflicts.length} pending conflicts from previous session`
        );
        mainWindow.webContents.send('sync:conflicts', pendingConflicts);
      }

      try {
        const result = await syncEngine.syncAll(options);
        logger.info(`Sync completed: ${JSON.stringify(result)}`);
        // Trigger Files page refresh
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-status-changed', { type: 'sync-complete' });
        }
        return { success: true, result };
      } catch (error) {
        logger.error(`Sync failed: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Course Sync ============

  ipcMain.handle('sync:courses', async () => {
    const syncEngine = getSyncEngine();
    if (!syncEngine) {
      return { success: false, error: 'Canvas client not initialized' };
    }

    try {
      const result = await syncEngine.syncCourses();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Process file references in background (for deferred file processing)
  ipcMain.handle('sync:processFileReferences', async () => {
    const syncEngine = getSyncEngine();
    const mainWindow = getMainWindow();

    if (!syncEngine) {
      return { success: false, error: 'Canvas client not initialized' };
    }

    try {
      const result = await syncEngine.processFileReferencesBackground();
      // Trigger Files page refresh
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'file-refs-complete',
        });
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Sync files in a specific folder
  ipcMain.handle(
    'sync:folderFiles',
    async (
      _event,
      params: {
        canvasFolderId: number;
        localCourseId: number;
        forceRefresh?: boolean;
      }
    ) => {
      const syncEngine = getSyncEngine();
      if (!syncEngine) {
        return { success: false, error: 'Canvas client not initialized' };
      }

      try {
        const result = await syncEngine.syncFolderFiles(
          params.canvasFolderId,
          params.localCourseId,
          { forceRefresh: params.forceRefresh }
        );
        return {
          success: true,
          data: {
            success: result.success,
            count: result.count,
            errors: result.errors,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // Sync folder by path
  ipcMain.handle(
    'sync:folderByPath',
    async (
      _event,
      params: {
        courseId: number;
        folderPath: string;
      }
    ) => {
      const syncEngine = getSyncEngine();
      if (!syncEngine) {
        return { success: false, error: 'Canvas client not initialized' };
      }

      try {
        // Look up the folder's Canvas ID from database
        const folder = database.executeReadOne<{
          external_id: string;
          course_id: number;
        }>(
          `SELECT external_id, course_id FROM resources
           WHERE course_id = ? AND folder_path = ? AND type = 'folder'`,
          [params.courseId, params.folderPath]
        );

        if (!folder) {
          // Folder not in database - might be a virtual folder path, return success with 0 count
          return {
            success: true,
            data: { success: true, count: 0, errors: [] },
          };
        }

        // Get the Canvas course ID from the local course
        const course = database.executeReadOne<{ external_id: string }>(
          'SELECT external_id FROM courses WHERE id = ?',
          [params.courseId]
        );

        if (!course) {
          return { success: false, error: 'Course not found' };
        }

        const canvasFolderId = parseInt(folder.external_id, 10);
        const result = await syncEngine.syncFolderFiles(canvasFolderId, params.courseId);

        return {
          success: true,
          data: {
            success: result.success,
            count: result.count,
            errors: result.errors,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Sync Conflict Handlers ============

  ipcMain.handle('sync:getPendingConflicts', () => {
    const syncEngine = getSyncEngine();
    if (!syncEngine) {
      return [];
    }
    return syncEngine.getConflictResolver().getPendingConflicts();
  });

  ipcMain.handle(
    'sync:resolveConflict',
    async (
      _event,
      resolution: {
        conflictId: string;
        useCanvasValue: boolean;
        rememberChoice: boolean;
        rememberForAll: boolean;
        expiresAt?: string | null;
      }
    ) => {
      const syncEngine = getSyncEngine();
      if (!syncEngine) {
        return { success: false, error: 'Sync engine not initialized' };
      }

      try {
        // Get the conflict BEFORE resolving (since resolving removes it from pending list)
        const conflict = syncEngine
          .getConflictResolver()
          .getPendingConflicts()
          .find((c) => c.id === resolution.conflictId);

        if (!conflict) {
          return { success: false, error: 'Conflict not found' };
        }

        const result = syncEngine.getConflictResolver().resolveConflict(resolution);
        if (result) {
          // Apply the resolution to the database
          const tableName =
            conflict.entity === 'course'
              ? 'courses'
              : conflict.entity === 'task'
                ? 'tasks'
                : 'notifications';
          database.executeWrite(
            `UPDATE ${tableName} SET ${result.field} = ? WHERE id = ?`,
            [result.value, conflict.entityId],
            tableName
          );

          // Clear the modified flag if using Canvas value
          if (resolution.useCanvasValue) {
            syncEngine
              .getConflictResolver()
              .clearFieldModified(tableName, conflict.entityId, result.field);
          }
        }
        return { success: true };
      } catch (error) {
        logger.error(`Failed to resolve sync conflict: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('sync:resolveAllConflicts', async (_event, useCanvasValues: boolean) => {
    const syncEngine = getSyncEngine();
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not initialized' };
    }

    try {
      const conflictResolver = syncEngine.getConflictResolver();
      const conflicts = conflictResolver.getPendingConflicts();
      const results = conflictResolver.resolveAllConflicts(useCanvasValues);

      // Apply all resolutions to the database
      database.transaction(() => {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const conflict = conflicts[i];
          if (conflict && result) {
            const tableName =
              conflict.entity === 'course'
                ? 'courses'
                : conflict.entity === 'task'
                  ? 'tasks'
                  : 'notifications';
            database.executeWrite(
              `UPDATE ${tableName} SET ${result.field} = ? WHERE id = ?`,
              [result.value, conflict.entityId],
              tableName
            );

            // Clear the modified flag if using Canvas value
            if (useCanvasValues) {
              conflictResolver.clearFieldModified(
                tableName,
                conflict.entityId,
                result.field
              );
            }
          }
        }
      });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to resolve all sync conflicts: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:getSyncPreferences', () => {
    const syncEngine = getSyncEngine();
    if (!syncEngine) {
      return [];
    }
    return syncEngine.getConflictResolver().getAllPreferences();
  });

  ipcMain.handle(
    'sync:deleteSyncPreference',
    (_event, entity: string, entityId: number | null, field: string) => {
      const syncEngine = getSyncEngine();
      if (!syncEngine) {
        return { success: false, error: 'Sync engine not initialized' };
      }

      try {
        syncEngine.getConflictResolver().deletePreference(entity, entityId, field);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Last Sync Time ============

  ipcMain.handle('sync:getLastSyncTime', () => {
    try {
      // Get the most recent sync time from sync_metadata table
      const result = database.executeReadOne<{ last_synced_at: string }>(
        'SELECT MAX(last_synced_at) as last_synced_at FROM sync_metadata'
      );
      return result?.last_synced_at || null;
    } catch (_e) {
      return null;
    }
  });

  // ============ Auto-Sync Preferences ============

  ipcMain.handle('sync:getAutoSyncPreferences', () => {
    try {
      const prefs = database.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'syncPreferences'"
      );
      if (prefs?.value) {
        return JSON.parse(prefs.value);
      }
      return { autoSyncEnabled: true, autoSyncInterval: 15, autoAssignDueDate: false };
    } catch (_e) {
      return { autoSyncEnabled: true, autoSyncInterval: 15, autoAssignDueDate: false };
    }
  });
}
