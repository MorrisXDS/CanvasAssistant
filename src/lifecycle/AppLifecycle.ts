/**
 * AppLifecycle
 * Holds all mutable state and lifecycle methods for the Electron main process.
 * Constructed after immutable services are initialized, wired to app events by main.ts.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

// L0 - Utilities
import type { Logger, ComponentLogger } from '../layers/l0-utilities/Logger';
import type { SystemMonitor } from '../layers/l0-utilities/SystemMonitor';
import type { CredentialManager } from '../layers/l0-utilities/CredentialManager';
import type { HealthCheck } from '../layers/l0-utilities/HealthCheck';
import type { MetricsCollector } from '../layers/l0-utilities/MetricsCollector';
import type { HousekeepingManager } from '../layers/l0-utilities/HousekeepingManager';
import type { FileDownloadManager } from '../layers/l0-utilities/FileDownloadManager';
import type { FileWatcher } from '../layers/l0-utilities/FileWatcher';
import { IdleStateManager } from '../layers/l0-utilities/IdleStateManager';

// L1 - Persistence
import {
  Database,
  MigrationRunner,
  coreMigrations,
  VisibilityOracle,
  CanvasFileReader,
  AnnouncementAttachmentReader,
  FileEntityProvider,
  runPostImportRepairs,
} from '../layers/l1-persistence';

// L2 - Daemon
import {
  RateLimiter,
  CircuitBreaker,
  htmlToPlainText,
  OperationCoordinator,
} from '../layers/l2-daemon';
import { HtmlLocalPathManager } from '../layers/l2-daemon/html/HtmlLocalPathManager';
import { UpdateChecker } from '../layers/l2-daemon/update/UpdateChecker';

// L4 - Controller
import { CommandDispatcher } from '../layers/l4-controller';
import { SetUserPreferenceCommand } from '../layers/l4-controller/commands/settings/SetUserPreferenceCommand';
import { UserPreferencesReader } from '../layers/l1-persistence';

// Crash Protection
import type { CrashProtectionManager } from './CrashProtectionManager';

// Managers
import { BackupManager } from './BackupManager';
import { AutoSyncManager } from './AutoSyncManager';
import { WindowManager } from './WindowManager';
import { CanvasClientManager } from './CanvasClientManager';
import { registerCanvasFileProtocol } from './canvasFileProtocol';

// IPC Handlers
import {
  registerIntelligenceHandlers,
  registerCalendarHandlers,
  registerDataHandlers,
  registerCourseDataHandlers,
  registerTaskDataHandlers,
  registerNotificationDataHandlers,
  registerFileDataHandlers,
  registerFileHandlers,
  registerSyncHandlers,
  registerSyncUpdatesHandlers,
  registerTaskTypesHandlers,
  registerSystemHandlers,
  registerWindowHandlers,
  registerCredentialHandlers,
  registerSettingsHandlers,
  registerExportHandlers,
  registerDatabaseExportHandlers,
  registerAppHandlers,
  registerPagesHandlers,
  registerHtmlExportHandlers,
  registerResourceHandlers,
  registerHtmlDependencyHandlers,
  registerCommandHandlers,
  registerBackupScheduleHandlers,
  registerUpdateHandlers,
} from './ipc-handlers';
import type { IpcContext } from './ipc-handlers';

// Lifecycle utilities
import { CONFIG_DIR, FILES_DIR, DB_PATH, BACKUP_DIR, APP_DATA_DIR } from './appPaths';
import {
  getWindowBehavior,
  setWindowBehavior,
  getSyncPreferences,
  getLocalHtmlPathsSettings,
} from './appSettings';
import type { WindowBehaviorSettings } from './appSettings';
import { savePendingDownloads, restorePendingDownloads } from './downloadPersistence';
import { resetAppState } from './resetAppState';

// Database corruption state
interface DatabaseCorruptionInfo {
  errors: string[];
  canContinue: boolean;
}

/**
 * Configuration for constructing AppLifecycle.
 * All fields are immutable services created before app.whenReady().
 */
export interface AppLifecycleConfig {
  logger: Logger;
  database: Database;
  migrationRunner: MigrationRunner;
  systemMonitor: SystemMonitor;
  credentialManager: CredentialManager;
  healthCheck: HealthCheck;
  metricsCollector: MetricsCollector;
  housekeepingManager: HousekeepingManager;
  fileDownloadManager: FileDownloadManager;
  fileWatcher: FileWatcher;
  rateLimiter: RateLimiter;
  circuitBreaker: CircuitBreaker;
  crashProtectionManager: CrashProtectionManager;
  databaseLogger: ComponentLogger;
  commandDispatcherLogger: ComponentLogger;
}

export class AppLifecycle {
  // Immutable services (passed in, not owned)
  private readonly logger: Logger;
  private readonly database: Database;
  private readonly migrationRunner: MigrationRunner;
  private readonly systemMonitor: SystemMonitor;
  private readonly credentialManager: CredentialManager;
  private readonly healthCheck: HealthCheck;
  private readonly metricsCollector: MetricsCollector;
  private readonly housekeepingManager: HousekeepingManager;
  private readonly fileDownloadManager: FileDownloadManager;
  private readonly fileWatcher: FileWatcher;
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly crashProtectionManager: CrashProtectionManager;
  private readonly databaseLogger: ComponentLogger;
  private readonly commandDispatcherLogger: ComponentLogger;

  // Mutable state - lazy-initialized services
  private visibilityOracle: VisibilityOracle | null = null;
  private fileEntityProvider: FileEntityProvider | null = null;
  private htmlLocalPathManager: HtmlLocalPathManager | null = null;
  private operationCoordinator: OperationCoordinator | null = null;
  private commandDispatcher: CommandDispatcher | null = null;
  private windowManager: WindowManager | null = null;
  private canvasClientManager: CanvasClientManager | null = null;
  private autoSyncManager: AutoSyncManager | null = null;
  private backupManager: BackupManager | null = null;
  private updateChecker: UpdateChecker | null = null;
  private idleStateManager: IdleStateManager | null = null;

  // Mutable flags
  private isQuitting = false;
  private databaseCorruptionDetected: DatabaseCorruptionInfo | null = null;
  private gracefulShutdownInProgress = false;
  private shutdownAcknowledged = false;

  private readonly GRACEFUL_SHUTDOWN_TIMEOUT_MS = 3000;

  constructor(config: AppLifecycleConfig) {
    this.logger = config.logger;
    this.database = config.database;
    this.migrationRunner = config.migrationRunner;
    this.systemMonitor = config.systemMonitor;
    this.credentialManager = config.credentialManager;
    this.healthCheck = config.healthCheck;
    this.metricsCollector = config.metricsCollector;
    this.housekeepingManager = config.housekeepingManager;
    this.fileDownloadManager = config.fileDownloadManager;
    this.fileWatcher = config.fileWatcher;
    this.rateLimiter = config.rateLimiter;
    this.circuitBreaker = config.circuitBreaker;
    this.crashProtectionManager = config.crashProtectionManager;
    this.databaseLogger = config.databaseLogger;
    this.commandDispatcherLogger = config.commandDispatcherLogger;

    // Register shutdown acknowledgment handler
    ipcMain.on('app:shutdown-acknowledged', () => {
      this.shutdownAcknowledged = true;
      this.logger.info('Renderer acknowledged shutdown');
    });
  }

  // ---- Getters for backwards compatibility ----

  private getMainWindow(): BrowserWindow | null {
    return this.windowManager?.getMainWindow() ?? null;
  }

  private getCanvasClient() {
    return this.canvasClientManager?.getCanvasClient() ?? null;
  }

  private getSyncEngine() {
    return this.canvasClientManager?.getSyncEngine() ?? null;
  }

  // ---- Bound settings helpers (close over CONFIG_DIR / database) ----

  private boundGetWindowBehavior = (): WindowBehaviorSettings => {
    return getWindowBehavior(CONFIG_DIR);
  };

  private boundSetWindowBehavior = (settings: WindowBehaviorSettings): void => {
    setWindowBehavior(CONFIG_DIR, settings, this.logger);
  };

  private boundGetSyncPreferences = () => {
    return getSyncPreferences(this.database);
  };

  private boundGetLocalHtmlPathsSettings = () => {
    return getLocalHtmlPathsSettings(this.database);
  };

  // ---- Canvas client initialization ----

  private async initializeCanvasClient(token: string, baseUrl: string): Promise<boolean> {
    if (!this.canvasClientManager) {
      this.logger.error('CanvasClientManager not initialized');
      return false;
    }
    return this.canvasClientManager.initialize(token, baseUrl);
  }

  // ---- Health probes ----

  private registerHealthProbes(): void {
    this.healthCheck.registerProbe({
      name: 'database',
      check: () => {
        try {
          this.database.getSchemaVersion();
          return 'healthy';
        } catch {
          return 'unhealthy';
        }
      },
      recommendedAction: 'Check database file permissions and disk space',
    });

    this.healthCheck.registerProbe({
      name: 'canvas-api',
      check: () => {
        const status = this.circuitBreaker.getStatus();
        if (status.state === 'open') return 'unhealthy';
        if (status.state === 'half-open') return 'degraded';
        return 'healthy';
      },
      recommendedAction: 'Check Canvas API credentials and connectivity',
    });

    this.healthCheck.registerProbe({
      name: 'memory',
      check: () => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        if (used > 500) return 'unhealthy';
        if (used > 300) return 'degraded';
        return 'healthy';
      },
      recommendedAction: 'Restart the application to free memory',
    });
  }

  // ---- Public accessors for external wiring ----

  /** Used by CrashProtectionManager (wired in main.ts before lifecycle is fully ready) */
  getMainWindowForCrashProtection(): BrowserWindow | null {
    return this.getMainWindow();
  }

  /** Handle second-instance event from Electron */
  handleSecondInstance(): void {
    this.windowManager?.handleSecondInstance();
  }

  // ---- Lifecycle Methods ----

  async onReady(): Promise<void> {
    this.logger.info('Canvas Integration Dashboard starting...');
    this.logger.info(
      `Platform: ${process.platform}, Electron: ${process.versions.electron}`
    );
    this.logger.info(`Data directory: ${APP_DATA_DIR}`);

    // Check for previous crash and crash loop
    const crashCheck = this.crashProtectionManager.checkCrashFlag();
    if (crashCheck.crashed && crashCheck.data) {
      this.logger.warn(
        `Previous session crashed at ${crashCheck.data.timestamp}: ${crashCheck.data.reason}`
      );
      this.metricsCollector.increment('app.crash_recovery');

      this.crashProtectionManager.setLastCrashInfo({
        timestamp: crashCheck.data.timestamp,
        reason: crashCheck.data.reason,
      });

      this.crashProtectionManager.clearCrashFlag();
    }

    // Check for crash loop (3+ crashes in 10 minutes)
    const crashLoopCheck = this.crashProtectionManager.checkCrashLoop();
    if (crashLoopCheck.inLoop) {
      this.crashProtectionManager.setSafeModeEnabled(true);
      this.logger.warn(
        `Crash loop detected: ${crashLoopCheck.crashCount} crashes in last 10 minutes. Entering safe mode (auto-sync disabled).`
      );
      this.metricsCollector.increment('app.safe_mode_entered');
    } else {
      const history = this.crashProtectionManager.loadCrashHistory();
      if (history.safeMode) {
        this.crashProtectionManager.setSafeModeEnabled(true);
        this.logger.info('Resuming in safe mode from previous session');
        this.crashProtectionManager.startSafeModeClearTimer();
      }
    }

    // Write crash flag - will be cleared on clean exit
    this.crashProtectionManager.writeCrashFlag('session_start');

    // If previous session crashed, perform WAL recovery before initializing
    if (crashCheck.crashed) {
      this.logger.info('Previous session crashed - performing WAL recovery...');
      const walRecovery = this.database.recoverWal();
      if (walRecovery.success) {
        if (walRecovery.walSizeBeforeBytes) {
          this.logger.info(
            `WAL recovery successful, recovered ${walRecovery.walSizeBeforeBytes} bytes`
          );
        } else {
          this.logger.info('WAL recovery complete (no pending changes)');
        }
      } else {
        this.logger.warn(`WAL recovery warning: ${walRecovery.error}`);
      }
    }

    // Initialize database and run migrations
    try {
      this.database.initialize();
      this.migrationRunner.loadMigrations(coreMigrations);
      const migrationResult = this.migrationRunner.runAll();
      const currentVersion = this.database.getSchemaVersion();
      this.logger.info(
        `Database initialized at version ${currentVersion}, ${migrationResult.applied} migrations applied`
      );
      if (migrationResult.errors.length > 0) {
        this.logger.error(`Migration errors: ${migrationResult.errors.join(', ')}`);
      }

      // Verify critical schema elements exist
      this.verifyAndRepairSchema(currentVersion);

      this.metricsCollector.increment('database.initialized');

      // If previous session crashed, check database integrity
      if (crashCheck.crashed) {
        this.logger.info('Running database integrity check after crash...');
        const integrityCheck = this.database.checkIntegrity();
        if (!integrityCheck.ok) {
          this.logger.error(
            `Database integrity check failed: ${integrityCheck.errors.join(', ')}`
          );
          this.metricsCollector.increment('database.corruption_detected');
          this.databaseCorruptionDetected = {
            errors: integrityCheck.errors,
            canContinue: integrityCheck.errors.length < 5,
          };
        } else {
          this.logger.info('Database integrity check passed');
        }
      }

      // Run post-import repairs (safe to run every startup, only repairs if needed)
      const repairResult = runPostImportRepairs(this.database, this.logger);
      if (repairResult.calendarRepair.calendarEventsCreated > 0) {
        this.logger.info(
          `Post-import repair: Created ${repairResult.calendarRepair.calendarEventsCreated} missing calendar events`
        );
      }
      if (repairResult.calendarVerification.issues.length > 0) {
        this.logger.info(
          `Calendar verification issues: ${repairResult.calendarVerification.issues.join('; ')}`
        );
      }

      // Clean HTML from all notification messages to ensure layer isolation
      const allNotifications = this.database.executeRead<{ id: number; message: string }>(
        'SELECT id, message FROM notifications'
      );
      if (allNotifications.length > 0) {
        let cleaned = 0;
        this.database.transaction(() => {
          for (const row of allNotifications) {
            const cleanMessage = htmlToPlainText(row.message);
            if (cleanMessage !== row.message) {
              this.database.executeWrite(
                'UPDATE notifications SET message = ? WHERE id = ?',
                [cleanMessage, row.id]
              );
              cleaned++;
            }
          }
        });
        if (cleaned > 0) {
          this.logger.info(`Cleaned HTML from ${cleaned} notification messages`);
        }
      }

      // Register canvas-file:// protocol handler
      registerCanvasFileProtocol({
        database: this.database,
        logger: this.logger,
        credentialManager: this.credentialManager,
        filesDir: FILES_DIR,
      });

      // Clean up old embedded- resource entries
      const embeddedCleanup = this.database.executeWrite(
        `DELETE FROM resources WHERE external_id LIKE 'embedded-%'`,
        [],
        'resources'
      );
      if (embeddedCleanup.changes > 0) {
        this.logger.info(
          `Cleaned up ${embeddedCleanup.changes} old embedded resource entries`
        );
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-status-changed', {
            type: 'cleanup',
            message: `Removed ${embeddedCleanup.changes} duplicate entries`,
          });
        }
      }

      // Auto-complete tasks that have both weight > 0 and grade set
      const autoCompleteResult = this.database.executeWrite(
        `UPDATE tasks SET
          is_completed = 1,
          completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE weight > 0 AND grade IS NOT NULL AND is_completed = 0`,
        [],
        'tasks'
      );
      if (autoCompleteResult.changes > 0) {
        this.logger.info(`Auto-completed ${autoCompleteResult.changes} graded tasks`);
      }

      // Initialize L1 VisibilityOracle
      this.visibilityOracle = new VisibilityOracle(this.database);

      // Initialize L1 FileEntityProvider (ADR-0008) and its readers
      this.fileEntityProvider = new FileEntityProvider(
        new CanvasFileReader(this.database),
        new AnnouncementAttachmentReader(this.database),
        this.logger.child('FileEntityProvider')
      );

      // Initialize OperationCoordinator
      this.operationCoordinator = new OperationCoordinator({
        db: this.database,
        logger: this.logger.child('OperationCoordinator'),
      });

      // Initialize HtmlLocalPathManager
      this.htmlLocalPathManager = new HtmlLocalPathManager(this.database, {
        filesBaseDir: FILES_DIR,
        logger: this.logger,
        autoRegenerate: true,
      });

      // Initialize CanvasClientManager
      this.canvasClientManager = new CanvasClientManager({
        database: this.database,
        logger: this.logger,
        metricsCollector: this.metricsCollector,
        credentialManager: this.credentialManager,
        rateLimiter: this.rateLimiter,
        circuitBreaker: this.circuitBreaker,
        fileDownloadManager: this.fileDownloadManager,
        filesDir: FILES_DIR,
        getMainWindow: () => this.getMainWindow(),
        getVisibilityOracle: () => this.visibilityOracle,
        getOperationCoordinator: () => this.operationCoordinator,
        getSyncPreferences: this.boundGetSyncPreferences,
      });

      // Initialize L4 CommandDispatcher
      this.commandDispatcher = new CommandDispatcher({
        db: this.database,
        visibilityOracle: this.visibilityOracle ?? undefined,
        logger: this.commandDispatcherLogger,
      });

      // Forward sync requests from CommandDispatcher to SyncEngine
      this.commandDispatcher.on('sync-requested', async (event) => {
        const syncEngine = this.getSyncEngine();
        if (syncEngine && this.systemMonitor.getState().canSync) {
          this.logger.info(`Sync requested: ${event.type}`);
          try {
            if (event.type === 'full') {
              await syncEngine.syncAll();
            } else if (event.type === 'courses') {
              await syncEngine.syncCourses();
            }
          } catch (error) {
            this.logger.error(`Sync failed: ${error}`);
          }
        }
      });

      // Track command metrics
      this.commandDispatcher.on('command-completed', ({ command }) => {
        this.metricsCollector.increment(`command.${command}.executed`);
      });

      // Forward simulation state changes to renderer
      this.commandDispatcher.on('simulation-changed', (event) => {
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('simulation:changed', event);
          this.logger.debug(`Simulation changed: ${event.type}`);
        }
      });

      // Forward database commit events to renderer
      this.database.on('commit', (event: { table: string }) => {
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('db:commit', event);
        }
      });

      this.logger.info('Command dispatcher initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize database: ${error}`);
      this.metricsCollector.increment('database.init_error');
    }

    // Register health probes
    this.registerHealthProbes();

    // Initialize managers
    this.windowManager = new WindowManager({
      logger: this.logger,
      metricsCollector: this.metricsCollector,
      systemMonitor: this.systemMonitor,
      crashProtectionManager: this.crashProtectionManager,
      preloadPath: path.join(__dirname, '..', 'preload.js'),
      configDir: CONFIG_DIR,
      getAutoSyncManager: () => this.autoSyncManager,
      getWindowBehavior: this.boundGetWindowBehavior,
      getDatabaseCorruptionDetected: () => this.databaseCorruptionDetected,
      isQuitting: () => this.isQuitting,
      setIsQuitting: (value: boolean) => {
        this.isQuitting = value;
      },
    });

    this.autoSyncManager = new AutoSyncManager({
      database: this.database,
      logger: this.logger,
      metricsCollector: this.metricsCollector,
      systemMonitor: this.systemMonitor,
      crashProtectionManager: this.crashProtectionManager,
      getSyncEngine: () => this.getSyncEngine(),
      getMainWindow: () => this.getMainWindow(),
    });

    this.backupManager = new BackupManager({
      database: this.database,
      dbPath: DB_PATH,
      backupDir: BACKUP_DIR,
      logger: this.logger,
      metricsCollector: this.metricsCollector,
      getMainWindow: () => this.getMainWindow(),
    });

    // Initialize UpdateChecker (ADR-0012). Depends on database being available
    // (same dependency chain as BackupManager). Self-gates on enabled flag.
    this.updateChecker = new UpdateChecker({
      getMainWindow: () => this.getMainWindow(),
      userPreferencesReader: new UserPreferencesReader(this.database),
      setUserPreferenceCommand: new SetUserPreferenceCommand(),
      database: this.database,
      currentVersion: app.getVersion(),
      logger: this.logger.child('UpdateChecker'),
    });

    // Build IPC context and register handlers
    this.registerAllIpcHandlers();

    // Start background services
    this.healthCheck.start();
    this.metricsCollector.start();
    this.housekeepingManager.start();

    // Read persisted Canvas base URL and initialize client
    await this.initializeCanvasClientFromCredentials();

    // Start backup scheduler
    this.backupManager?.start();

    // Start update checker (ADR-0012) — self-gates on `enabled` preference.
    this.updateChecker?.start();

    // Restore pending downloads
    try {
      restorePendingDownloads(this.database, this.fileDownloadManager, this.logger);
    } catch (error) {
      this.logger.error('Failed to restore pending downloads', error as Error);
    }

    this.windowManager?.createWindow();

    // Create system tray icon if enabled (Windows only — macOS uses Dock, Linux tray is unreliable)
    if (process.platform === 'win32' && this.boundGetWindowBehavior().showTrayIcon) {
      this.windowManager?.createTray();
    }

    // Start FileWatcher
    this.fileWatcher.start();
    this.wireFileWatcherEvents();

    // Start IdleStateManager — must be after app.whenReady(); wires suspend/resume protection
    this.idleStateManager = new IdleStateManager({
      logger: this.logger,
      onSuspend: async () => {
        this.logger.info('[AppLifecycle] Suspend: pausing sync and file watcher');
        this.autoSyncManager?.stop();
        this.fileWatcher.pause();
        const syncEngine = this.getSyncEngine();
        if (syncEngine) {
          try {
            syncEngine.abort();
          } catch (err) {
            this.logger.error(
              '[AppLifecycle] Failed to abort sync on suspend',
              err as Error
            );
          }
        }
      },
      onResume: async () => {
        this.logger.info('[AppLifecycle] Resume: restarting file watcher and sync');
        this.fileWatcher.resume();
        // Re-scan for any changes that occurred while paused
        await this.fileWatcher.scanForChanges();
        // Only restart auto-sync if the system monitor says sync is safe
        if (this.systemMonitor.getState().canSync) {
          this.autoSyncManager?.start();
        }
      },
      onCheckpoint: () => {
        this.database.checkpoint();
        this.logger.info('[AppLifecycle] WAL checkpoint completed before suspend');
      },
    });
    this.idleStateManager.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.windowManager?.createWindow();
      }
    });
  }

  async onBeforeQuit(event: Electron.Event): Promise<void> {
    this.logger.info('Application preparing to quit...');
    this.isQuitting = true;

    if (this.gracefulShutdownInProgress) {
      return;
    }
    this.gracefulShutdownInProgress = true;

    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();

      this.logger.info('Notifying renderer of shutdown...');
      mainWindow.webContents.send('app:shutdown-requested', {
        gracePeriodMs: this.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
      });

      const startTime = Date.now();
      while (
        !this.shutdownAcknowledged &&
        Date.now() - startTime < this.GRACEFUL_SHUTDOWN_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (this.shutdownAcknowledged) {
        this.logger.info('Graceful shutdown: renderer acknowledged');
      } else {
        this.logger.warn('Graceful shutdown: timed out waiting for renderer');
      }

      app.quit();
    }
  }

  onWindowAllClosed(): void {
    this.logger.info('All windows closed');

    // macOS: Never quit on window close — standard behavior, app stays in Dock
    if (process.platform === 'darwin') {
      return;
    }

    // Linux: Always quit on window close — no tray support
    if (process.platform === 'linux') {
      app.quit();
      return;
    }

    // Windows: Quit unless minimize-to-tray is active
    if (this.isQuitting) {
      app.quit();
      return;
    }

    const settings = this.boundGetWindowBehavior();
    if (settings.closeAction !== 'minimize-to-tray') {
      app.quit();
    } else {
      this.logger.info('Staying in tray (minimize-to-tray enabled)');
    }
  }

  onQuit(): void {
    this.logger.info('Application quitting...');

    // Flush window state before cleanup
    this.windowManager?.flushWindowState();

    // Clean up tray
    this.windowManager?.destroyTray();

    // Stop managers
    this.autoSyncManager?.stop();
    this.backupManager?.stop();
    this.updateChecker?.stop();
    this.idleStateManager?.stop();

    // Abort any in-flight sync operations
    const syncEngine = this.getSyncEngine();
    if (syncEngine) {
      try {
        syncEngine.abort();
        this.logger.info('Sync engine aborted');
      } catch (error) {
        this.logger.error('Failed to abort sync engine', error as Error);
      }
    }

    // Clear safe mode timer if running
    this.crashProtectionManager.stopSafeModeClearTimer();

    // Clear crash flag on clean exit
    this.crashProtectionManager.clearCrashFlag();

    // Clear simulation state (as per spec: clears on app close)
    if (this.commandDispatcher) {
      this.commandDispatcher.clearSimulation();
    }

    // Stop all background services
    this.fileWatcher.stop();
    this.systemMonitor.stop();
    this.healthCheck.stop();
    this.metricsCollector.stop();
    this.housekeepingManager.stop();
    this.circuitBreaker.stop();

    // Save pending downloads for recovery
    savePendingDownloads(this.database, this.fileDownloadManager, this.logger);
    this.fileDownloadManager.stop();

    // Close database with timeout protection
    const closeTimeout = setTimeout(() => {
      this.logger.warn('Database close timed out');
    }, 2000);
    try {
      this.database.close();
      clearTimeout(closeTimeout);
    } catch (_e) {
      clearTimeout(closeTimeout);
      this.logger.error('Database close failed:', _e as Error);
    }

    this.logger.close();
  }

  // ---- Private helpers ----

  private verifyAndRepairSchema(currentVersion: number): void {
    const schemaChecks = [
      {
        name: 'visibility_settings table',
        sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name='visibility_settings'",
        repair: `
          CREATE TABLE IF NOT EXISTS visibility_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT OR IGNORE INTO visibility_settings (key, value) VALUES ('term_selection', 'auto');
        `,
      },
      {
        name: 'courses.archived_at column',
        sql: "SELECT 1 FROM pragma_table_info('courses') WHERE name='archived_at'",
        repair: `
          ALTER TABLE courses ADD COLUMN archived_at DATETIME DEFAULT NULL;
          CREATE INDEX IF NOT EXISTS idx_courses_archived ON courses(archived_at);
        `,
      },
      {
        name: 'calendar_events.task_id column',
        sql: "SELECT 1 FROM pragma_table_info('calendar_events') WHERE name='task_id'",
        repair: `
          ALTER TABLE calendar_events ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;
          ALTER TABLE calendar_events ADD COLUMN color TEXT;
          ALTER TABLE calendar_events ADD COLUMN notes TEXT;
          ALTER TABLE calendar_events ADD COLUMN reminder_minutes INTEGER;
          CREATE INDEX IF NOT EXISTS idx_calendar_events_task ON calendar_events(task_id);
        `,
      },
    ];

    const missingSchema: string[] = [];
    for (const check of schemaChecks) {
      try {
        const result = this.database.executeRead<{ '1': number }>(check.sql);
        if (result.length === 0) {
          missingSchema.push(check.name);
        }
      } catch {
        missingSchema.push(check.name);
      }
    }

    if (missingSchema.length === 0) return;

    this.logger.warn(
      `Missing schema elements: ${missingSchema.join(', ')}. DB version: ${currentVersion}. Attempting repair...`
    );

    const repairFailed: string[] = [];
    for (const check of schemaChecks) {
      if (!missingSchema.includes(check.name)) continue;
      try {
        this.database.exec(check.repair);
        this.logger.info(`Repaired: ${check.name}`);
      } catch (repairErr) {
        const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
        if (!msg.includes('duplicate column name')) {
          this.logger.error(`Failed to repair ${check.name}: ${msg}`);
          repairFailed.push(check.name);
        } else {
          this.logger.info(`Repair skipped (already exists): ${check.name}`);
        }
      }
    }

    if (repairFailed.length > 0) {
      this.logger.error(
        `Schema repair failed for: ${repairFailed.join(', ')}. Database may need reset.`
      );

      app.whenReady().then(() => {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'Database Migration Required',
          message: 'Your database is missing required schema updates.',
          detail: `Could not auto-repair: ${repairFailed.join(', ')}\n\nPlease delete the database file and restart:\n${DB_PATH}\n\nYour data will re-sync from Canvas.`,
          buttons: ['OK'],
        });
      });
    } else {
      this.logger.info('Schema repair completed successfully');
    }
  }

  private registerAllIpcHandlers(): void {
    const ipcContext: IpcContext = {
      getMainWindow: () => this.getMainWindow(),
      getDatabase: () => this.database,
      getLogger: () => this.logger,
      getMetricsCollector: () => this.metricsCollector,
      getCredentialManager: () => this.credentialManager,
      getFileDownloadManager: () => this.fileDownloadManager,
      getHealthCheck: () => this.healthCheck,
      getSystemMonitor: () => this.systemMonitor,
      getVisibilityOracle: () => this.visibilityOracle,
      getFileEntityProvider: () => this.fileEntityProvider,
      getCanvasClient: () => this.getCanvasClient(),
      getSyncEngine: () => this.getSyncEngine(),
      getOperationCoordinator: () => this.operationCoordinator,
      clearCanvasClient: () => {
        this.canvasClientManager?.clear();
      },
      initializeCanvasClient: (token: string, baseUrl: string) =>
        this.initializeCanvasClient(token, baseUrl),
      getCommandDispatcher: () => this.commandDispatcher,
      getWindowBehavior: this.boundGetWindowBehavior,
      setWindowBehavior: this.boundSetWindowBehavior,
      getLocalHtmlPathsSettings: this.boundGetLocalHtmlPathsSettings,
      getIsQuitting: () => this.isQuitting,
      setIsQuitting: (value: boolean) => {
        this.isQuitting = value;
      },
      getConfigDir: () => CONFIG_DIR,
      getFilesDir: () => FILES_DIR,
      getDbPath: () => DB_PATH,
      getBackupDir: () => BACKUP_DIR,
      getAppVersion: () => app.getVersion(),
      getSyncPreferences: this.boundGetSyncPreferences,
      startAutoSync: () => this.autoSyncManager?.start(),
      stopAutoSync: () => this.autoSyncManager?.stop(),
      getCrashProtectionManager: () => this.crashProtectionManager,
      getAppDataDir: () => APP_DATA_DIR,
      getDatabaseCorruptionDetected: () => this.databaseCorruptionDetected,
      setDatabaseCorruptionDetected: (
        value: { errors: string[]; canContinue: boolean } | null
      ) => {
        this.databaseCorruptionDetected = value;
      },
      resetWindowSize: () => this.windowManager?.resetWindowSize(),
      createTray: () => this.windowManager?.createTray(),
      destroyTray: () => this.windowManager?.destroyTray(),
      resetAppState: (options: { deleteToken: boolean }) =>
        resetAppState(
          {
            database: this.database,
            logger: this.logger,
            metricsCollector: this.metricsCollector,
            credentialManager: this.credentialManager,
            fileWatcher: this.fileWatcher,
            configDir: CONFIG_DIR,
            filesDir: FILES_DIR,
            getMainWindow: () => this.getMainWindow(),
            getSyncEngine: () => this.getSyncEngine(),
            canvasClientManager: this.canvasClientManager,
          },
          options
        ),
      getUpdateChecker: () => this.updateChecker,
    };

    registerIntelligenceHandlers(ipcContext);
    registerCalendarHandlers(ipcContext);
    registerDataHandlers(ipcContext);
    registerCourseDataHandlers(ipcContext);
    registerTaskDataHandlers(ipcContext);
    registerNotificationDataHandlers(ipcContext);
    registerFileDataHandlers(ipcContext);
    registerFileHandlers(ipcContext);
    registerSyncHandlers(ipcContext);
    registerSyncUpdatesHandlers(ipcContext);
    registerTaskTypesHandlers(ipcContext);
    registerSystemHandlers(ipcContext);
    registerWindowHandlers(ipcContext);
    registerCredentialHandlers(ipcContext);
    registerSettingsHandlers(ipcContext);
    registerExportHandlers(ipcContext);
    registerDatabaseExportHandlers(ipcContext);
    registerAppHandlers(ipcContext);
    registerPagesHandlers(ipcContext);
    registerHtmlExportHandlers(ipcContext);
    registerResourceHandlers(ipcContext);
    registerHtmlDependencyHandlers(ipcContext);
    registerCommandHandlers(ipcContext);
    registerBackupScheduleHandlers(ipcContext);
    registerUpdateHandlers(ipcContext);
  }

  private async initializeCanvasClientFromCredentials(): Promise<void> {
    // Read persisted Canvas base URL
    const connectionConfigPath = path.join(CONFIG_DIR, 'canvas-connection.json');
    let savedBaseUrl = '';
    try {
      if (fs.existsSync(connectionConfigPath)) {
        const config = JSON.parse(fs.readFileSync(connectionConfigPath, 'utf-8'));
        savedBaseUrl = config.baseUrl || '';
      }
    } catch (error) {
      this.logger.warn(`Failed to read canvas-connection.json: ${error}`);
    }

    if (savedBaseUrl) {
      this.credentialManager.setBaseUrl(savedBaseUrl);
    }

    // Try to initialize Canvas client if credentials exist
    const hasCredentials = await this.credentialManager.exists();
    if (hasCredentials) {
      // Re-read base URL to ensure it's set before retrieve()
      let baseUrl = savedBaseUrl;
      if (!baseUrl) {
        try {
          if (fs.existsSync(connectionConfigPath)) {
            const config = JSON.parse(fs.readFileSync(connectionConfigPath, 'utf-8'));
            baseUrl = config.baseUrl || '';
          }
        } catch (error) {
          this.logger.warn(`Failed to read canvas-connection.json: ${error}`);
        }
      }

      if (baseUrl) {
        this.credentialManager.setBaseUrl(baseUrl);
      }

      const token = await this.credentialManager.retrieve();
      if (token) {
        if (savedBaseUrl) {
          await this.initializeCanvasClient(token, savedBaseUrl);
          this.autoSyncManager?.start();
        } else {
          this.logger.warn(
            'No saved Canvas base URL found — user must reconnect via onboarding'
          );
        }
      }
    }
  }

  private wireFileWatcherEvents(): void {
    // Handle file deletions - update database and notify renderer
    this.fileWatcher.on(
      'file-deleted',
      (event: { path: string; relativePath: string }) => {
        this.logger.info(`[FileWatcher] File deleted: ${event.path}`);

        const resource = this.database.executeReadOne<{
          id: number;
          external_id: string;
        }>('SELECT id, external_id FROM resources WHERE local_path = ?', [event.path]);

        if (resource) {
          this.logger.info(
            `[FileWatcher] Clearing local_path for resource ${resource.id} (${resource.external_id})`
          );
          this.database.executeWrite(
            'UPDATE resources SET local_path = NULL WHERE id = ?',
            [resource.id],
            'resources'
          );

          const mainWindow = this.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('file-status-changed', {
              type: 'deleted',
              resourceId: resource.id,
              externalId: resource.external_id,
              path: event.path,
            });
          }

          if (this.htmlLocalPathManager) {
            this.htmlLocalPathManager.handleFileDeleted(event.path).catch((err) => {
              this.logger.error(`[FileWatcher] HTML regeneration failed: ${err}`);
            });
          }
        }
      }
    );

    // Handle file additions
    this.fileWatcher.on('file-added', (event: { path: string; relativePath: string }) => {
      this.logger.debug(`[FileWatcher] File added: ${event.path}`);

      const resource = this.database.executeReadOne<{ id: number }>(
        'SELECT id FROM resources WHERE local_path = ?',
        [event.path]
      );

      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'added',
          path: event.path,
        });
      }

      if (this.htmlLocalPathManager) {
        this.htmlLocalPathManager
          .handleFileAdded(event.path, resource?.id)
          .catch((err) => {
            this.logger.error(`[FileWatcher] HTML regeneration failed: ${err}`);
          });
      }
    });
  }
}
