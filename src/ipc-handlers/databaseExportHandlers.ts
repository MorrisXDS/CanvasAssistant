/**
 * Database Export IPC Handlers
 * Handlers for database export/import and encrypted backup import operations
 */

import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { ExportManager } from '../layers/l2-daemon';
import type { IpcContext } from './IpcContext';

/**
 * Register database export/import IPC handlers
 */
export function registerDatabaseExportHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const getMainWindow = ctx.getMainWindow;
  const getDbPath = ctx.getDbPath;
  const getFilesDir = ctx.getFilesDir;
  const getAppVersion = ctx.getAppVersion;
  const getVisibleDataProvider = ctx.getVisibleDataProvider;
  const getSyncEngine = ctx.getSyncEngine;

  ipcMain.handle('data:exportDatabase', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const downloadsPath = app.getPath('downloads');
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(downloadsPath, `canvas-backup-${new Date().toISOString().split('T')[0]}.db`),
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Save cancelled' };
    }

    try {
      const DB_PATH = getDbPath();
      database.executeWrite('PRAGMA wal_checkpoint(TRUNCATE)', [], 'system');
      fs.copyFileSync(DB_PATH, result.filePath);
      logger.info(`Database exported to: ${result.filePath}`);
      metricsCollector.increment('data.export.database');
      return { success: true, data: { filePath: result.filePath } };
    } catch (error) {
      logger.error('Failed to export database:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('data:importDatabase', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const downloadsPath = app.getPath('downloads');
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: downloadsPath,
      properties: ['openFile'],
      filters: [
        { name: 'Database & Backup Files', extensions: ['db', 'cbk'] },
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'Encrypted Backup', extensions: ['cbk'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'Import cancelled' };
    }

    const importPath = result.filePaths[0];
    const isEncryptedBackup = importPath.toLowerCase().endsWith('.cbk');

    if (isEncryptedBackup) {
      const passwordResult = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Enter Password', 'Cancel'],
        defaultId: 0,
        title: 'Encrypted Backup',
        message: 'This backup file is encrypted.',
        detail: 'Please enter the password to decrypt this backup.',
      });

      if (passwordResult.response === 1) {
        return { success: false, error: 'Import cancelled' };
      }

      mainWindow.webContents.send('request-password-input', { filePath: importPath });
      return {
        success: false,
        error: 'PASSWORD_REQUIRED',
        data: { filePath: importPath, isEncrypted: true },
      };
    }

    try {
      const DB_PATH = getDbPath();

      // Verify it's a valid SQLite database
      const fd = fs.openSync(importPath, 'r');
      const buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      const sqliteMagic = 'SQLite format 3\0';
      if (buffer.toString('utf8', 0, 16) !== sqliteMagic) {
        return {
          success: false,
          error: 'Invalid database file. Not a valid SQLite database.',
        };
      }

      database.close();

      const backupPath = `${DB_PATH}.backup-${Date.now()}`;
      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, backupPath);
      }

      const walPath = `${DB_PATH}-wal`;
      const shmPath = `${DB_PATH}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      fs.copyFileSync(importPath, DB_PATH);

      logger.info(`Database imported from: ${importPath}`);
      logger.info(`Previous database backed up to: ${backupPath}`);
      metricsCollector.increment('data.import.database');

      return {
        success: true,
        data: {
          filePath: importPath,
          backupPath,
          requiresRestart: true,
        },
      };
    } catch (error) {
      logger.error('Failed to import database:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'data:importEncryptedBackup',
    async (_event, params: { filePath: string; password: string }) => {
      const { filePath, password } = params;

      if (!filePath || !password) {
        return { success: false, error: 'File path and password are required' };
      }

      const visibleDataProvider = getVisibleDataProvider();
      if (!visibleDataProvider) {
        return { success: false, error: 'Data provider not initialized' };
      }

      const syncEngine = getSyncEngine();

      try {
        const exportManager = new ExportManager(database, visibleDataProvider, {
          logger,
          filesDir: getFilesDir(),
          appVersion: getAppVersion(),
          syncEngine: syncEngine ?? undefined,
        });

        const result = await exportManager.importEncrypted(filePath, password);

        if (!result.success) {
          return { success: false, error: result.error || 'Decryption failed' };
        }

        logger.info(`Encrypted backup decrypted successfully: ${filePath}`);
        metricsCollector.increment('data.import.encrypted');

        return {
          success: true,
          data: {
            filePath,
            exportData: result.data,
            message: 'Backup decrypted successfully. Data can be reviewed.',
          },
        };
      } catch (error) {
        logger.error('Failed to import encrypted backup:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );
}
