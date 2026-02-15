/**
 * Auto-Sync Manager
 * Handles automatic sync scheduling based on user preferences
 */

import type { BrowserWindow } from 'electron';
import type { Database } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';
import type { MetricsCollector } from '../layers/l0-utilities/MetricsCollector';
import type { SystemMonitor } from '../layers/l0-utilities/SystemMonitor';
import type { SyncEngine } from '../layers/l2-daemon';
import type { CrashProtectionManager } from './CrashProtectionManager';

export interface AutoSyncManagerConfig {
  database: Database;
  logger: Logger;
  metricsCollector: MetricsCollector;
  systemMonitor: SystemMonitor;
  crashProtectionManager: CrashProtectionManager;
  getSyncEngine: () => SyncEngine | null;
  getMainWindow: () => BrowserWindow | null;
}

export class AutoSyncManager {
  private database: Database;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private systemMonitor: SystemMonitor;
  private crashProtectionManager: CrashProtectionManager;
  private getSyncEngine: () => SyncEngine | null;
  private getMainWindow: () => BrowserWindow | null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: AutoSyncManagerConfig) {
    this.database = config.database;
    this.logger = config.logger;
    this.metricsCollector = config.metricsCollector;
    this.systemMonitor = config.systemMonitor;
    this.crashProtectionManager = config.crashProtectionManager;
    this.getSyncEngine = config.getSyncEngine;
    this.getMainWindow = config.getMainWindow;
  }

  /**
   * Start the auto-sync scheduler based on user settings
   */
  start(): void {
    this.stop(); // Clear any existing interval

    // Check if safe mode is enabled (crash loop detected)
    if (this.crashProtectionManager.isSafeModeEnabled()) {
      this.logger.warn(
        'Safe mode enabled - auto-sync disabled. Manual sync is still available.'
      );
      return;
    }

    // Load sync preferences from database
    let autoSyncEnabled = true;
    let autoSyncIntervalMs = 15 * 60 * 1000; // Default 15 minutes

    try {
      const prefs = this.database.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'syncPreferences'"
      );
      if (prefs?.value) {
        const parsed = JSON.parse(prefs.value);
        autoSyncEnabled = parsed.autoSyncEnabled ?? true;
        autoSyncIntervalMs = (parsed.autoSyncInterval ?? 15) * 60 * 1000;
      }
    } catch (_e) {
      // Use defaults
    }

    // Check if auto-sync is disabled (either by flag or by interval=0 meaning "never")
    if (!autoSyncEnabled || autoSyncIntervalMs <= 0) {
      this.logger.info('Auto-sync is disabled (manual sync only)');
      return;
    }

    this.logger.info(
      `Auto-sync enabled, interval: ${autoSyncIntervalMs / 60000} minutes`
    );

    // Start safe mode clear timer if we successfully started auto-sync
    this.crashProtectionManager.startSafeModeClearTimer();

    this.autoSyncInterval = setInterval(async () => {
      const syncEngine = this.getSyncEngine();
      if (!syncEngine || !this.systemMonitor.getState().canSync) {
        this.logger.debug(
          'Auto-sync skipped: sync engine not ready or system state prevents sync'
        );
        return;
      }

      this.logger.info('Auto-sync triggered');
      try {
        // Notify renderer that sync is starting
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:status', 'syncing');
        }

        await syncEngine.syncAll();

        // Notify renderer that sync completed
        const mainWindowAfter = this.getMainWindow();
        if (mainWindowAfter && !mainWindowAfter.isDestroyed()) {
          mainWindowAfter.webContents.send('sync:status', 'idle');
          // Trigger Files page refresh
          mainWindowAfter.webContents.send('file-status-changed', {
            type: 'sync-complete',
          });
        }

        this.metricsCollector.increment('sync.auto.success');
      } catch (error) {
        this.logger.error(`Auto-sync failed: ${error}`);
        this.metricsCollector.increment('sync.auto.failure');

        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:status', 'error');
        }
      }
    }, autoSyncIntervalMs);
  }

  /**
   * Stop the auto-sync scheduler
   */
  stop(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  /**
   * Trigger a sync when window regains focus after being away
   */
  async triggerFocusRestoreSync(): Promise<void> {
    const syncEngine = this.getSyncEngine();
    if (!syncEngine || !this.systemMonitor.getState().canSync) {
      this.logger.debug(
        'Focus restore sync skipped: sync engine not ready or system state prevents sync'
      );
      return;
    }

    this.logger.info('Focus restore sync triggered');

    try {
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:status', 'syncing');
      }

      await syncEngine.syncAll();

      const mainWindowAfter = this.getMainWindow();
      if (mainWindowAfter && !mainWindowAfter.isDestroyed()) {
        mainWindowAfter.webContents.send('sync:status', 'idle');
        // Trigger Files page refresh
        mainWindowAfter.webContents.send('file-status-changed', {
          type: 'sync-complete',
        });
      }

      this.metricsCollector.increment('sync.focus_restore.success');
    } catch (error) {
      this.logger.error(`Focus restore sync failed: ${error}`);
      this.metricsCollector.increment('sync.focus_restore.failure');

      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:status', 'error');
      }
    }
  }
}
