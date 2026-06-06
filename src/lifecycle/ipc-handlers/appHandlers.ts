/**
 * App IPC Handlers
 * Handlers for application lifecycle, crash recovery, and error reporting:
 * - Crash info and recovery status
 * - Safe mode management
 * - Database corruption handling
 * - Renderer error reporting
 */

import { ipcMain, app, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { IpcContext } from './IpcContext';
import { getLinuxUninstall } from './linuxUninstall';

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

  // ============ App Restart ============

  // Restart the application
  ipcMain.handle('app:restart', () => {
    logger.info('App restart requested');
    app.relaunch();
    app.exit(0);
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

  // ============ Uninstall Preparation Handlers ============

  /**
   * Prepare for uninstall by cleaning up user data
   * Unlike resetAppState(), this does NOT send app:reset event to renderer
   * so the uninstall modal can show platform-specific instructions first
   */
  ipcMain.handle(
    'app:prepareUninstall',
    async (
      _event,
      options: {
        deleteCredentials: boolean;
        deleteAppData: boolean;
        deleteDownloads: boolean;
      }
    ) => {
      logger.info('Preparing for uninstall', options);

      try {
        const credentialManager = ctx.getCredentialManager();
        const appDataDir = ctx.getAppDataDir();
        const filesDir = ctx.getFilesDir();

        // Delete credentials if requested
        if (options.deleteCredentials) {
          try {
            await credentialManager.delete();
            logger.info('Credentials deleted for uninstall');
          } catch (err) {
            logger.warn(`Failed to delete credentials: ${err}`);
          }
        }

        // Delete app data directory if requested
        if (options.deleteAppData) {
          if (fs.existsSync(appDataDir)) {
            try {
              // Close database first to release file handles
              const database = ctx.getDatabase();
              database.close();

              fs.rmSync(appDataDir, { recursive: true, force: true });
              logger.info('App data deleted for uninstall');
            } catch (err) {
              logger.warn(`Failed to delete app data: ${err}`);
            }
          }
        }

        // Delete downloaded files if requested
        if (options.deleteDownloads) {
          if (fs.existsSync(filesDir)) {
            try {
              fs.rmSync(filesDir, { recursive: true, force: true });
              logger.info('Downloaded files deleted for uninstall');
            } catch (err) {
              logger.warn(`Failed to delete downloads: ${err}`);
            }
          }
        }

        logger.info('Uninstall preparation complete');
        return { success: true };
      } catch (error) {
        logger.error('Failed to prepare for uninstall:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Get the application installation path
   */
  ipcMain.handle('app:getAppPath', () => {
    return {
      appPath: app.getAppPath(),
      exePath: app.getPath('exe'),
      resourcesPath: process.resourcesPath,
    };
  });

  /**
   * Get the current platform
   */
  ipcMain.handle('app:getPlatform', () => {
    return process.platform;
  });

  /**
   * Launch the Windows uninstaller (Windows only)
   */
  ipcMain.handle('app:launchUninstaller', async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Only available on Windows' };
    }

    try {
      // Find uninstaller in the app's installation directory
      // electron-builder NSIS names it "Uninstall <Product Name>.exe"
      const exePath = app.getPath('exe');
      const installDir = path.dirname(exePath);
      // ADR-0014: NSIS names the uninstaller from electron-builder `productName`
      // ("Uninstall Canvas Assistant.exe"), NOT the npm `name`. Since the rename,
      // app.getName() returns "canvas-assistant" (the npm name), so it would point
      // candidate[0] at the wrong "Uninstall canvas-assistant.exe". Use the brand
      // product name constant so candidate[0] matches the real NSIS filename.
      const productName = 'Canvas Assistant';
      const candidates = [
        path.join(installDir, `Uninstall ${productName}.exe`),
        path.join(installDir, 'Uninstall Canvas Assistant.exe'),
        path.join(installDir, 'unins000.exe'),
      ];

      const uninstallerPath = candidates.find((p) => fs.existsSync(p));

      if (!uninstallerPath) {
        logger.warn(
          `Uninstaller not found. Checked: ${candidates.map((c) => path.basename(c)).join(', ')}`
        );
        return {
          success: false,
          error: 'Uninstaller not found. This may be a portable installation.',
        };
      }

      // Launch the uninstaller and quit the app
      logger.info(`Launching uninstaller: ${uninstallerPath}`);

      // Use spawn to launch the uninstaller detached
      const child = spawn(uninstallerPath, [], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.unref();

      // Give the uninstaller a moment to start, then quit
      setTimeout(() => {
        app.quit();
      }, 500);

      return { success: true };
    } catch (error) {
      logger.error('Failed to launch uninstaller:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Open the app's location in the file manager (cross-platform)
   */
  ipcMain.handle('app:openAppLocation', async () => {
    try {
      const exePath = app.getPath('exe');

      // Platform-specific: macOS app bundles have executables inside Contents/MacOS/,
      // but users expect to see the .app bundle in Finder, not the internal executable
      if (process.platform === 'darwin') {
        const appBundlePath = exePath.replace(/\/Contents\/MacOS\/.*$/, '');
        shell.showItemInFolder(appBundlePath);
      } else {
        // On Windows/Linux, show the executable
        shell.showItemInFolder(exePath);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to open app location:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Get the uninstall command for Linux.
   *
   * Delegates to the pure, injectable detector in `linuxUninstall.ts`, which probes
   * dpkg/rpm/pacman to find which package manager owns the running binary and returns
   * the matching removal command (apt/dnf/pacman) — or a safe deb default tagged
   * `unknown`. Synchronous (execFileSync). Wrapped in try/catch so any unexpected
   * error still returns a usable command rather than throwing to the renderer.
   */
  ipcMain.handle('app:getLinuxUninstallCommand', () => {
    try {
      return getLinuxUninstall();
    } catch (error) {
      logger.error('Failed to detect Linux uninstall command:', error as Error);
      const exePath = app.getPath('exe');
      return {
        type: 'unknown' as const,
        command: 'sudo apt remove canvas-assistant',
        path: exePath,
      };
    }
  });
}
