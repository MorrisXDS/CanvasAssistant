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
import { ExportHistoryReader } from '../../layers/l1-persistence';
import { RecordExportHistoryCommand } from '../../layers/l4-controller';
import { createSimulationContext } from '../../layers/l4-controller/types';
import type { IpcContext } from './IpcContext';

/**
 * Register export-related IPC handlers for selective exports, encrypted imports,
 * scheduled backups, and export history
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. The
 * export-history read routes through `ExportHistoryReader`; writes through
 * `RecordExportHistoryCommand`; the WAL checkpoint uses `database.checkpoint()`.
 */
export function registerExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const exportHistoryReader = new ExportHistoryReader(database);
  const runContext = () => ({
    db: database,
    simulationContext: createSimulationContext(),
  });
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
          await new RecordExportHistoryCommand().execute(runContext(), {
            exportType: 'selective',
            filePath: dialogResult.filePath,
            fileSize: exportResult.fileSize || 0,
            encrypted: Boolean(options.encrypt),
            coursesIncluded: options.courses || [],
            tasksExported: exportResult.tasksExported || 0,
            filesExported: exportResult.filesExported || 0,
          });
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
      database.checkpoint();

      // Copy database file
      fs.copyFileSync(DB_PATH, backupPath);

      // Log to export history
      const fileStats = fs.statSync(backupPath);
      await new RecordExportHistoryCommand().execute(runContext(), {
        exportType: 'scheduled',
        filePath: backupPath,
        fileSize: fileStats.size,
      });

      logger.info(`Scheduled backup created: ${backupPath}`);
      metricsCollector.increment('data.export.scheduled');

      return { success: true, filePath: backupPath, fileSize: fileStats.size };
    } catch (error) {
      logger.error('Failed to run scheduled backup:', error as Error);

      // Log failure to history
      try {
        await new RecordExportHistoryCommand().execute(runContext(), {
          exportType: 'scheduled',
          status: 'failed',
          errorMessage: String(error),
        });
      } catch {
        // Ignore secondary error
      }

      return { success: false, error: String(error) };
    }
  });

  // ============ Export History ============

  ipcMain.handle('data:getExportHistory', () => {
    try {
      const history = exportHistoryReader.getRecent(50);
      return { success: true, data: history };
    } catch (error) {
      logger.error('Failed to get export history:', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
