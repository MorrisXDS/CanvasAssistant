/**
 * CSV Export IPC Handlers
 * Handlers for CSV export operations (tasks and grades)
 */

import { ipcMain, dialog } from 'electron';
import { ExportManager } from '../../layers/l2-daemon';
import type { IpcContext } from './IpcContext';

/**
 * Register CSV export IPC handlers
 */
export function registerCsvExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getMainWindow = ctx.getMainWindow;
  const getFilesDir = ctx.getFilesDir;
  const getAppVersion = ctx.getAppVersion;
  const getVisibleDataProvider = ctx.getVisibleDataProvider;
  const getSyncEngine = ctx.getSyncEngine;

  // Export tasks to CSV
  ipcMain.handle(
    'data:exportTasksCsv',
    async (_event, options?: { courseIds?: number[]; status?: string }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      try {
        const dialogResult = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `canvas-tasks-${new Date().toISOString().split('T')[0]}.csv`,
          filters: [
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, error: 'Save cancelled' };
        }

        const visibleDataProvider = getVisibleDataProvider();
        if (!visibleDataProvider) {
          return { success: false, error: 'Data provider not initialized' };
        }

        const syncEngine = getSyncEngine();
        const exportManager = new ExportManager(database, visibleDataProvider, {
          logger,
          filesDir: getFilesDir(),
          appVersion: getAppVersion(),
          syncEngine: syncEngine ?? undefined,
        });

        const exportResult = await exportManager.exportTasksCsv(dialogResult.filePath, {
          courseIds: options?.courseIds,
          status: options?.status as 'all' | 'pending' | 'completed' | undefined,
        });

        if (exportResult.success) {
          // Log to export history
          database.executeWrite(
            `INSERT INTO export_history (export_type, file_path, file_size, tasks_exported, status)
             VALUES ('csv', ?, ?, ?, 'completed')`,
            [
              dialogResult.filePath,
              exportResult.fileSize || 0,
              exportResult.tasksExported || 0,
            ],
            'export_history'
          );
          metricsCollector.increment('data.export.csv.tasks');
        }

        return exportResult;
      } catch (error) {
        logger.error('Failed to export tasks CSV:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Export grades to CSV
  ipcMain.handle(
    'data:exportGradesCsv',
    async (_event, options?: { courseIds?: number[] }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      try {
        const dialogResult = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `canvas-grades-${new Date().toISOString().split('T')[0]}.csv`,
          filters: [
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, error: 'Save cancelled' };
        }

        const visibleDataProvider = getVisibleDataProvider();
        if (!visibleDataProvider) {
          return { success: false, error: 'Data provider not initialized' };
        }

        const syncEngine = getSyncEngine();
        const exportManager = new ExportManager(database, visibleDataProvider, {
          logger,
          filesDir: getFilesDir(),
          appVersion: getAppVersion(),
          syncEngine: syncEngine ?? undefined,
        });

        const exportResult = await exportManager.exportGradesCsv(dialogResult.filePath, {
          courseIds: options?.courseIds,
        });

        if (exportResult.success) {
          // Log to export history
          database.executeWrite(
            `INSERT INTO export_history (export_type, file_path, file_size, tasks_exported, status)
             VALUES ('csv', ?, ?, ?, 'completed')`,
            [
              dialogResult.filePath,
              exportResult.fileSize || 0,
              exportResult.tasksExported || 0,
            ],
            'export_history'
          );
          metricsCollector.increment('data.export.csv.grades');
        }

        return exportResult;
      } catch (error) {
        logger.error('Failed to export grades CSV:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );
}
