/**
 * Export IPC Handlers
 * Handlers for selective exports, encrypted backup import, scheduled backups, and export history.
 *
 * Note: Database export/import handlers are in databaseExportHandlers.ts
 * Note: Course data export/import handlers are in courseExportHandlers.ts
 * Note: CSV export handlers are in csvExportHandlers.ts
 */

import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { ExportManager } from '../../layers/l2-daemon';
import type { IpcContext } from './IpcContext';

/**
 * Register export-related IPC handlers for selective exports, encrypted imports,
 * scheduled backups, and export history
 */
export function registerExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getMainWindow = ctx.getMainWindow;
  const getDbPath = ctx.getDbPath;
  const getFilesDir = ctx.getFilesDir;
  const getAppVersion = ctx.getAppVersion;
  const getVisibilityOracle = ctx.getVisibilityOracle;
  const getSyncEngine = ctx.getSyncEngine;

  // ============ Selective Export ============

  // Selective export with encryption support
  ipcMain.handle(
    'data:exportSelective',
    async (
      _event,
      options: {
        courses?: number[];
        archivedCourses?: number[];
        includeTasks?: boolean;
        includeNotifications?: boolean;
        includeFiles?: boolean;
        includeGrades?: boolean;
        includeCalendar?: boolean;
        taskStatus?: 'all' | 'pending' | 'completed';
        dateRange?: { start: string; end: string };
        format: 'json' | 'csv' | 'zip';
        encrypt?: boolean;
        password?: string;
      }
    ) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      try {
        // Determine file extension based on format and encryption
        let defaultExt = 'json';
        let filterName = 'JSON Files';
        if (options.format === 'csv') {
          defaultExt = 'csv';
          filterName = 'CSV Files';
        } else if (options.format === 'zip') {
          defaultExt = 'zip';
          filterName = 'ZIP Archives';
        } else if (options.encrypt) {
          defaultExt = 'cbk';
          filterName = 'Canvas Backup (Encrypted)';
        }

        const dialogResult = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `canvas-export-${new Date().toISOString().split('T')[0]}.${defaultExt}`,
          filters: [
            { name: filterName, extensions: [defaultExt] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, error: 'Save cancelled' };
        }

        const visibilityOracle = getVisibilityOracle();
        if (!visibilityOracle) {
          return { success: false, error: 'Data provider not initialized' };
        }

        const syncEngine = getSyncEngine();
        const exportManager = new ExportManager(database, visibilityOracle, {
          logger,
          filesDir: getFilesDir(),
          appVersion: getAppVersion(),
          syncEngine: syncEngine ?? undefined,
        });

        const exportOptions = {
          ...options,
          dateRange: options.dateRange
            ? {
                start: new Date(options.dateRange.start),
                end: new Date(options.dateRange.end),
              }
            : undefined,
        };

        const exportResult = await exportManager.exportSelective(
          dialogResult.filePath,
          exportOptions
        );

        if (exportResult.success) {
          // Log to export history
          database.executeWrite(
            `INSERT INTO export_history (export_type, file_path, file_size, encrypted, courses_included, tasks_exported, files_exported, status)
             VALUES ('selective', ?, ?, ?, ?, ?, ?, 'completed')`,
            [
              dialogResult.filePath,
              exportResult.fileSize || 0,
              options.encrypt ? 1 : 0,
              JSON.stringify(options.courses || []),
              exportResult.tasksExported || 0,
              exportResult.filesExported || 0,
            ],
            'export_history'
          );
          metricsCollector.increment('data.export.selective');
        }

        return exportResult;
      } catch (error) {
        logger.error('Failed to perform selective export:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Import Encrypted (with file dialog) ============

  ipcMain.handle('data:importEncrypted', async (_event, password: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    try {
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Canvas Backup', extensions: ['cbk', 'json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (dialogResult.canceled || !dialogResult.filePaths.length) {
        return { success: false, error: 'Import cancelled' };
      }

      const visibilityOracle = getVisibilityOracle();
      if (!visibilityOracle) {
        return { success: false, error: 'Data provider not initialized' };
      }

      const syncEngine = getSyncEngine();
      const exportManager = new ExportManager(database, visibilityOracle, {
        logger,
        filesDir: getFilesDir(),
        appVersion: getAppVersion(),
        syncEngine: syncEngine ?? undefined,
      });

      return exportManager.importEncrypted(dialogResult.filePaths[0], password);
    } catch (error) {
      logger.error('Failed to import encrypted backup:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ============ Scheduled Backup ============

  // Run scheduled backup manually
  ipcMain.handle('data:runScheduledBackup', async () => {
    try {
      // Get backup destination from settings (via renderer localStorage sync or default)
      const backupDir = path.join(app.getPath('documents'), 'CanvasAssistant', 'backups');

      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupPath = path.join(
        backupDir,
        `scheduled-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
      );

      const DB_PATH = getDbPath();

      // Checkpoint WAL before copying
      database.executeWrite('PRAGMA wal_checkpoint(TRUNCATE)', [], 'system');

      // Copy database file
      fs.copyFileSync(DB_PATH, backupPath);

      // Log to export history
      const fileStats = fs.statSync(backupPath);
      database.executeWrite(
        `INSERT INTO export_history (export_type, file_path, file_size, status)
         VALUES ('scheduled', ?, ?, 'completed')`,
        [backupPath, fileStats.size],
        'export_history'
      );

      logger.info(`Scheduled backup created: ${backupPath}`);
      metricsCollector.increment('data.export.scheduled');

      return { success: true, filePath: backupPath, fileSize: fileStats.size };
    } catch (error) {
      logger.error('Failed to run scheduled backup:', error as Error);

      // Log failure to history
      try {
        database.executeWrite(
          `INSERT INTO export_history (export_type, status, error_message)
           VALUES ('scheduled', 'failed', ?)`,
          [String(error)],
          'export_history'
        );
      } catch {
        // Ignore secondary error
      }

      return { success: false, error: String(error) };
    }
  });

  // ============ Export History ============

  ipcMain.handle('data:getExportHistory', () => {
    try {
      const history = database.executeRead<{
        id: number;
        export_type: string;
        file_path: string;
        file_size: number;
        encrypted: number;
        courses_included: string;
        tasks_exported: number;
        files_exported: number;
        status: string;
        error_message: string | null;
        created_at: string;
      }>('SELECT * FROM export_history ORDER BY created_at DESC LIMIT 50');
      return { success: true, data: history };
    } catch (error) {
      logger.error('Failed to get export history:', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
