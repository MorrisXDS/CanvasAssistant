import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import fs from 'fs';
import path from 'path';

// L0 - Utilities
import { Logger } from './layers/l0-utilities/Logger';
import { SystemMonitor } from './layers/l0-utilities/SystemMonitor';
import { CredentialManager } from './layers/l0-utilities/CredentialManager';
import { HealthCheck } from './layers/l0-utilities/HealthCheck';
import { MetricsCollector } from './layers/l0-utilities/MetricsCollector';
import { HousekeepingManager } from './layers/l0-utilities/HousekeepingManager';
import { FileDownloadManager } from './layers/l0-utilities/FileDownloadManager';
import { FileWatcher } from './layers/l0-utilities/FileWatcher';

// L1 - Persistence
import {
  Database,
  MigrationRunner,
  coreMigrations,
  VisibleDataProvider,
  runPostImportRepairs,
} from './layers/l1-persistence';
import type { PendingDownloadRow } from './layers/l1-persistence';

// L2 - Daemon
import {
  RateLimiter,
  CircuitBreaker,
  htmlToPlainText,
  OperationCoordinator,
} from './layers/l2-daemon';
import { HtmlLocalPathManager } from './layers/l2-daemon/HtmlLocalPathManager';

// L4 - Controller
import { CommandDispatcher } from './layers/l4-controller';

// Crash Protection
import { CrashProtectionManager } from './CrashProtectionManager';

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
} from './ipc-handlers';
import type { IpcContext } from './ipc-handlers';

// Application root - use userData in packaged mode, cwd in dev mode
// process.cwd() is unreliable in packaged apps (often C:\Windows\System32)
// path.dirname(exe) fails when installed to Program Files (no write access)
// app.getPath('userData') is always writable and the Electron convention
const APP_ROOT = app.isPackaged ? app.getPath('userData') : process.cwd();

// Install directory - where the .exe lives (user-chosen, visible location)
const INSTALL_DIR = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();

// Application paths
// Internal data (db, logs, config) → APP_ROOT (userData) - always writable
// User-visible files (downloads) → INSTALL_DIR - next to the app, easy to find
const CONFIG_DIR = path.join(APP_ROOT, '.config'); // Hidden - internal config
const LOG_DIR = path.join(APP_ROOT, '.logs'); // Hidden - application logs
const PROJECT_DB_DIR = path.join(APP_ROOT, 'database'); // Internal - database
const BACKUP_DIR = path.join(APP_ROOT, 'backups'); // Internal - backups
const FILES_DIR = path.join(INSTALL_DIR, 'Downloads'); // Visible - next to app

const DB_PATH = path.join(PROJECT_DB_DIR, 'canvas.db');
const METRICS_DB_PATH = path.join(PROJECT_DB_DIR, 'metrics.db');

// Security-critical paths - must remain in secure location (OS keychain fallback)
const APP_DATA_DIR = path.join(app.getPath('userData'), 'CanvasAssistant');
const CREDENTIAL_FILE = path.join(APP_DATA_DIR, '.credentials');

// Ensure hidden and user-visible directories exist on startup
for (const dir of [CONFIG_DIR, LOG_DIR, BACKUP_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Initialize crash protection manager (must be early, before other services)
const crashProtectionManager = new CrashProtectionManager({
  configDir: CONFIG_DIR,
});

// Database corruption state
interface DatabaseCorruptionInfo {
  errors: string[];
  canContinue: boolean;
}
let databaseCorruptionDetected: DatabaseCorruptionInfo | null = null;

// Windows: set app user model ID for proper taskbar grouping and tray icon display
if (process.platform === 'win32') {
  app.setAppUserModelId('com.canvasassistant.app');
}

// ============================================================================
// SINGLE INSTANCE LOCK - Must be checked before any service initialization
// ============================================================================
// Multiple instances cause: SQLite BUSY errors, WAL corruption, credential conflicts,
// duplicate API calls, and settings file corruption
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Another instance is already running - exit immediately and synchronously
  // Using app.exit() instead of app.quit() to prevent any async initialization
  // eslint-disable-next-line cross-platform/no-console-in-main -- Logger not yet initialized
  console.warn('[CID] Another instance is already running. Exiting.');
  app.exit(0);
}

// Initialize Layer 0 utilities
const logger = new Logger({ logDir: LOG_DIR, enableConsole: true });
const systemMonitor = new SystemMonitor({ pollIntervalMs: 30000 });
const credentialManager = new CredentialManager({
  serviceName: 'CanvasAssistant',
  accountName: 'canvas-api-token',
  enableFileFallback: true,
  fallbackFilePath: CREDENTIAL_FILE,
  logger,
});
const metricsCollector = new MetricsCollector({
  enabled: true,
  dbPath: METRICS_DB_PATH,
  aggregationIntervalMs: 60000, // 1 minute
  retentionDays: 90,
  logger,
});
const healthCheck = new HealthCheck({
  enabled: true,
  intervalMs: 60000, // 1 minute
  runOnStartup: true,
  logger,
});
const housekeepingManager = new HousekeepingManager(
  {
    enabled: true,
    logDir: LOG_DIR,
    dataDir: CONFIG_DIR,
    metricsCollector,
    schedule: {
      runOnStartup: false,
    },
    retention: {
      logsDays: 30,
      metricsDays: 90,
    },
  },
  logger
);
const fileDownloadManager = new FileDownloadManager({
  baseDir: FILES_DIR,
  maxConcurrent: 10,
  logger,
});

// FileWatcher - monitors downloads directory for external changes
const fileWatcher = new FileWatcher({
  baseDir: FILES_DIR,
  logger,
  autoStart: false, // Start after app is ready
  debounceMs: 500,
});

// Ensure database directory exists
if (!fs.existsSync(PROJECT_DB_DIR)) {
  fs.mkdirSync(PROJECT_DB_DIR, { recursive: true });
}

// Create component loggers for each layer
const databaseLogger = logger.child('database');
const commandDispatcherLogger = logger.child('commandDispatcher');

// Initialize Layer 1 persistence
const database = new Database({
  dbPath: DB_PATH,
  verbose: false,
  logger: databaseLogger,
});
const migrationRunner = new MigrationRunner(database);
let visibleDataProvider: VisibleDataProvider | null = null;

// HtmlLocalPathManager - manages HTML download with local path dependencies
// Initialized lazily after database is ready
let htmlLocalPathManager: HtmlLocalPathManager | null = null;

// OperationCoordinator - coordinates sync/download operations to prevent conflicts
// Initialized after database is ready
let operationCoordinator: OperationCoordinator | null = null;

// Initialize Layer 4 controller (after database is ready)
// Note: CommandDispatcher is initialized lazily after database.initialize()
let commandDispatcher: CommandDispatcher | null = null;

// Initialize Layer 2 daemon components (lazy-init for CanvasClient/SyncEngine)
// Canvas allows ~700 requests/min (~11.7 req/sec)
// Use 6 concurrent with 50ms min delay for ~12 req/sec throughput
const rateLimiter = new RateLimiter({ maxConcurrent: 6, minDelayMs: 50 });
const circuitBreaker = new CircuitBreaker({
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  useExponentialBackoff: true,
  logger,
});

let isQuitting = false;

// Managers (initialized in app.whenReady)
let windowManager: WindowManager | null = null;
let canvasClientManager: CanvasClientManager | null = null;
let autoSyncManager: AutoSyncManager | null = null;
let backupManager: BackupManager | null = null;

// Getter for mainWindow (for backwards compatibility with existing code)
const getMainWindow = (): BrowserWindow | null => windowManager?.getMainWindow() ?? null;

// Getters for Canvas client and sync engine (managed by CanvasClientManager)
const getCanvasClient = () => canvasClientManager?.getCanvasClient() ?? null;
const getSyncEngine = () => canvasClientManager?.getSyncEngine() ?? null;

// Set crash protection dependencies (now that all services are initialized)
crashProtectionManager.setDependencies({
  logger,
  database,
  getMainWindow,
});

// Register global error handlers for crash protection
crashProtectionManager.registerErrorHandlers();

// Window behavior settings type (must match renderer settings schema)
interface WindowBehaviorSettings {
  closeAction: 'quit' | 'minimize-to-tray' | null;
  showTrayIcon: boolean;
}

// Default window behavior settings
const DEFAULT_WINDOW_BEHAVIOR: WindowBehaviorSettings = {
  closeAction: null, // null = not yet chosen, will prompt on first close
  showTrayIcon: true,
};

// Get window behavior settings from config directory
function getWindowBehavior(): WindowBehaviorSettings {
  const settingsPath = path.join(CONFIG_DIR, 'window-behavior.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...DEFAULT_WINDOW_BEHAVIOR, ...JSON.parse(data) };
    }
  } catch {
    // Return defaults if file doesn't exist or is corrupted
  }
  return { ...DEFAULT_WINDOW_BEHAVIOR };
}

// Save window behavior settings
function setWindowBehavior(settings: WindowBehaviorSettings): void {
  const settingsPath = path.join(CONFIG_DIR, 'window-behavior.json');
  try {
    // Ensure directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    logger.error('Failed to save window behavior settings:', error as Error);
  }
}

/**
 * Get sync preferences from database
 * Returns default values if preferences are not set
 */
function getSyncPreferences(): {
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  syncFiles: boolean;
  syncAnnouncements: boolean;
  autoAssignDueDate: boolean;
  saveHtmlContent: boolean;
  htmlUrlRewriting: 'local' | 'original';
  downloadImages: boolean;
  downloadLinkedFiles: boolean;
} {
  const defaults = {
    autoSyncEnabled: true,
    autoSyncInterval: 30,
    syncFiles: true,
    syncAnnouncements: true,
    autoAssignDueDate: false,
    saveHtmlContent: true,
    htmlUrlRewriting: 'original' as const,
    downloadImages: true,
    downloadLinkedFiles: false,
  };

  try {
    const prefs = database.executeReadOne<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'syncPreferences'"
    );
    if (prefs?.value) {
      const parsed = JSON.parse(prefs.value);
      return { ...defaults, ...parsed };
    }
  } catch {
    // Fall through to defaults
  }
  return defaults;
}

/**
 * Get local HTML paths settings from database
 * Returns default values if settings are not set
 */
function getLocalHtmlPathsSettings(): {
  enabled: boolean;
  autoRegenerate: boolean;
  promptForMissing: boolean;
} {
  const defaults = {
    enabled: false, // Disabled by default - user can enable in Settings
    autoRegenerate: true,
    promptForMissing: true,
  };

  try {
    const settings = database.executeReadOne<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'localHtmlPathsSettings'"
    );
    if (settings?.value) {
      const parsed = JSON.parse(settings.value);
      return { ...defaults, ...parsed };
    }
  } catch {
    // Fall through to defaults
  }
  return defaults;
}

/**
 * Initialize the Canvas client and sync engine when credentials are available
 */
async function initializeCanvasClient(token: string, baseUrl: string): Promise<boolean> {
  if (!canvasClientManager) {
    logger.error('CanvasClientManager not initialized');
    return false;
  }
  return canvasClientManager.initialize(token, baseUrl);
}

/**
 * Register health check probes for all components
 */
function registerHealthProbes(): void {
  // Database probe
  healthCheck.registerProbe({
    name: 'database',
    check: () => {
      try {
        database.getSchemaVersion();
        return 'healthy';
      } catch {
        return 'unhealthy';
      }
    },
    recommendedAction: 'Check database file permissions and disk space',
  });

  // Canvas API probe
  healthCheck.registerProbe({
    name: 'canvas-api',
    check: () => {
      const status = circuitBreaker.getStatus();
      if (status.state === 'open') return 'unhealthy';
      if (status.state === 'half-open') return 'degraded';
      return 'healthy';
    },
    recommendedAction: 'Check Canvas API credentials and connectivity',
  });

  // Memory probe
  healthCheck.registerProbe({
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

/**
 * Reset all application state - clears database, files, credentials, and in-memory clients.
 * This is the single source of truth for full app reset.
 */
async function resetAppState(options: { deleteToken: boolean }): Promise<void> {
  const { deleteToken } = options;

  // 1. Clear all database tables in dependency order (children first, parents last)
  database.transaction(() => {
    // Intelligence/analytics tables (reference tasks/courses)
    database.executeWrite(
      'DELETE FROM message_display_history',
      [],
      'message_display_history'
    );
    database.executeWrite(
      'DELETE FROM field_notification_suppressions',
      [],
      'field_notification_suppressions'
    );
    database.executeWrite(
      'DELETE FROM adaptive_weight_adjustments',
      [],
      'adaptive_weight_adjustments'
    );
    database.executeWrite('DELETE FROM user_insights', [], 'user_insights');
    database.executeWrite('DELETE FROM recommendations', [], 'recommendations');
    database.executeWrite('DELETE FROM workload_snapshots', [], 'workload_snapshots');
    database.executeWrite('DELETE FROM effort_estimations', [], 'effort_estimations');
    database.executeWrite(
      'DELETE FROM user_behavior_patterns',
      [],
      'user_behavior_patterns'
    );
    database.executeWrite(
      'DELETE FROM task_completion_events',
      [],
      'task_completion_events'
    );

    // Content/file reference tables (reference resources/courses)
    database.executeWrite('DELETE FROM html_exports', [], 'html_exports');
    database.executeWrite(
      'DELETE FROM content_file_references',
      [],
      'content_file_references'
    );

    // Policy-related child tables
    database.executeWrite('DELETE FROM grade_replacements', [], 'grade_replacements');
    database.executeWrite('DELETE FROM weight_transfers', [], 'weight_transfers');
    database.executeWrite('DELETE FROM grace_token_usage', [], 'grace_token_usage');
    database.executeWrite('DELETE FROM policy_rules', [], 'policy_rules');
    database.executeWrite('DELETE FROM grace_tokens', [], 'grace_tokens');
    database.executeWrite('DELETE FROM course_task_groups', [], 'course_task_groups');
    database.executeWrite('DELETE FROM global_task_types', [], 'global_task_types');

    // Module-related tables
    database.executeWrite('DELETE FROM module_items', [], 'module_items');
    database.executeWrite('DELETE FROM modules', [], 'modules');

    // Notification-related tables
    database.executeWrite('DELETE FROM policy_announcements', [], 'policy_announcements');
    database.executeWrite(
      'DELETE FROM announcement_file_references',
      [],
      'announcement_file_references'
    );
    database.executeWrite(
      'DELETE FROM notification_attachments',
      [],
      'notification_attachments'
    );
    database.executeWrite('DELETE FROM notifications', [], 'notifications');

    // Course-related tables
    database.executeWrite('DELETE FROM grade_history', [], 'grade_history');
    database.executeWrite('DELETE FROM course_pages', [], 'course_pages');
    database.executeWrite('DELETE FROM course_policies', [], 'course_policies');
    database.executeWrite('DELETE FROM resources', [], 'resources');
    database.executeWrite('DELETE FROM calendar_events', [], 'calendar_events');
    database.executeWrite('DELETE FROM imported_calendars', [], 'imported_calendars');
    database.executeWrite('DELETE FROM tasks', [], 'tasks');
    database.executeWrite('DELETE FROM courses', [], 'courses');

    // Top-level tables
    database.executeWrite('DELETE FROM enrollment_terms', [], 'enrollment_terms');
    database.executeWrite('DELETE FROM user_preferences', [], 'user_preferences');
    database.executeWrite('DELETE FROM sync_metadata', [], 'sync_metadata');
    database.executeWrite('DELETE FROM endpoint_backoff', [], 'endpoint_backoff');
    database.executeWrite('DELETE FROM sync_preferences', [], 'sync_preferences');
    // pending_sync_conflicts is created at runtime by SyncConflictResolver, not via migrations
    const hasConflictsTable = database.executeRead<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_sync_conflicts'"
    );
    if (hasConflictsTable.length > 0) {
      database.executeWrite(
        'DELETE FROM pending_sync_conflicts',
        [],
        'pending_sync_conflicts'
      );
    }
    database.executeWrite('DELETE FROM field_modifications', [], 'field_modifications');
  });

  // 2. Clear in-memory pending conflicts (database already cleared in transaction)
  const syncEngine = getSyncEngine();
  if (syncEngine) {
    syncEngine.getConflictResolver().clearAllPendingConflicts();
    logger.info('Pending sync conflicts cleared from memory');
  }

  // 3. Delete all downloaded files
  // Stop FileWatcher first to release directory handles
  fileWatcher.stop();

  if (fs.existsSync(FILES_DIR)) {
    try {
      fs.rmSync(FILES_DIR, { recursive: true, force: true });
      fs.mkdirSync(FILES_DIR, { recursive: true }); // Recreate empty directory
      logger.info('Downloaded files deleted');
    } catch (err) {
      logger.error(`Failed to delete files directory: ${err}`);
    }
  }

  // Restart FileWatcher to monitor the recreated directory
  fileWatcher.start();

  // 3b. Reset window behavior settings (clear minimize-to-tray preference)
  const windowBehaviorPath = path.join(CONFIG_DIR, 'window-behavior.json');
  if (fs.existsSync(windowBehaviorPath)) {
    try {
      fs.unlinkSync(windowBehaviorPath);
      logger.info('Window behavior settings reset');
    } catch (err) {
      logger.error(`Failed to delete window behavior settings: ${err}`);
    }
  }

  // 3c. Reset window state (clear saved window size/position)
  const windowStatePath = path.join(CONFIG_DIR, 'window-state.json');
  if (fs.existsSync(windowStatePath)) {
    try {
      fs.unlinkSync(windowStatePath);
      logger.info('Window state reset');
    } catch (err) {
      logger.error(`Failed to delete window state: ${err}`);
    }
  }

  // 4. Delete credential and reset in-memory clients if requested
  if (deleteToken) {
    // Stop any ongoing sync operations first
    const syncEngineForStop = getSyncEngine();
    if (syncEngineForStop) {
      await syncEngineForStop.cancelPendingSync();
      syncEngineForStop.stop();
      logger.info('Sync engine stopped');
    }

    // Stop background token validation
    credentialManager.stopBackgroundValidation();

    await credentialManager.delete();
    canvasClientManager?.clear();

    // Lock database to prevent any stray writes from in-flight operations
    database.lockWrites();
    logger.info('Canvas API token deleted, clients reset, and database locked');
  }

  // 5. Notify renderer to handle its side (clear localStorage, redirect to login)
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:reset', {
      tokenDeleted: deleteToken,
      clearLocalStorage: deleteToken, // Clear all localStorage when token deleted
    });
  }

  logger.info(`App state reset complete (tokenDeleted: ${deleteToken})`);
  metricsCollector.increment('data.cleared');
}

/**
 * Register IPC handlers for renderer communication
 * Note: All handlers have been extracted to src/ipc-handlers/ modules
 */
function registerIpcHandlers(): void {
  // All IPC handlers are now registered via modular handler files in ipc-handlers/
  // This function is kept for backwards compatibility with the app lifecycle
}

// ============ Download Queue Persistence ============

// PendingDownloadRow imported from DatabaseRowTypes.ts

/**
 * Save pending downloads to database for crash recovery
 */
function savePendingDownloads(): void {
  // Skip if database is closed (e.g., during import restart)
  if (!database.isOpen) {
    return;
  }

  try {
    const pending = fileDownloadManager.getPendingDownloads();
    const active = fileDownloadManager.getActiveDownloadRequests();

    if (pending.length === 0 && active.length === 0) {
      // Clear any stale pending downloads
      database.executeWrite('DELETE FROM pending_downloads', [], 'pending_downloads');
      return;
    }

    logger.info(`Saving ${pending.length} pending + ${active.length} active downloads`);

    // Clear existing pending downloads
    database.executeWrite('DELETE FROM pending_downloads', [], 'pending_downloads');

    // Save pending downloads
    for (const request of pending) {
      database.executeWrite(
        `INSERT INTO pending_downloads (resource_id, course_code, url, filename, context_folder, folder_path, expected_size, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          request.id,
          request.courseCode,
          request.url,
          request.filename,
          request.contextFolder || null,
          request.folderPath || null,
          request.expectedSize || null,
        ],
        'pending_downloads'
      );
    }

    logger.info('Pending downloads saved successfully');
  } catch (error) {
    logger.error('Failed to save pending downloads:', error as Error);
  }
}

/**
 * Restore pending downloads from database on startup
 */
function restorePendingDownloads(): void {
  try {
    const rows = database.executeRead<PendingDownloadRow>(
      "SELECT * FROM pending_downloads WHERE status IN ('pending', 'in_progress') ORDER BY priority DESC"
    );

    if (rows.length === 0) {
      return;
    }

    logger.info(`Found ${rows.length} pending downloads to restore`);

    const requests = rows.map((row) => ({
      id: row.resource_id,
      url: row.url,
      courseCode: row.course_code,
      filename: row.filename,
      contextFolder: row.context_folder || undefined,
      folderPath: row.folder_path || undefined,
      expectedSize: row.expected_size || undefined,
    }));

    // Clear the persisted queue since we're restoring it
    database.executeWrite('DELETE FROM pending_downloads', [], 'pending_downloads');

    // Restore to download manager
    fileDownloadManager.restoreDownloads(requests);

    logger.info(`Restored ${requests.length} pending downloads`);
  } catch (error) {
    logger.error('Failed to restore pending downloads:', error as Error);
  }
}

// Start system monitoring
systemMonitor.start();

// Log system state changes
systemMonitor.on('state-change', (state) => {
  logger.info(`System state changed: ${systemMonitor.getStateDescription()}`);
  metricsCollector.increment('system.state_change');

  if (!state.canSync) {
    logger.warn('Sync disabled due to system state (battery + unfocused)');
  }
});

// Circuit breaker events
circuitBreaker.on('circuit-opened', ({ endpoint }) => {
  logger.warn(`Circuit breaker opened for ${endpoint}`);
  metricsCollector.increment('circuit_breaker.opened');
});

circuitBreaker.on('circuit-closed', ({ endpoint }) => {
  logger.info(`Circuit breaker closed for ${endpoint}`);
  metricsCollector.increment('circuit_breaker.closed');
});

// Register custom protocol for canvas files - allows fallback from local to network
// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'canvas-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Handle when user tries to launch another instance (focus existing window)
app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  windowManager?.handleSecondInstance();
});

app.whenReady().then(async () => {
  logger.info('Canvas Integration Dashboard starting...');
  logger.info(`Platform: ${process.platform}, Electron: ${process.versions.electron}`);
  logger.info(`Data directory: ${APP_DATA_DIR}`);

  // Check for previous crash and crash loop
  const crashCheck = crashProtectionManager.checkCrashFlag();
  if (crashCheck.crashed && crashCheck.data) {
    logger.warn(
      `Previous session crashed at ${crashCheck.data.timestamp}: ${crashCheck.data.reason}`
    );
    metricsCollector.increment('app.crash_recovery');

    // Store last crash info for recovery UI
    crashProtectionManager.setLastCrashInfo({
      timestamp: crashCheck.data.timestamp,
      reason: crashCheck.data.reason,
    });

    // Clear the crash flag since we've detected it
    crashProtectionManager.clearCrashFlag();
  }

  // Check for crash loop (3+ crashes in 10 minutes)
  const crashLoopCheck = crashProtectionManager.checkCrashLoop();
  if (crashLoopCheck.inLoop) {
    crashProtectionManager.setSafeModeEnabled(true);
    logger.warn(
      `Crash loop detected: ${crashLoopCheck.crashCount} crashes in last 10 minutes. Entering safe mode (auto-sync disabled).`
    );
    metricsCollector.increment('app.safe_mode_entered');
  } else {
    // Start timer to clear safe mode after stable runtime
    const history = crashProtectionManager.loadCrashHistory();
    if (history.safeMode) {
      crashProtectionManager.setSafeModeEnabled(true);
      logger.info('Resuming in safe mode from previous session');
      crashProtectionManager.startSafeModeClearTimer();
    }
  }

  // Write crash flag - will be cleared on clean exit
  crashProtectionManager.writeCrashFlag('session_start');

  // If previous session crashed, perform WAL recovery before initializing
  if (crashCheck.crashed) {
    logger.info('Previous session crashed - performing WAL recovery...');
    const walRecovery = database.recoverWal();
    if (walRecovery.success) {
      if (walRecovery.walSizeBeforeBytes) {
        logger.info(
          `WAL recovery successful, recovered ${walRecovery.walSizeBeforeBytes} bytes`
        );
      } else {
        logger.info('WAL recovery complete (no pending changes)');
      }
    } else {
      logger.warn(`WAL recovery warning: ${walRecovery.error}`);
    }
  }

  // Initialize database and run migrations
  try {
    database.initialize();
    migrationRunner.loadMigrations(coreMigrations);
    const migrationResult = migrationRunner.runAll();
    const currentVersion = database.getSchemaVersion();
    logger.info(
      `Database initialized at version ${currentVersion}, ${migrationResult.applied} migrations applied`
    );
    if (migrationResult.errors.length > 0) {
      logger.error(`Migration errors: ${migrationResult.errors.join(', ')}`);
    }

    // Verify critical schema elements exist
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
        const result = database.executeRead<{ '1': number }>(check.sql);
        if (result.length === 0) {
          missingSchema.push(check.name);
        }
      } catch {
        missingSchema.push(check.name);
      }
    }

    // Attempt self-healing repair if schema elements are missing
    if (missingSchema.length > 0) {
      logger.warn(
        `Missing schema elements: ${missingSchema.join(', ')}. DB version: ${currentVersion}. Attempting repair...`
      );

      const repairFailed: string[] = [];
      for (const check of schemaChecks) {
        if (!missingSchema.includes(check.name)) continue;
        try {
          database.exec(check.repair);
          logger.info(`Repaired: ${check.name}`);
        } catch (repairErr) {
          const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
          // Ignore "duplicate column" — means the column exists despite check failing
          if (!msg.includes('duplicate column name')) {
            logger.error(`Failed to repair ${check.name}: ${msg}`);
            repairFailed.push(check.name);
          } else {
            logger.info(`Repair skipped (already exists): ${check.name}`);
          }
        }
      }

      if (repairFailed.length > 0) {
        logger.error(
          `Schema repair failed for: ${repairFailed.join(', ')}. Database may need reset.`
        );

        // Show dialog after app is ready
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
        logger.info('Schema repair completed successfully');
      }
    }

    metricsCollector.increment('database.initialized');

    // If previous session crashed, check database integrity
    if (crashCheck.crashed) {
      logger.info('Running database integrity check after crash...');
      const integrityCheck = database.checkIntegrity();
      if (!integrityCheck.ok) {
        logger.error(
          `Database integrity check failed: ${integrityCheck.errors.join(', ')}`
        );
        metricsCollector.increment('database.corruption_detected');
        // Store corruption info for UI notification
        // The window will be notified once it's created
        databaseCorruptionDetected = {
          errors: integrityCheck.errors,
          canContinue: integrityCheck.errors.length < 5, // Can continue if only minor issues
        };
      } else {
        logger.info('Database integrity check passed');
      }
    }

    // Run post-import repairs (safe to run every startup, only repairs if needed)
    const repairResult = runPostImportRepairs(database, logger);
    if (repairResult.calendarRepair.calendarEventsCreated > 0) {
      logger.info(
        `Post-import repair: Created ${repairResult.calendarRepair.calendarEventsCreated} missing calendar events`
      );
    }
    if (repairResult.calendarVerification.issues.length > 0) {
      logger.info(
        `Calendar verification issues: ${repairResult.calendarVerification.issues.join('; ')}`
      );
    }

    // Clean HTML from all notification messages to ensure layer isolation
    // htmlToPlainText is safe on already-plain text
    const allNotifications = database.executeRead<{ id: number; message: string }>(
      'SELECT id, message FROM notifications'
    );
    if (allNotifications.length > 0) {
      let cleaned = 0;
      database.transaction(() => {
        for (const row of allNotifications) {
          const cleanMessage = htmlToPlainText(row.message);
          if (cleanMessage !== row.message) {
            database.executeWrite('UPDATE notifications SET message = ? WHERE id = ?', [
              cleanMessage,
              row.id,
            ]);
            cleaned++;
          }
        }
      });
      if (cleaned > 0) {
        logger.info(`Cleaned HTML from ${cleaned} notification messages`);
      }
    }

    // Register canvas-file:// protocol handler for local/network file fallback
    registerCanvasFileProtocol({
      database,
      logger,
      credentialManager,
      filesDir: FILES_DIR,
    });

    // Clean up old embedded- resource entries (no longer needed, protocol handles on-demand)
    const embeddedCleanup = database.executeWrite(
      `DELETE FROM resources WHERE external_id LIKE 'embedded-%'`,
      [],
      'resources'
    );
    if (embeddedCleanup.changes > 0) {
      logger.info(`Cleaned up ${embeddedCleanup.changes} old embedded resource entries`);
      // Notify renderer to refresh Files page
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'cleanup',
          message: `Removed ${embeddedCleanup.changes} duplicate entries`,
        });
      }
    }

    // Auto-complete tasks that have both weight > 0 and grade set
    // This ensures graded assignments are marked as complete
    const autoCompleteResult = database.executeWrite(
      `UPDATE tasks SET
        is_completed = 1,
        completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE weight > 0 AND grade IS NOT NULL AND is_completed = 0`,
      [],
      'tasks'
    );
    if (autoCompleteResult.changes > 0) {
      logger.info(`Auto-completed ${autoCompleteResult.changes} graded tasks`);
    }

    // Initialize L1 VisibleDataProvider for centralized visibility rules
    visibleDataProvider = new VisibleDataProvider(database);

    // Initialize OperationCoordinator to prevent sync/download conflicts
    operationCoordinator = new OperationCoordinator({
      db: database,
      logger: logger.child('OperationCoordinator'),
    });

    // Initialize HtmlLocalPathManager for HTML download with dependencies
    htmlLocalPathManager = new HtmlLocalPathManager(database, {
      filesBaseDir: FILES_DIR,
      logger,
      autoRegenerate: true,
    });

    // Initialize CanvasClientManager for Canvas API and sync engine management
    canvasClientManager = new CanvasClientManager({
      database,
      logger,
      metricsCollector,
      credentialManager,
      rateLimiter,
      circuitBreaker,
      fileDownloadManager,
      filesDir: FILES_DIR,
      getMainWindow,
      getVisibleDataProvider: () => visibleDataProvider,
      getOperationCoordinator: () => operationCoordinator,
      getSyncPreferences,
    });

    // Initialize L4 CommandDispatcher with VisibleDataProvider
    commandDispatcher = new CommandDispatcher({
      db: database,
      visibleDataProvider: visibleDataProvider ?? undefined,
      logger: commandDispatcherLogger,
    });

    // Forward sync requests from CommandDispatcher to SyncEngine
    commandDispatcher.on('sync-requested', async (event) => {
      const syncEngine = getSyncEngine();
      if (syncEngine && systemMonitor.getState().canSync) {
        logger.info(`Sync requested: ${event.type}`);
        try {
          if (event.type === 'full') {
            await syncEngine.syncAll();
          } else if (event.type === 'courses') {
            await syncEngine.syncCourses();
          }
        } catch (error) {
          logger.error(`Sync failed: ${error}`);
        }
      }
    });

    // Track command metrics
    commandDispatcher.on('command-completed', ({ command }) => {
      metricsCollector.increment(`command.${command}.executed`);
    });

    // Forward simulation state changes to renderer
    commandDispatcher.on('simulation-changed', (event) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('simulation:changed', event);
        logger.debug(`Simulation changed: ${event.type}`);
      }
    });

    // Forward database commit events to renderer (for store updates)
    database.on('commit', (event: { table: string }) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('db:commit', event);
      }
    });

    logger.info('Command dispatcher initialized');
  } catch (error) {
    logger.error(`Failed to initialize database: ${error}`);
    metricsCollector.increment('database.init_error');
  }

  // Register health probes
  registerHealthProbes();

  // Initialize managers
  windowManager = new WindowManager({
    logger,
    metricsCollector,
    systemMonitor,
    crashProtectionManager,
    preloadPath: path.join(__dirname, 'preload.js'),
    configDir: CONFIG_DIR,
    getAutoSyncManager: () => autoSyncManager,
    getWindowBehavior,
    getDatabaseCorruptionDetected: () => databaseCorruptionDetected,
    isQuitting: () => isQuitting,
    setIsQuitting: (value: boolean) => {
      isQuitting = value;
    },
  });

  autoSyncManager = new AutoSyncManager({
    database,
    logger,
    metricsCollector,
    systemMonitor,
    crashProtectionManager,
    getSyncEngine,
    getMainWindow,
  });

  backupManager = new BackupManager({
    database,
    dbPath: DB_PATH,
    backupDir: BACKUP_DIR,
    logger,
    metricsCollector,
    getMainWindow,
  });

  // Register IPC handlers
  registerIpcHandlers();

  // Create IPC context for modular handlers
  const ipcContext: IpcContext = {
    getMainWindow,
    getDatabase: () => database,
    getLogger: () => logger,
    getMetricsCollector: () => metricsCollector,
    getCredentialManager: () => credentialManager,
    getFileDownloadManager: () => fileDownloadManager,
    getHealthCheck: () => healthCheck,
    getSystemMonitor: () => systemMonitor,
    getVisibleDataProvider: () => visibleDataProvider,
    getCanvasClient,
    getSyncEngine,
    getOperationCoordinator: () => operationCoordinator,
    clearCanvasClient: () => {
      canvasClientManager?.clear();
    },
    initializeCanvasClient,
    getCommandDispatcher: () => commandDispatcher,
    getWindowBehavior,
    setWindowBehavior,
    getLocalHtmlPathsSettings,
    getIsQuitting: () => isQuitting,
    setIsQuitting: (value: boolean) => {
      isQuitting = value;
    },
    getConfigDir: () => CONFIG_DIR,
    getFilesDir: () => FILES_DIR,
    getDbPath: () => DB_PATH,
    getBackupDir: () => BACKUP_DIR,
    getAppVersion: () => app.getVersion(),
    getSyncPreferences,
    startAutoSync: () => autoSyncManager?.start(),
    stopAutoSync: () => autoSyncManager?.stop(),
    getCrashProtectionManager: () => crashProtectionManager,
    getAppDataDir: () => APP_DATA_DIR,
    getDatabaseCorruptionDetected: () => databaseCorruptionDetected,
    setDatabaseCorruptionDetected: (
      value: { errors: string[]; canContinue: boolean } | null
    ) => {
      databaseCorruptionDetected = value;
    },
    resetWindowSize: () => windowManager?.resetWindowSize(),
    createTray: () => windowManager?.createTray(),
    destroyTray: () => windowManager?.destroyTray(),
    resetAppState,
  };

  // Register modular IPC handlers
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

  // Start background services
  healthCheck.start();
  metricsCollector.start();
  housekeepingManager.start();

  // Read persisted Canvas base URL and set on credential manager before token retrieval
  // (retrieve() validates the token, which requires the base URL)
  const connectionConfigPath = path.join(CONFIG_DIR, 'canvas-connection.json');
  let savedBaseUrl = '';
  try {
    if (fs.existsSync(connectionConfigPath)) {
      const config = JSON.parse(fs.readFileSync(connectionConfigPath, 'utf-8'));
      savedBaseUrl = config.baseUrl || '';
    }
  } catch (error) {
    logger.warn(`Failed to read canvas-connection.json: ${error}`);
  }

  if (savedBaseUrl) {
    credentialManager.setBaseUrl(savedBaseUrl);
  }

  // Try to initialize Canvas client if credentials exist
  const hasCredentials = await credentialManager.exists();
  if (hasCredentials) {
    // Read persisted Canvas base URL BEFORE retrieve() so token validation has a valid URL
    const connectionConfigPath = path.join(CONFIG_DIR, 'canvas-connection.json');
    let baseUrl = '';
    try {
      if (fs.existsSync(connectionConfigPath)) {
        const config = JSON.parse(fs.readFileSync(connectionConfigPath, 'utf-8'));
        baseUrl = config.baseUrl || '';
      }
    } catch (error) {
      logger.warn(`Failed to read canvas-connection.json: ${error}`);
    }

    if (baseUrl) {
      credentialManager.setBaseUrl(baseUrl);
    }

    const token = await credentialManager.retrieve();
    if (token) {
      if (savedBaseUrl) {
        await initializeCanvasClient(token, savedBaseUrl);

        // Start auto-sync scheduler after Canvas client is ready
        autoSyncManager?.start();
      } else {
        logger.warn(
          'No saved Canvas base URL found — user must reconnect via onboarding'
        );
      }
    }
  }

  // Start backup scheduler (runs independently of sync)
  backupManager?.start();

  // Restore any pending downloads from previous session (if database available)
  try {
    restorePendingDownloads();
  } catch (error) {
    logger.error('Failed to restore pending downloads', error as Error);
  }

  windowManager?.createWindow();

  // Create system tray icon if enabled in settings (default: true)
  if (getWindowBehavior().showTrayIcon) {
    windowManager?.createTray();
  }

  // Start FileWatcher to monitor downloads directory for external changes
  fileWatcher.start();

  // Handle file deletions - update database and notify renderer
  fileWatcher.on('file-deleted', (event: { path: string; relativePath: string }) => {
    logger.info(`[FileWatcher] File deleted: ${event.path}`);

    // Find and update any resource with this local_path
    const resource = database.executeReadOne<{ id: number; external_id: string }>(
      'SELECT id, external_id FROM resources WHERE local_path = ?',
      [event.path]
    );

    if (resource) {
      logger.info(
        `[FileWatcher] Clearing local_path for resource ${resource.id} (${resource.external_id})`
      );
      database.executeWrite(
        'UPDATE resources SET local_path = NULL WHERE id = ?',
        [resource.id],
        'resources'
      );

      // Notify renderer to refresh
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'deleted',
          resourceId: resource.id,
          externalId: resource.external_id,
          path: event.path,
        });
      }

      // Trigger HTML regeneration if feature is enabled
      if (htmlLocalPathManager) {
        htmlLocalPathManager.handleFileDeleted(event.path).catch((err) => {
          logger.error(`[FileWatcher] HTML regeneration failed: ${err}`);
        });
      }
    }
  });

  // Handle file additions - could be from external download or sync
  fileWatcher.on('file-added', (event: { path: string; relativePath: string }) => {
    logger.debug(`[FileWatcher] File added: ${event.path}`);

    // Find resource ID if this file matches a known resource
    const resource = database.executeReadOne<{ id: number }>(
      'SELECT id FROM resources WHERE local_path = ?',
      [event.path]
    );

    // Notify renderer of new file
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-status-changed', {
        type: 'added',
        path: event.path,
      });
    }

    // Trigger HTML regeneration if feature is enabled
    if (htmlLocalPathManager) {
      htmlLocalPathManager.handleFileAdded(event.path, resource?.id).catch((err) => {
        logger.error(`[FileWatcher] HTML regeneration failed: ${err}`);
      });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager?.createWindow();
    }
  });
});

// Track if we've already started graceful shutdown
let gracefulShutdownInProgress = false;
let shutdownAcknowledged = false;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 3000; // 3 seconds

// IPC handler for shutdown acknowledgment (must be registered before use)
ipcMain.on('app:shutdown-acknowledged', () => {
  shutdownAcknowledged = true;
  logger.info('Renderer acknowledged shutdown');
});

// Handle before-quit to coordinate graceful shutdown
app.on('before-quit', async (event) => {
  logger.info('Application preparing to quit...');
  isQuitting = true;

  // Only do graceful shutdown once
  if (gracefulShutdownInProgress) {
    return;
  }
  gracefulShutdownInProgress = true;

  // Notify renderer of impending shutdown (give it time to save state)
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault(); // Prevent immediate quit

    logger.info('Notifying renderer of shutdown...');
    mainWindow.webContents.send('app:shutdown-requested', {
      gracePeriodMs: GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    });

    // Wait for acknowledgment or timeout
    const startTime = Date.now();
    while (
      !shutdownAcknowledged &&
      Date.now() - startTime < GRACEFUL_SHUTDOWN_TIMEOUT_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (shutdownAcknowledged) {
      logger.info('Graceful shutdown: renderer acknowledged');
    } else {
      logger.warn('Graceful shutdown: timed out waiting for renderer');
    }

    // Now actually quit
    app.quit();
  }
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');

  // On macOS, apps typically stay active until explicitly quit
  // For other platforms, check if we should stay in tray
  if (process.platform !== 'darwin') {
    // Force quit (Alt+F4) or explicit quit always exits
    if (isQuitting) {
      app.quit();
      return;
    }

    const settings = getWindowBehavior();
    // Only stay in tray if explicitly configured
    if (settings.closeAction !== 'minimize-to-tray') {
      app.quit();
    } else {
      logger.info('Staying in tray (minimize-to-tray enabled)');
    }
  }
});

app.on('quit', () => {
  logger.info('Application quitting...');

  // Flush window state before cleanup
  windowManager?.flushWindowState();

  // Clean up tray
  windowManager?.destroyTray();

  // Stop managers
  autoSyncManager?.stop();
  backupManager?.stop();

  // Abort any in-flight sync operations
  const syncEngine = getSyncEngine();
  if (syncEngine) {
    try {
      syncEngine.abort();
      logger.info('Sync engine aborted');
    } catch (error) {
      logger.error('Failed to abort sync engine', error as Error);
    }
  }

  // Clear safe mode timer if running
  crashProtectionManager.stopSafeModeClearTimer();

  // Clear crash flag on clean exit
  crashProtectionManager.clearCrashFlag();

  // Clear simulation state (as per spec: clears on app close)
  if (commandDispatcher) {
    commandDispatcher.clearSimulation();
  }

  // Stop all background services
  fileWatcher.stop();
  systemMonitor.stop();
  healthCheck.stop();
  metricsCollector.stop();
  housekeepingManager.stop();
  circuitBreaker.stop();

  // Save pending downloads for recovery
  savePendingDownloads();
  fileDownloadManager.stop();

  // Close database with timeout protection
  const closeTimeout = setTimeout(() => {
    logger.warn('Database close timed out');
  }, 2000);
  try {
    database.close();
    clearTimeout(closeTimeout);
  } catch (_e) {
    clearTimeout(closeTimeout);
    logger.error('Database close failed:', _e as Error);
  }

  logger.close();
});
