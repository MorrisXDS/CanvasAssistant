/**
 * App IPC Handlers
 * Handlers for application lifecycle, crash recovery, and error reporting:
 * - Crash info and recovery status
 * - Safe mode management
 * - Database corruption handling
 * - Renderer error reporting
 */

import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { IpcContext } from './IpcContext';

/**
 * Register all app-related IPC handlers
 */
export function registerAppHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const crashProtectionManager = ctx.getCrashProtectionManager();
  const getAppDataDir = ctx.getAppDataDir;
  const getDbPath = ctx.getDbPath;
  const startAutoSync = ctx.startAutoSync;
  const setDatabaseCorruptionDetected = ctx.setDatabaseCorruptionDetected;

  // ============ Crash Recovery Handlers ============

  // Check if previous session crashed (for recovery dialog)
  ipcMain.handle('app:getCrashInfo', () => {
    const crashCheck = crashProtectionManager.checkCrashFlag();
    return crashCheck.crashed ? crashCheck.data : null;
  });

  // Get current recovery status (safe mode, crash info)
  ipcMain.handle('app:getRecoveryStatus', () => {
    return crashProtectionManager.getRecoveryStatus();
  });

  // Manually exit safe mode (user dismisses recovery banner)
  ipcMain.handle('app:exitSafeMode', () => {
    crashProtectionManager.clearSafeMode();
    // Try to start auto-sync now that safe mode is cleared
    startAutoSync();
    return { success: true };
  });

  // Clear last crash info (user acknowledges crash notification)
  ipcMain.handle('app:dismissCrashNotification', () => {
    crashProtectionManager.setLastCrashInfo(null);
    return { success: true };
  });

  // ============ Database Corruption Handling ============

  // Handle database corruption response
  ipcMain.handle('app:handleCorruption', async (_event, action: string) => {
    logger.info(`User chose corruption action: ${action}`);

    if (action === 'export') {
      // Export data before reset
      try {
        const exportData = database.exportAllData();
        const APP_DATA_DIR = getAppDataDir();
        const exportPath = path.join(
          APP_DATA_DIR,
          `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        );
        fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
        logger.info(`Database exported to ${exportPath}`);
        return { success: true, exportPath };
      } catch (error) {
        logger.error('Failed to export database:', error as Error);
        return { success: false, error: 'Failed to export data' };
      }
    }

    if (action === 'reset') {
      // Close database and delete it for fresh start
      try {
        const DB_PATH = getDbPath();
        database.close();
        // Delete database files
        const dbFiles = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
        for (const file of dbFiles) {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            logger.info(`Deleted ${file}`);
          }
        }
        logger.info('Database reset complete - app will restart');
        // Restart the app
        app.relaunch();
        app.exit(0);
        return { success: true };
      } catch (error) {
        logger.error('Failed to reset database:', error as Error);
        return { success: false, error: 'Failed to reset database' };
      }
    }

    if (action === 'continue') {
      // User chose to continue with potentially corrupted database
      setDatabaseCorruptionDetected(null);
      logger.warn('User chose to continue with corrupted database');
      return { success: true };
    }

    return { success: false, error: 'Unknown action' };
  });

  // ============ Error Reporting ============

  // Handle renderer error reports (from React error boundaries)
  ipcMain.handle(
    'app:reportError',
    (
      _event,
      errorInfo: {
        message: string;
        stack?: string;
        componentStack?: string;
        timestamp: string;
      }
    ) => {
      logger.error(
        `Renderer error: ${errorInfo.message}`,
        errorInfo.stack ? new Error(errorInfo.stack) : undefined
      );
      metricsCollector.increment('renderer.error_reported');

      // Record in crash history as a soft error (doesn't trigger safe mode)
      crashProtectionManager.recordSoftError(
        `renderer_error: ${errorInfo.message.substring(0, 100)}`,
        errorInfo.timestamp
      );

      return { success: true };
    }
  );
}
