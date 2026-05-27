/**
 * Database Export IPC Handlers
 * Handlers for database export/import and encrypted backup import operations
 */

import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { ExportManager } from '../../layers/l2-daemon';
import type { IpcContext } from './IpcContext';

/**
 * Clear local_path for files that don't exist on disk.
 * After importing a backup, some referenced files may not exist on this machine.
 *
 * @param dbPath - Path to the SQLite database
 * @param logger - Logger instance for diagnostics
 * @returns Number of paths cleared
 */
function clearMissingFilePaths(
  dbPath: string,
  logger: { info: (msg: string) => void; error: (msg: string, err?: Error) => void }
): number {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');

    // Get resources with local_path set
    const rows = db
      .prepare('SELECT id, local_path FROM resources WHERE local_path IS NOT NULL')
      .all() as Array<{ id: number; local_path: string }>;

    // Find which files don't exist
    const missingIds = rows.filter((r) => !fs.existsSync(r.local_path)).map((r) => r.id);

    if (missingIds.length === 0) return 0;

    // Clear local_path for missing files
    const placeholders = missingIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE resources SET local_path = NULL WHERE id IN (${placeholders})`
    ).run(...missingIds);

    logger.info(`Cleared ${missingIds.length} references to missing files`);
    return missingIds.length;
  } catch (error) {
    logger.error('Failed to clear missing file paths:', error as Error);
    return 0;
  } finally {
    db?.close();
  }
}

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
  const getVisibilityOracle = ctx.getVisibilityOracle;
  const getSyncEngine = ctx.getSyncEngine;

  ipcMain.handle('data:exportDatabase', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const downloadsPath = app.getPath('downloads');
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(
        downloadsPath,
        `canvas-backup-${new Date().toISOString().split('T')[0]}.db`
      ),
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

      // Clear references to files that don't exist on this machine
      const clearedPaths = clearMissingFilePaths(DB_PATH, logger);

      logger.info(`Database imported from: ${importPath}`);
      logger.info(`Previous database backed up to: ${backupPath}`);
      if (clearedPaths > 0) {
        logger.info(
          `Cleared ${clearedPaths} references to non-existent downloaded files`
        );
      }
      metricsCollector.increment('data.import.database');

      return {
        success: true,
        data: {
          filePath: importPath,
          backupPath,
          clearedFilePaths: clearedPaths,
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

      const visibilityOracle = getVisibilityOracle();
      if (!visibilityOracle) {
        return { success: false, error: 'Data provider not initialized' };
      }

      const syncEngine = getSyncEngine();

      try {
        const exportManager = new ExportManager(database, visibilityOracle, {
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

  // Diagnostic handler to verify database contents after import
  ipcMain.handle('data:getDatabaseDiagnostics', () => {
    try {
      const diagnostics: Record<string, unknown> = {};

      // Count rows in key tables
      const tables = [
        'courses',
        'tasks',
        'calendar_events',
        'imported_calendars',
        'notifications',
        'resources',
      ];

      for (const table of tables) {
        try {
          const result = database.executeReadOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${table}`
          );
          diagnostics[table] = result?.count ?? 0;
        } catch {
          diagnostics[table] = 'error';
        }
      }

      // Get schema version
      diagnostics.schemaVersion = database.getSchemaVersion();

      // Check imported calendars detail
      const calendars = database.executeRead<{
        id: number;
        name: string;
        event_count: number;
      }>('SELECT id, name, event_count FROM imported_calendars');
      diagnostics.importedCalendarsDetail = calendars;

      // Count calendar events by source type
      const eventsByType = database.executeRead<{
        source_type: string;
        count: number;
      }>(
        `SELECT source_type, COUNT(*) as count FROM calendar_events GROUP BY source_type`
      );
      diagnostics.calendarEventsByType = eventsByType;

      logger.info(`Database diagnostics: ${JSON.stringify(diagnostics)}`);
      return { success: true, data: diagnostics };
    } catch (error) {
      logger.error('Failed to get database diagnostics:', error as Error);
      return { success: false, error: String(error) };
    }
  });
}
