import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

// L0 - Utilities
import { Logger } from './layers/l0-utilities/Logger';
import { SystemMonitor } from './layers/l0-utilities/SystemMonitor';
import { CredentialManager } from './layers/l0-utilities/CredentialManager';
import { HealthCheck } from './layers/l0-utilities/HealthCheck';
import { MetricsCollector } from './layers/l0-utilities/MetricsCollector';
import { HousekeepingManager } from './layers/l0-utilities/HousekeepingManager';
import { FileDownloadManager } from './layers/l0-utilities/FileDownloadManager';

// L1 - Persistence
import { Database, MigrationRunner, coreMigrations } from './layers/l1-persistence';

// L2 - Daemon
import { CanvasClient, SyncEngine, RateLimiter, CircuitBreaker, htmlToPlainText } from './layers/l2-daemon';

// L4 - Controller
import { CommandDispatcher } from './layers/l4-controller';

// Application paths
const APP_DATA_DIR = path.join(app.getPath('userData'), 'CanvasAssistant');
const DB_PATH = path.join(APP_DATA_DIR, 'canvas.db');
const METRICS_DB_PATH = path.join(APP_DATA_DIR, 'metrics.db');
const LOG_DIR = path.join(APP_DATA_DIR, 'logs');
const FILES_DIR = path.join(APP_DATA_DIR, 'files');
const CREDENTIAL_FILE = path.join(APP_DATA_DIR, '.credentials');

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
const housekeepingManager = new HousekeepingManager({
  enabled: true,
  logDir: LOG_DIR,
  dataDir: APP_DATA_DIR,
  metricsCollector,
  schedule: {
    runOnStartup: false,
  },
  retention: {
    logsDays: 30,
    metricsDays: 90,
  },
});
const fileDownloadManager = new FileDownloadManager({
  baseDir: FILES_DIR,
  maxConcurrent: 2,
  logger,
});

// Initialize Layer 1 persistence
const database = new Database({ dbPath: DB_PATH, verbose: false });
const migrationRunner = new MigrationRunner(database);

// Initialize Layer 4 controller (after database is ready)
// Note: CommandDispatcher is initialized lazily after database.initialize()
let commandDispatcher: CommandDispatcher | null = null;

// Initialize Layer 2 daemon components (lazy-init for CanvasClient/SyncEngine)
const rateLimiter = new RateLimiter({ maxConcurrent: 3, minDelayMs: 100 });
const circuitBreaker = new CircuitBreaker({
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  useExponentialBackoff: true,
  logger,
});

// These will be initialized when credentials are available
let canvasClient: CanvasClient | null = null;
let syncEngine: SyncEngine | null = null;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  logger.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#002A5C', // UofT Navy - matches sidebar
      symbolColor: '#ffffff',
      height: 40,
    },
    trafficLightPosition: { x: 16, y: 12 }, // macOS traffic lights position
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Monitor window focus and fullscreen states
  mainWindow.on('focus', () => {
    systemMonitor.setWindowFocused(true);
    logger.debug('Window focused');
  });

  mainWindow.on('blur', () => {
    systemMonitor.setWindowFocused(false);
    logger.debug('Window unfocused');
  });

  mainWindow.on('enter-full-screen', () => {
    systemMonitor.setFullscreen(true);
    logger.debug('Entered fullscreen');
  });

  mainWindow.on('leave-full-screen', () => {
    systemMonitor.setFullscreen(false);
    logger.debug('Left fullscreen');
  });

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    logger.info('Loading development server at http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    logger.info('Loading production build');
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    logger.info('Main window closed');
    mainWindow = null;
  });
}

/**
 * Initialize the Canvas client and sync engine when credentials are available
 */
async function initializeCanvasClient(token: string, baseUrl: string): Promise<boolean> {
  try {
    canvasClient = new CanvasClient({ baseUrl, accessToken: token });

    // Validate the token
    const validation = await circuitBreaker.execute(
      () => canvasClient!.validateToken()
    );

    if (!validation.valid) {
      logger.error(`Canvas token validation failed: ${validation.error}`);
      canvasClient = null;
      return false;
    }

    logger.info(`Canvas client initialized for user: ${validation.user?.name}`);
    metricsCollector.increment('canvas.auth.success');

    // Initialize sync engine
    syncEngine = new SyncEngine({
      client: canvasClient,
      db: database,
      rateLimiter,
    });

    // Forward sync events to metrics
    syncEngine.on('sync-start', ({ type }) => {
      metricsCollector.increment(`sync.${type}.started`);
      logger.info(`Sync started: ${type}`);
    });

    syncEngine.on('sync-complete', ({ type, result }) => {
      metricsCollector.increment(`sync.${type}.completed`);
      metricsCollector.recordTiming(`sync.${type}.duration`, result.duration);
      logger.info(`Sync completed: ${type} in ${result.duration}ms`);
    });

    syncEngine.on('sync-error', ({ type, error }) => {
      metricsCollector.increment(`sync.${type}.errors`);
      logger.error(`Sync error in ${type}: ${error}`);
    });

    return true;
  } catch (error) {
    logger.error(`Failed to initialize Canvas client: ${error}`);
    metricsCollector.increment('canvas.auth.failure');
    canvasClient = null;
    syncEngine = null;
    return false;
  }
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
 * Register IPC handlers for renderer communication
 */
function registerIpcHandlers(): void {
  // Credential management
  ipcMain.handle('credentials:get', async () => {
    const exists = await credentialManager.exists();
    return { hasCredential: exists };
  });

  ipcMain.handle('credentials:store', async (_event, token: string) => {
    const success = await credentialManager.store(token);
    if (success) {
      metricsCollector.increment('credentials.stored');
    }
    return { success };
  });

  ipcMain.handle('credentials:delete', async () => {
    const success = await credentialManager.delete();
    if (success) {
      canvasClient = null;
      syncEngine = null;
      metricsCollector.increment('credentials.deleted');
    }
    return { success };
  });

  // Canvas client initialization
  ipcMain.handle('canvas:connect', async (_event, baseUrl: string) => {
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials stored' };
    }

    const success = await initializeCanvasClient(token, baseUrl);
    return { success, error: success ? undefined : 'Token validation failed' };
  });

  ipcMain.handle('canvas:validateToken', async (_event, token: string, baseUrl: string) => {
    try {
      const client = new CanvasClient({ baseUrl, accessToken: token });
      const result = await client.validateToken();
      return result;
    } catch (error) {
      return { valid: false, error: String(error) };
    }
  });

  // Sync operations
  ipcMain.handle('sync:full', async () => {
    if (!syncEngine) {
      return { success: false, error: 'Canvas client not initialized' };
    }

    if (!systemMonitor.getState().canSync) {
      return { success: false, error: 'Sync disabled due to system state' };
    }

    try {
      const result = await syncEngine.syncAll();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:courses', async () => {
    if (!syncEngine) {
      return { success: false, error: 'Canvas client not initialized' };
    }

    try {
      const result = await syncEngine.syncCourses();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Health and metrics
  ipcMain.handle('health:status', () => {
    return healthCheck.getStatus();
  });

  ipcMain.handle('metrics:summary', () => {
    return metricsCollector.getSummary();
  });

  ipcMain.handle('system:state', () => {
    return systemMonitor.getState();
  });

  // Data fetching handlers for L5 store
  ipcMain.handle('data:getCourses', () => {
    const rows = database.executeRead<{
      id: number;
      external_id: string;
      code: string;
      name: string;
      target_grade: number;
      assessed_grade: number | null;
      current_grade: number | null;
      color: string | null;
      nickname: string | null;
      is_hidden: number;
      last_synced_at: string | null;
    }>('SELECT * FROM courses WHERE is_hidden = 0 ORDER BY name');

    return rows.map((row) => ({
      id: row.id,
      externalId: row.external_id,
      code: row.code,
      name: row.name,
      targetGrade: row.target_grade,
      assessedGrade: row.assessed_grade,
      currentGrade: row.current_grade,
      color: row.color,
      nickname: row.nickname,
      isHidden: Boolean(row.is_hidden),
      lastSyncedAt: row.last_synced_at,
    }));
  });

  ipcMain.handle('data:getTasks', (_event, courseId?: number) => {
    const sql = courseId
      ? 'SELECT * FROM tasks WHERE course_id = ? ORDER BY priority_score DESC'
      : 'SELECT * FROM tasks ORDER BY priority_score DESC';
    const params = courseId ? [courseId] : [];

    const rows = database.executeRead<{
      id: number;
      external_id: string;
      course_id: number;
      title: string;
      description: string | null;
      due_at: string | null;
      weight: number;
      grade: number | null;
      points_possible: number | null;
      priority_score: number;
      is_completed: number;
      completed_at: string | null;
      submission_status: string | null;
    }>(sql, params);

    return rows.map((row) => ({
      id: row.id,
      externalId: row.external_id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      weight: row.weight,
      grade: row.grade,
      pointsPossible: row.points_possible,
      priorityScore: row.priority_score,
      isCompleted: Boolean(row.is_completed),
      completedAt: row.completed_at,
      submissionStatus: row.submission_status,
    }));
  });

  ipcMain.handle('data:getNotifications', () => {
    const rows = database.executeRead<{
      id: number;
      source_type: string;
      source_id: string;
      course_id: number | null;
      title: string;
      message: string;
      published_at: string;
      dismissed_at: string | null;
      url: string | null;
    }>('SELECT * FROM notifications ORDER BY published_at DESC');

    return rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      courseId: row.course_id,
      title: row.title,
      message: row.message,
      publishedAt: row.published_at,
      dismissedAt: row.dismissed_at,
      url: row.url,
    }));
  });

  // Get attachments for a notification
  ipcMain.handle('data:getAttachments', (_event, notificationId: number) => {
    const rows = database.executeRead<{
      id: number;
      notification_id: number;
      external_id: string;
      display_name: string;
      filename: string;
      url: string;
      size_bytes: number | null;
      content_type: string | null;
      local_path: string | null;
      download_status: string;
      downloaded_at: string | null;
    }>(
      'SELECT * FROM notification_attachments WHERE notification_id = ? ORDER BY display_name',
      [notificationId]
    );

    return rows.map((row) => ({
      id: row.id,
      notificationId: row.notification_id,
      externalId: row.external_id,
      displayName: row.display_name,
      filename: row.filename,
      url: row.url,
      sizeBytes: row.size_bytes,
      contentType: row.content_type,
      localPath: row.local_path,
      downloadStatus: row.download_status,
      downloadedAt: row.downloaded_at,
    }));
  });

  // Download an attachment
  ipcMain.handle('attachment:download', async (_event, attachmentId: number) => {
    const attachment = database.executeReadOne<{
      id: number;
      notification_id: number;
      course_id: number;
      external_id: string;
      display_name: string;
      filename: string;
      url: string;
      download_status: string;
    }>(
      'SELECT * FROM notification_attachments WHERE id = ?',
      [attachmentId]
    );

    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    // Get course code for folder organization
    const course = database.executeReadOne<{ code: string }>(
      'SELECT code FROM courses WHERE id = ?',
      [attachment.course_id]
    );

    const courseCode = course?.code || 'unknown';

    // Get auth token for Canvas download
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Update status to downloading
    database.executeWrite(
      'UPDATE notification_attachments SET download_status = ? WHERE id = ?',
      ['downloading', attachmentId],
      'notification_attachments'
    );

    // Queue the download
    return new Promise((resolve) => {
      const downloadId = `attachment-${attachmentId}`;

      const onComplete = (result: { id: string; success: boolean; localPath?: string; error?: string }) => {
        if (result.id !== downloadId) return;

        fileDownloadManager.off('download-complete', onComplete);
        fileDownloadManager.off('download-error', onComplete);

        if (result.success && result.localPath) {
          // Update database with local path
          database.executeWrite(
            'UPDATE notification_attachments SET download_status = ?, local_path = ?, downloaded_at = ? WHERE id = ?',
            ['completed', result.localPath, new Date().toISOString(), attachmentId],
            'notification_attachments'
          );
          metricsCollector.increment('attachment.download.success');
          resolve({ success: true, localPath: result.localPath });
        } else {
          database.executeWrite(
            'UPDATE notification_attachments SET download_status = ? WHERE id = ?',
            ['failed', attachmentId],
            'notification_attachments'
          );
          metricsCollector.increment('attachment.download.failure');
          resolve({ success: false, error: result.error || 'Download failed' });
        }
      };

      fileDownloadManager.on('download-complete', onComplete);
      fileDownloadManager.on('download-error', onComplete);

      fileDownloadManager.queueDownload({
        id: downloadId,
        url: attachment.url,
        courseCode,
        filename: attachment.filename,
        authToken: token,
      });
    });
  });

  // Open a downloaded file
  ipcMain.handle('attachment:open', async (_event, attachmentId: number) => {
    const attachment = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM notification_attachments WHERE id = ?',
      [attachmentId]
    );

    if (!attachment?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    const { shell } = require('electron');
    try {
      await shell.openPath(attachment.local_path);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Show file in folder
  ipcMain.handle('attachment:showInFolder', (_event, attachmentId: number) => {
    const attachment = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM notification_attachments WHERE id = ?',
      [attachmentId]
    );

    if (!attachment?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    const { shell } = require('electron');
    shell.showItemInFolder(attachment.local_path);
    return { success: true };
  });

  // L4 Command handlers
  ipcMain.handle('command:dispatch', async (_event, commandName: string, params: unknown) => {
    if (!commandDispatcher) {
      return { success: false, error: 'Command dispatcher not initialized' };
    }

    const result = await commandDispatcher.dispatch(commandName as Parameters<typeof commandDispatcher.dispatch>[0], params);
    if (result.success) {
      metricsCollector.increment(`command.${commandName}.success`);
    } else {
      metricsCollector.increment(`command.${commandName}.failure`);
    }
    return result;
  });

  // Simulation state handlers
  ipcMain.handle('simulation:getState', () => {
    if (!commandDispatcher) {
      return { isActive: false, grades: [] };
    }

    const context = commandDispatcher.getSimulationContext();
    return {
      isActive: context.isActive,
      startedAt: context.startedAt,
      grades: Array.from(context.grades.values()),
    };
  });

  ipcMain.handle('simulation:clear', async () => {
    if (!commandDispatcher) {
      return { success: false, error: 'Command dispatcher not initialized' };
    }

    commandDispatcher.clearSimulation();
    return { success: true };
  });
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

app.whenReady().then(async () => {
  logger.info('Canvas Integration Dashboard starting...');
  logger.info(`Platform: ${process.platform}, Electron: ${process.versions.electron}`);
  logger.info(`Data directory: ${APP_DATA_DIR}`);

  // Initialize database and run migrations
  try {
    database.initialize();
    migrationRunner.loadMigrations(coreMigrations);
    const migrationResult = migrationRunner.runAll();
    const currentVersion = database.getSchemaVersion();
    logger.info(`Database initialized at version ${currentVersion}, ${migrationResult.applied} migrations applied`);
    if (migrationResult.errors.length > 0) {
      logger.warn(`Migration errors: ${migrationResult.errors.join(', ')}`);
    }
    metricsCollector.increment('database.initialized');

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
            database.executeWrite(
              'UPDATE notifications SET message = ? WHERE id = ?',
              [cleanMessage, row.id]
            );
            cleaned++;
          }
        }
      });
      if (cleaned > 0) {
        logger.info(`Cleaned HTML from ${cleaned} notification messages`);
      }
    }

    // Initialize L4 CommandDispatcher now that database is ready
    commandDispatcher = new CommandDispatcher({ db: database });

    // Forward sync requests from CommandDispatcher to SyncEngine
    commandDispatcher.on('sync-requested', async (event) => {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('simulation:changed', event);
        logger.debug(`Simulation changed: ${event.type}`);
      }
    });

    // Forward database commit events to renderer (for store updates)
    database.on('commit', (event: { table: string }) => {
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

  // Register IPC handlers
  registerIpcHandlers();

  // Start background services
  healthCheck.start();
  metricsCollector.start();
  housekeepingManager.start();

  // Try to initialize Canvas client if credentials exist
  const hasCredentials = await credentialManager.exists();
  if (hasCredentials) {
    const token = await credentialManager.retrieve();
    if (token) {
      // Default Canvas URL - could be stored in config
      const baseUrl = 'https://utoronto.instructure.com';
      await initializeCanvasClient(token, baseUrl);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  logger.info('Application quitting...');

  // Clear simulation state (as per spec: clears on app close)
  if (commandDispatcher) {
    commandDispatcher.clearSimulation();
  }

  // Stop all background services
  systemMonitor.stop();
  healthCheck.stop();
  metricsCollector.stop();
  housekeepingManager.stop();
  circuitBreaker.stop();

  // Close database
  database.close();

  logger.close();
});
