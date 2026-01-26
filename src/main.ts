import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  Tray,
  Menu,
  nativeImage,
} from 'electron';
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
} from './layers/l1-persistence';

// L2 - Daemon
import {
  CanvasClient,
  SyncEngine,
  RateLimiter,
  CircuitBreaker,
  htmlToPlainText,
  ICSParser,
  RRuleExpander,
} from './layers/l2-daemon';
import crypto from 'crypto';

// L3 - Intelligence
import { PriorityEngine } from './layers/l3-intelligence/PriorityEngine';
import { PriorityOrchestrator } from './layers/l3-intelligence/orchestration/PriorityOrchestrator';
import { RecommendationOrchestrator } from './layers/l3-intelligence/orchestration/RecommendationOrchestrator';
import { InsightOrchestrator } from './layers/l3-intelligence/orchestration/InsightOrchestrator';
import { WorkloadOrchestrator } from './layers/l3-intelligence/orchestration/WorkloadOrchestrator';
import { BehaviorTrackingOrchestrator } from './layers/l3-intelligence/orchestration/BehaviorTrackingOrchestrator';
import { AdaptiveLearningOrchestrator } from './layers/l3-intelligence/orchestration/AdaptiveLearningOrchestrator';

// L4 - Controller
import { CommandDispatcher } from './layers/l4-controller';

// Application paths
const APP_DATA_DIR = path.join(app.getPath('userData'), 'CanvasAssistant');
const DB_PATH = path.join(APP_DATA_DIR, 'canvas.db');
const METRICS_DB_PATH = path.join(APP_DATA_DIR, 'metrics.db');
const LOG_DIR = path.join(APP_DATA_DIR, 'logs');
// Default files directory is in project root's Downloads folder
const FILES_DIR = path.join(process.cwd(), 'Downloads');
const CREDENTIAL_FILE = path.join(APP_DATA_DIR, '.credentials');
const CRASH_FLAG_FILE = path.join(APP_DATA_DIR, '.crash_flag');
const CRASH_HISTORY_FILE = path.join(APP_DATA_DIR, '.crash_history');
const _SESSION_STATE_FILE = path.join(APP_DATA_DIR, '.session_state');

// Crash history and recovery state
interface CrashHistoryEntry {
  timestamp: string;
  reason: string;
}
interface CrashHistory {
  crashes: CrashHistoryEntry[];
  lastCleanExit: string | null;
  safeMode: boolean;
}
const CRASH_LOOP_THRESHOLD = 3; // Number of crashes to trigger safe mode
const CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SAFE_MODE_CLEAR_DELAY_MS = 5 * 60 * 1000; // 5 minutes of stable runtime to clear safe mode

let safeModeEnabled = false;
let safeModeTimer: NodeJS.Timeout | null = null;
let lastCrashInfo: CrashHistoryEntry | null = null;

// Database corruption state
interface DatabaseCorruptionInfo {
  errors: string[];
  canContinue: boolean;
}
let databaseCorruptionDetected: DatabaseCorruptionInfo | null = null;

// Auto-sync state
let autoSyncInterval: NodeJS.Timeout | null = null;
let lastFocusLostAt: number | null = null;
const FOCUS_RESTORE_SYNC_THRESHOLD_MS = 60000; // 1 minute

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

// Initialize Layer 1 persistence
const database = new Database({ dbPath: DB_PATH, verbose: false });
const migrationRunner = new MigrationRunner(database);
let visibleDataProvider: VisibleDataProvider | null = null;

// Initialize Layer 4 controller (after database is ready)
// Note: CommandDispatcher is initialized lazily after database.initialize()
let commandDispatcher: CommandDispatcher | null = null;
let priorityEngine: PriorityEngine | null = null;
let priorityOrchestrator: PriorityOrchestrator | null = null;
let recommendationOrchestrator: RecommendationOrchestrator | null = null;
let insightOrchestrator: InsightOrchestrator | null = null;
let workloadOrchestrator: WorkloadOrchestrator | null = null;
let behaviorTrackingOrchestrator: BehaviorTrackingOrchestrator | null = null;
let adaptiveLearningOrchestrator: AdaptiveLearningOrchestrator | null = null;

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
let tray: Tray | null = null;
let isQuitting = false;

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

// Get window behavior settings from a simple JSON file in app data
function getWindowBehavior(): WindowBehaviorSettings {
  const settingsPath = path.join(APP_DATA_DIR, 'window-behavior.json');
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
  const settingsPath = path.join(APP_DATA_DIR, 'window-behavior.json');
  try {
    // Ensure directory exists
    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    logger.error('Failed to save window behavior settings:', error as Error);
  }
}

function createWindow() {
  logger.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1536,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
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

    // Trigger sync if away for more than threshold
    if (
      lastFocusLostAt &&
      Date.now() - lastFocusLostAt > FOCUS_RESTORE_SYNC_THRESHOLD_MS
    ) {
      // Debounce: wait 500ms before syncing
      setTimeout(() => {
        triggerFocusRestoreSync();
      }, 500);
    }
    lastFocusLostAt = null;
  });

  mainWindow.on('blur', () => {
    systemMonitor.setWindowFocused(false);
    lastFocusLostAt = Date.now();
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

  // Send recovery status once window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    const recoveryStatus = getRecoveryStatus();
    if (recoveryStatus.safeMode || recoveryStatus.lastCrash) {
      mainWindow?.webContents.send('app:recovery-status', recoveryStatus);
    }

    // Send database corruption notification if detected during startup
    if (databaseCorruptionDetected) {
      mainWindow?.webContents.send('app:database-corruption', databaseCorruptionDetected);
    }
  });

  // Handle renderer process crash
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(
      `Renderer process crashed: reason=${details.reason}, exitCode=${details.exitCode}`
    );
    metricsCollector.increment('renderer.crash');

    // Write crash info for recovery
    writeCrashFlag(`renderer_crash: ${details.reason}`);

    // Attempt to reload the window after a short delay
    if (details.reason !== 'killed' && details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          logger.info('Attempting to reload renderer after crash...');
          mainWindow.loadURL(
            process.env.NODE_ENV === 'development'
              ? 'http://localhost:5173'
              : `file://${path.join(__dirname, 'renderer/index.html')}`
          );
        }
      }, 1000);
    }
  });

  // Handle renderer unresponsive
  mainWindow.webContents.on('unresponsive', () => {
    logger.warn('Renderer process is unresponsive');
    metricsCollector.increment('renderer.unresponsive');

    // Could show dialog offering to reload, but for now just log
    // The system will recover automatically if it becomes responsive again
  });

  // Handle renderer becomes responsive again
  mainWindow.webContents.on('responsive', () => {
    logger.info('Renderer process became responsive again');
    metricsCollector.increment('renderer.recovered');
  });

  mainWindow.on('closed', () => {
    logger.info('Main window closed');
    mainWindow = null;
  });

  // Handle window close with minimize-to-tray option
  mainWindow.on('close', (event) => {
    // If we're quitting, allow the close
    if (isQuitting) {
      return;
    }

    const settings = getWindowBehavior();

    // If closeAction is null (not yet chosen), prompt the user via renderer UI
    if (settings.closeAction === null) {
      event.preventDefault();
      // Send event to renderer to show the close behavior dialog
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('window:promptCloseBehavior');
      }
      return;
    }

    // If minimize-to-tray is set, hide window instead of closing
    if (settings.closeAction === 'minimize-to-tray') {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }

    // Otherwise (closeAction === 'quit'), allow the close to proceed
  });
}

/**
 * Create system tray icon and menu
 */
function createTray(): void {
  // Skip if tray already exists
  if (tray) return;

  const _settings = getWindowBehavior();

  // Create tray icon - use the app icon
  // Platform-specific icon sizes are required for proper display on each OS
  let iconPath: string;
  if (process.platform === 'darwin') {
    // macOS requires 16x16 template images for menu bar icons
    iconPath = path.join(__dirname, '../assets/app.iconset/icon_16x16.png');
  } else if (process.platform === 'win32') {
    // Windows system tray works best with 32x32 icons
    iconPath = path.join(__dirname, '../assets/app.iconset/icon_32x32.png');
  } else {
    // Linux - use 22x22 or 24x24
    iconPath = path.join(__dirname, '../assets/app.iconset/icon_32x32.png');
  }

  // Fallback to a simpler path structure for packaged app
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(
      process.resourcesPath || '',
      'assets/app.iconset/icon_32x32.png'
    );
  }

  // If still not found, create a default icon
  let icon: Electron.NativeImage;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    // On macOS, set as template image for proper menu bar appearance
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
  } else {
    // Create a simple default icon (small colored square)
    logger.warn(`Tray icon not found at ${iconPath}, using default`);
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Canvas Assistant');

  // Build context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click behavior - show window on single click (Windows/Linux)
  // On macOS, the menu is shown on click by default
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  }

  // Double-click shows window (Windows)
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  logger.info('System tray created');
}

/**
 * Destroy system tray
 */
function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
    logger.info('System tray destroyed');
  }
}

/**
 * Initialize the Canvas client and sync engine when credentials are available
 */
async function initializeCanvasClient(token: string, baseUrl: string): Promise<boolean> {
  try {
    canvasClient = new CanvasClient({ baseUrl, accessToken: token });

    // Validate the token
    const validation = await circuitBreaker.execute(() => canvasClient!.validateToken());

    if (!validation.valid) {
      logger.error(`Canvas token validation failed: ${validation.error}`);
      canvasClient = null;
      return false;
    }

    logger.info(`Canvas client initialized for user: ${validation.user?.name}`);
    metricsCollector.increment('canvas.auth.success');

    // Listen for auth errors (token expiration/invalidation)
    canvasClient.on('auth-error', (error) => {
      logger.warn(`Canvas auth error detected: ${error.message}`);
      metricsCollector.increment('canvas.auth.expired');
      // Notify renderer to show re-auth modal
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth:expired', { reason: error.message });
      }
    });

    // Initialize sync engine with HTML content sync
    syncEngine = new SyncEngine({
      client: canvasClient,
      db: database,
      rateLimiter,
      downloadManager: fileDownloadManager,
      filesBaseDir: FILES_DIR,
      htmlContentSyncConfig: {
        enabled: true,
        urlRewriting: 'local',
        downloadImages: true,
        downloadLinkedFiles: true,
        maxConcurrentDownloads: 3,
      },
      logger: logger.child('SyncEngine'),
    });

    // Forward sync events to metrics
    syncEngine.on('sync-start', ({ type }) => {
      metricsCollector.increment(`sync.${type}.started`);
      logger.info(`Sync started: ${type}`);
    });

    syncEngine.on('sync-complete', (result) => {
      metricsCollector.increment('sync.full.completed');
      metricsCollector.recordTiming('sync.full.duration', result.totalDuration);
      logger.info(`Sync completed in ${result.totalDuration}ms`);

      // Invalidate VisibleDataProvider cache so new courses appear immediately (#9)
      // This ensures priority calculations and UI see the updated course list
      if (visibleDataProvider) {
        visibleDataProvider.invalidateCache();
        logger.debug('VisibleDataProvider cache invalidated after sync');
      }
    });

    syncEngine.on('sync-error', ({ type, error }) => {
      metricsCollector.increment(`sync.${type}.errors`);
      logger.error(`Sync error in ${type}: ${error}`);
      // Forward to renderer so UI can show specific error details
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:error', { type, error });
      }
    });

    // Forward granular entity errors to renderer for detailed error display
    syncEngine.on('sync-entity-error', ({ entity, externalId, error, courseName }) => {
      metricsCollector.increment(`sync.entity.${entity}.errors`);
      logger.warn(`Sync entity error: ${entity} (${externalId}): ${error}`);
      // Forward to renderer for granular error display
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:entityError', {
          entity,
          externalId,
          error,
          courseName,
        });
      }
    });

    // Forward sync progress for UI updates
    syncEngine.on('sync-progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:progress', progress);
      }
    });

    // Forward sync phase changes
    syncEngine.on('sync-phase', ({ phase, status }) => {
      logger.info(`Sync phase ${phase}: ${status}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:phase', { phase, status });
      }
    });

    // Forward sync aborted events
    syncEngine.on('sync-aborted', ({ reason, error }) => {
      logger.error(`Sync aborted: ${reason} - ${error}`);
      metricsCollector.increment('sync.aborted');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:aborted', { reason, error });
      }
    });

    // Forward sync conflicts to renderer for user resolution
    syncEngine.on('sync-conflicts', ({ entity, conflicts }) => {
      if (mainWindow && !mainWindow.isDestroyed() && conflicts.length > 0) {
        logger.info(`Sync conflicts detected: ${conflicts.length} ${entity} conflict(s)`);
        mainWindow.webContents.send('sync:conflicts', conflicts);
        metricsCollector.increment(`sync.conflicts.${entity}`);
      }
    });

    // Start background token validation to detect expired/revoked tokens
    credentialManager.startBackgroundValidation();

    // Listen for token invalidation events
    credentialManager.on('token-invalid', ({ reason }) => {
      logger.warn(`Token invalid: ${reason}`);
      metricsCollector.increment('canvas.token.invalid');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth:expired', { reason });
      }
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
  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  // Shell operations
  ipcMain.on('shell:openExternal', async (_event, url: string) => {
    const { shell } = require('electron');
    try {
      await shell.openExternal(url);
    } catch (error) {
      logger.error('Failed to open external URL:', error as Error);
    }
  });

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
      credentialManager.stopBackgroundValidation();
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

    // Unlock database in case it was locked from a previous reset
    if (database.isWriteLocked()) {
      database.unlockWrites();
      logger.info('Database unlocked for new connection');
    }

    const success = await initializeCanvasClient(token, baseUrl);
    return { success, error: success ? undefined : 'Token validation failed' };
  });

  ipcMain.handle(
    'canvas:validateToken',
    async (_event, token: string, baseUrl: string) => {
      try {
        const client = new CanvasClient({ baseUrl, accessToken: token });
        const result = await client.validateToken();
        return result;
      } catch (error) {
        return { valid: false, error: String(error) };
      }
    }
  );

  // Get user profile from Canvas
  ipcMain.handle('canvas:getUserProfile', async () => {
    logger.debug(`getUserProfile called, canvasClient available: ${!!canvasClient}`);

    if (!canvasClient) {
      logger.warn('getUserProfile: Canvas client not initialized');
      return null;
    }

    try {
      logger.debug('Fetching user profile from Canvas API...');
      const profile = await canvasClient.getUserProfile();
      logger.debug(
        `User profile received: name=${profile.name}, hasAvatar=${!!profile.avatar_url}`
      );

      let avatarDataUrl: string | null = null;

      // Download avatar and convert to base64 data URL
      if (profile.avatar_url) {
        try {
          const axios = require('axios');

          logger.debug(`Downloading avatar from: ${profile.avatar_url}`);
          const imageResponse = await axios.get(profile.avatar_url, {
            responseType: 'arraybuffer',
            timeout: 10000,
          });

          // Get content type and convert to base64
          const contentType = imageResponse.headers['content-type'] || 'image/png';
          const base64 = Buffer.from(imageResponse.data).toString('base64');
          avatarDataUrl = `data:${contentType};base64,${base64}`;
          logger.debug(`Avatar converted to data URL (${base64.length} chars)`);
        } catch (avatarError) {
          logger.warn(`Failed to download avatar: ${avatarError}`);
        }
      }

      return {
        name: profile.name,
        email: profile.email || profile.login_id || null,
        avatarUrl: avatarDataUrl,
      };
    } catch (error) {
      logger.error(`Failed to get user profile: ${error}`);
      return null;
    }
  });

  // Debug: Direct Canvas API call (for testing) - only available in development
  ipcMain.handle('canvas:debugFetch', async (_event, endpoint: string) => {
    // Only allow debug API access in development mode
    if (process.env.NODE_ENV !== 'development') {
      logger.warn('[canvas:debugFetch] Debug API blocked in production mode');
      return { success: false, error: 'Debug API only available in development mode' };
    }

    if (!canvasClient) {
      return { success: false, error: 'Canvas client not initialized' };
    }
    try {
      logger.debug(`[canvas:debugFetch] Fetching: ${endpoint}`);
      const response = await canvasClient.get(endpoint);
      return { success: true, data: response.data };
    } catch (error) {
      logger.error(`[canvas:debugFetch] Error: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Sync operations
  ipcMain.handle(
    'sync:full',
    async (
      _event,
      options?: {
        termSelection?: 'all' | 'auto' | string;
        syncCanvasFiles?: boolean;
        syncAnnouncements?: boolean;
        courseIds?: number[];
      }
    ) => {
      logger.debug(`[IPC sync:full] Received options: ${JSON.stringify(options)}`);

      if (!syncEngine) {
        logger.warn('Sync attempted but Canvas client not initialized');
        return {
          success: false,
          error: 'Canvas client not initialized. Please reconnect to Canvas.',
        };
      }

      if (!systemMonitor.getState().canSync) {
        logger.warn('Sync blocked due to system state');
        return {
          success: false,
          error: 'Sync disabled due to system state (battery/focus)',
        };
      }

      const courseIdsStr = options?.courseIds
        ? `courseIds=[${options.courseIds.length} courses]`
        : 'courseIds=all';
      logger.info(
        `Sync requested with options: termSelection=${options?.termSelection ?? 'all'}, syncCanvasFiles=${options?.syncCanvasFiles ?? true}, syncAnnouncements=${options?.syncAnnouncements ?? true}, ${courseIdsStr}`
      );

      // Emit any pending conflicts from previous sessions before starting sync
      const pendingConflicts = syncEngine.getConflictResolver().getPendingConflicts();
      if (pendingConflicts.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
        logger.info(
          `[Sync] Emitting ${pendingConflicts.length} pending conflicts from previous session`
        );
        mainWindow.webContents.send('sync:conflicts', pendingConflicts);
      }

      try {
        const result = await syncEngine.syncAll(options);
        logger.info(`Sync completed: ${JSON.stringify(result)}`);
        // Trigger Files page refresh
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-status-changed', { type: 'sync-complete' });
        }
        return { success: true, result };
      } catch (error) {
        logger.error(`Sync failed: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

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

  ipcMain.handle(
    'sync:folderFiles',
    async (
      _event,
      params: {
        canvasFolderId: number;
        localCourseId: number;
        forceRefresh?: boolean;
      }
    ) => {
      if (!syncEngine) {
        return { success: false, error: 'Canvas client not initialized' };
      }

      try {
        const result = await syncEngine.syncFolderFiles(
          params.canvasFolderId,
          params.localCourseId,
          { forceRefresh: params.forceRefresh }
        );
        return {
          success: true,
          data: {
            success: result.success,
            count: result.count,
            errors: result.errors,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'sync:folderByPath',
    async (
      _event,
      params: {
        courseId: number;
        folderPath: string;
      }
    ) => {
      if (!syncEngine) {
        return { success: false, error: 'Canvas client not initialized' };
      }

      try {
        // Look up the folder's Canvas ID from database
        const folder = database.executeReadOne<{
          external_id: string;
          course_id: number;
        }>(
          `SELECT external_id, course_id FROM resources
         WHERE course_id = ? AND folder_path = ? AND type = 'folder'`,
          [params.courseId, params.folderPath]
        );

        if (!folder) {
          // Folder not in database - might be a virtual folder path, return success with 0 count
          return {
            success: true,
            data: { success: true, count: 0, errors: [] },
          };
        }

        // Get the Canvas course ID from the local course
        const course = database.executeReadOne<{ external_id: string }>(
          'SELECT external_id FROM courses WHERE id = ?',
          [params.courseId]
        );

        if (!course) {
          return { success: false, error: 'Course not found' };
        }

        const canvasFolderId = parseInt(folder.external_id, 10);
        const result = await syncEngine.syncFolderFiles(canvasFolderId, params.courseId);

        return {
          success: true,
          data: {
            success: result.success,
            count: result.count,
            errors: result.errors,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

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

  // Renderer logger - forwards logs from renderer to main process Logger
  ipcMain.handle(
    'log:renderer',
    (_event, level: string, message: string, component?: string) => {
      const prefix = component ? `[Renderer:${component}]` : '[Renderer]';
      const fullMessage = `${prefix} ${message}`;

      switch (level) {
        case 'debug':
          logger.debug(fullMessage);
          break;
        case 'info':
          logger.info(fullMessage);
          break;
        case 'warn':
          logger.warn(fullMessage);
          break;
        case 'error':
          logger.error(fullMessage);
          break;
        default:
          logger.info(fullMessage);
      }
    }
  );

  // Data fetching handlers for L5 store
  ipcMain.handle('data:getEnrollmentTerms', () => {
    try {
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        name: string;
        start_at: string | null;
        end_at: string | null;
      }>('SELECT * FROM enrollment_terms ORDER BY start_at DESC');

      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        name: row.name,
        startAt: row.start_at,
        endAt: row.end_at,
      }));
    } catch (error) {
      logger.error(`Failed to get enrollment terms: ${error}`);
      throw error;
    }
  });

  ipcMain.handle('data:getCourses', () => {
    try {
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
        enrollment_term_id: number | null;
      }>('SELECT * FROM courses ORDER BY name');

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
        enrollmentTermId: row.enrollment_term_id,
      }));
    } catch (error) {
      logger.error(`Failed to get courses: ${error}`);
      throw error;
    }
  });

  ipcMain.handle(
    'data:getTasks',
    (_event, options?: { courseIds?: number[] } | number) => {
      try {
        // Support both old API (single courseId) and new API (courseIds array)
        let sql: string;
        let params: number[] = [];

        if (typeof options === 'number') {
          // Legacy: single courseId
          sql = 'SELECT * FROM tasks WHERE course_id = ? ORDER BY priority_score DESC';
          params = [options];
        } else if (options?.courseIds && options.courseIds.length > 0) {
          // New: array of courseIds - filter at source for bandwidth efficiency
          const placeholders = options.courseIds.map(() => '?').join(', ');
          sql = `SELECT * FROM tasks WHERE course_id IN (${placeholders}) ORDER BY priority_score DESC`;
          params = options.courseIds;
        } else {
          // No filter - return all tasks
          sql = 'SELECT * FROM tasks ORDER BY priority_score DESC';
        }

        const rows = database.executeRead<{
          id: number;
          external_id: string;
          course_id: number;
          title: string;
          description: string | null;
          due_at: string | null;
          due_time_known: number;
          weight: number;
          grade: number | null;
          points_possible: number | null;
          priority_score: number;
          is_completed: number;
          completed_at: string | null;
          submission_status: string | null;
          task_type: string | null;
          is_optional: number;
        }>(sql, params);

        return rows.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          courseId: row.course_id,
          title: row.title,
          description: row.description,
          dueAt: row.due_at,
          dueTimeKnown: Boolean(row.due_time_known ?? 1), // Default to true for backward compat
          weight: row.weight,
          grade: row.grade,
          pointsPossible: row.points_possible,
          priorityScore: row.priority_score,
          isCompleted: Boolean(row.is_completed),
          completedAt: row.completed_at,
          submissionStatus: row.submission_status,
          taskType: row.task_type,
          isOptional: Boolean(row.is_optional),
        }));
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'data:getNotifications',
    (_event, options?: { courseIds?: number[] }) => {
      try {
        // Filter by courseIds if provided, always include system notifications (course_id is null)
        let sql: string;
        let params: number[] = [];

        if (options?.courseIds && options.courseIds.length > 0) {
          // Filter by courseIds - keeps system notifications + notifications from specified courses
          const placeholders = options.courseIds.map(() => '?').join(', ');
          sql = `
        SELECT n.* FROM notifications n
        LEFT JOIN courses c ON n.course_id = c.id
        WHERE (n.course_id IS NULL OR n.course_id IN (${placeholders}))
          AND (n.course_id IS NULL OR c.id IS NOT NULL)
        ORDER BY n.published_at DESC
      `;
          params = options.courseIds;
        } else {
          // No filter - return all notifications from synced courses
          sql = `
        SELECT n.* FROM notifications n
        LEFT JOIN courses c ON n.course_id = c.id
        WHERE n.course_id IS NULL OR c.id IS NOT NULL
        ORDER BY n.published_at DESC
      `;
        }

        const rows = database.executeRead<{
          id: number;
          source_type: string;
          source_id: string;
          course_id: number | null;
          title: string;
          message: string;
          message_html: string | null;
          published_at: string;
          dismissed_at: string | null;
          url: string | null;
        }>(sql, params);

        return rows.map((row) => ({
          id: row.id,
          sourceType: row.source_type,
          sourceId: row.source_id,
          courseId: row.course_id,
          title: row.title,
          message: row.message,
          messageHtml: row.message_html,
          publishedAt: row.published_at,
          dismissedAt: row.dismissed_at,
          url: row.url,
        }));
      } catch (error) {
        logger.error(`Failed to get notifications: ${error}`);
        throw error;
      }
    }
  );

  // Get a single notification by ID
  ipcMain.handle('data:getNotification', (_event, notificationId: number) => {
    try {
      const row = database.executeReadOne<{
        id: number;
        source_type: string;
        source_id: string;
        course_id: number | null;
        title: string;
        message: string;
        message_html: string | null;
        published_at: string;
        dismissed_at: string | null;
        url: string | null;
      }>('SELECT * FROM notifications WHERE id = ?', [notificationId]);

      if (!row) return null;

      return {
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        courseId: row.course_id,
        title: row.title,
        message: row.message,
        messageHtml: row.message_html,
        publishedAt: row.published_at,
        dismissedAt: row.dismissed_at,
        url: row.url,
      };
    } catch (error) {
      logger.error(`Failed to get notification: ${error}`);
      throw error;
    }
  });

  // Get a single course by ID
  ipcMain.handle('data:getCourse', (_event, courseId: number) => {
    try {
      const row = database.executeReadOne<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        assessed_grade: number | null;
        current_grade: number | null;
        total_weight: number;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        syllabus_body: string | null;
        last_synced_at: string | null;
      }>('SELECT * FROM courses WHERE id = ?', [courseId]);

      if (!row) return null;

      return {
        id: row.id,
        externalId: row.external_id,
        code: row.code,
        name: row.name,
        targetGrade: row.target_grade,
        assessedGrade: row.assessed_grade,
        currentGrade: row.current_grade,
        totalWeight: row.total_weight,
        color: row.color,
        nickname: row.nickname,
        isHidden: Boolean(row.is_hidden),
        syllabusBody: row.syllabus_body,
        lastSyncedAt: row.last_synced_at,
      };
    } catch (error) {
      logger.error(`Failed to get course: ${error}`);
      throw error;
    }
  });

  // Get policies for a course
  ipcMain.handle('data:getPolicies', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        policy_name: string;
        policy_config: string;
        raw_text: string | null;
        is_user_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>(
        'SELECT * FROM course_policies WHERE course_id = ? AND is_active = 1 ORDER BY policy_type, policy_name',
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        policyName: row.policy_name,
        policyConfig: JSON.parse(row.policy_config || '{}'),
        rawText: row.raw_text,
        isUserVerified: Boolean(row.is_user_verified),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error(`Failed to get policies: ${error}`);
      throw error;
    }
  });

  // Get all policies for multiple courses (for policy badges on tasks)
  ipcMain.handle('data:getAllPolicies', (_event, options?: { courseIds?: number[] }) => {
    try {
      let sql =
        'SELECT * FROM course_policies WHERE is_active = 1 ORDER BY course_id, policy_type, policy_name';
      const params: unknown[] = [];

      if (options?.courseIds && options.courseIds.length > 0) {
        const placeholders = options.courseIds.map(() => '?').join(', ');
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) AND is_active = 1 ORDER BY course_id, policy_type, policy_name`;
        params.push(...options.courseIds);
      }

      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        policy_name: string;
        policy_config: string;
        raw_text: string | null;
        is_user_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>(sql, params);

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        policyName: row.policy_name,
        policyConfig: JSON.parse(row.policy_config || '{}'),
        rawText: row.raw_text,
        isUserVerified: Boolean(row.is_user_verified),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error(`Failed to get all policies: ${error}`);
      throw error;
    }
  });

  // Get syllabus designation for a course
  ipcMain.handle('data:getCourseSyllabus', (_event, courseId: number) => {
    try {
      const row = database.executeReadOne<{
        id: number;
        course_id: number;
        resource_id: number;
        source_type: string;
        resource_updated_at: string | null;
        last_reviewed_at: string;
        change_detected_at: string | null;
        marked_at: string;
      }>('SELECT * FROM course_syllabuses WHERE course_id = ?', [courseId]);

      if (!row) return null;

      // Look up the title based on source type
      let title = 'Unknown file';
      let _remoteUpdatedAt: string | null = null;

      if (row.source_type === 'attachment') {
        // Look up notification attachment
        const attachment = database.executeReadOne<{
          display_name: string;
          downloaded_at: string | null;
        }>(
          'SELECT display_name, downloaded_at FROM notification_attachments WHERE id = ?',
          [row.resource_id]
        );
        if (attachment) {
          title = attachment.display_name;
          _remoteUpdatedAt = attachment.downloaded_at;
        }
      } else {
        // Look up resource
        const resource = database.executeReadOne<{
          title: string;
          remote_updated_at: string | null;
        }>('SELECT title, remote_updated_at FROM resources WHERE id = ?', [
          row.resource_id,
        ]);
        if (resource) {
          title = resource.title;
          _remoteUpdatedAt = resource.remote_updated_at;
        }
      }

      // Return resource_id with correct sign (negative for attachments)
      const returnedResourceId =
        row.source_type === 'attachment' ? -row.resource_id : row.resource_id;

      return {
        id: row.id,
        courseId: row.course_id,
        resourceId: returnedResourceId,
        resourceTitle: title,
        resourceUpdatedAt: row.resource_updated_at,
        lastReviewedAt: row.last_reviewed_at,
        changeDetectedAt: row.change_detected_at,
        markedAt: row.marked_at,
      };
    } catch (error) {
      logger.error(`Failed to get course syllabus: ${error}`);
      throw error;
    }
  });

  // Get files for a specific course (for syllabus selection)
  // Returns both resources (synced files) and notification attachments
  ipcMain.handle('data:getCourseFiles', (_event, courseId: number) => {
    try {
      // Get resources (files synced from Canvas) - match Files panel query (type IN ('file', 'page'))
      const resources = database.executeRead<{
        id: number;
        external_id: string;
        course_id: number;
        parent_folder_id: number | null;
        folder_path: string | null;
        type: string;
        title: string;
        url: string | null;
        local_path: string | null;
        size_bytes: number | null;
        mime_type: string | null;
        synced_at: string | null;
        remote_updated_at: string | null;
      }>(
        `SELECT * FROM resources
         WHERE course_id = ? AND type IN ('file', 'page')
         ORDER BY folder_path, title`,
        [courseId]
      );

      logger.info(
        `getCourseFiles for course ${courseId}: found ${resources.length} resources, types: ${[...new Set(resources.map((r) => r.type))].join(', ')}, folders: ${[...new Set(resources.map((r) => r.folder_path || 'null'))].join(', ')}`
      );

      // Get notification attachments for this course
      const attachments = database.executeRead<{
        id: number;
        notification_id: number;
        course_id: number;
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
        `SELECT na.*
         FROM notification_attachments na
         WHERE na.course_id = ?
         ORDER BY na.display_name`,
        [courseId]
      );

      // Map resources to FileResource format
      const resourceFiles = resources.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        parentFolderId: row.parent_folder_id,
        folderPath: row.folder_path,
        type: row.type,
        title: row.title,
        url: row.url,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
        syncedAt: row.synced_at,
        source: 'resource' as const,
      }));

      // Map attachments to FileResource format (with negative IDs to avoid collision)
      const attachmentFiles = attachments.map((row) => ({
        id: -row.id, // Negative ID to distinguish from resources
        externalId: row.external_id,
        courseId: row.course_id,
        parentFolderId: null,
        folderPath: 'Announcement Attachments',
        type: 'file',
        title: row.display_name,
        url: row.url,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.content_type,
        syncedAt: row.downloaded_at,
        source: 'attachment' as const,
      }));

      return [...resourceFiles, ...attachmentFiles];
    } catch (error) {
      logger.error(`Failed to get course files: ${error}`);
      throw error;
    }
  });

  // Get grade history for a course
  ipcMain.handle('data:getGradeHistory', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        course_id: number;
        grade: number;
        recorded_at: string;
      }>(
        'SELECT * FROM grade_history WHERE course_id = ? ORDER BY recorded_at DESC LIMIT 30',
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        grade: row.grade,
        recordedAt: row.recorded_at,
      }));
    } catch (error) {
      logger.error(`Failed to get grade history: ${error}`);
      throw error;
    }
  });

  // Get all files (resources + notification attachments + pages)
  ipcMain.handle('data:getFiles', () => {
    try {
      // Get resources (files synced from Canvas) - excludes HTML wrapper pages
      const resources = database.executeRead<{
        id: number;
        external_id: string;
        course_id: number;
        parent_folder_id: number | null;
        folder_path: string | null;
        type: string;
        title: string;
        url: string | null;
        local_path: string | null;
        size_bytes: number | null;
        mime_type: string | null;
        synced_at: string | null;
      }>(`
      SELECT r.*, c.code as course_code, c.name as course_name
      FROM resources r
      JOIN courses c ON r.course_id = c.id
      WHERE r.type IN ('file', 'page')
      ORDER BY r.course_id, r.folder_path, r.title
    `);

      // Get notification attachments
      const attachments = database.executeRead<{
        id: number;
        notification_id: number;
        course_id: number;
        external_id: string;
        display_name: string;
        filename: string;
        url: string;
        size_bytes: number | null;
        content_type: string | null;
        local_path: string | null;
        download_status: string;
        downloaded_at: string | null;
        course_code: string;
        course_name: string;
        notification_title: string;
      }>(`
      SELECT
        na.*,
        c.code as course_code,
        c.name as course_name,
        n.title as notification_title
      FROM notification_attachments na
      JOIN courses c ON na.course_id = c.id
      JOIN notifications n ON na.notification_id = n.id
      ORDER BY na.course_id, na.display_name
    `);

      // Note: course_pages excluded - they redirect to Canvas, not local files

      const downloadedResources = resources.filter((r) => r.local_path !== null).length;
      const downloadedAttachments = attachments.filter(
        (a) => a.download_status === 'completed'
      ).length;
      logger.info(
        `Found ${resources.length} files (${downloadedResources} downloaded), ${attachments.length} attachments (${downloadedAttachments} downloaded)`
      );

      return {
        resources: resources.map((r) => ({
          id: r.id,
          externalId: r.external_id,
          courseId: r.course_id,
          parentFolderId: r.parent_folder_id,
          folderPath: r.folder_path,
          type: r.type,
          title: r.title,
          url: r.url,
          localPath: r.local_path,
          sizeBytes: r.size_bytes,
          mimeType: r.mime_type,
          syncedAt: r.synced_at,
          source: 'resource' as const,
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          notificationId: a.notification_id,
          courseId: a.course_id,
          externalId: a.external_id,
          displayName: a.display_name,
          filename: a.filename,
          url: a.url,
          sizeBytes: a.size_bytes,
          contentType: a.content_type,
          localPath: a.local_path,
          downloadStatus: a.download_status,
          downloadedAt: a.downloaded_at,
          courseCode: a.course_code,
          courseName: a.course_name,
          notificationTitle: a.notification_title,
          source: 'attachment' as const,
        })),
        pages: [], // Excluded - course_pages redirect to Canvas, not local files
      };
    } catch (error) {
      logger.error(`Failed to get files: ${error}`);
      throw error;
    }
  });

  // Get announcements for a specific course
  ipcMain.handle('data:getCourseNotifications', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        source_type: string;
        source_id: string;
        course_id: number | null;
        title: string;
        message: string;
        message_html: string | null;
        published_at: string;
        dismissed_at: string | null;
        url: string | null;
      }>('SELECT * FROM notifications WHERE course_id = ? ORDER BY published_at DESC', [
        courseId,
      ]);

      return rows.map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        courseId: row.course_id,
        title: row.title,
        message: row.message,
        messageHtml: row.message_html,
        publishedAt: row.published_at,
        dismissedAt: row.dismissed_at,
        url: row.url,
      }));
    } catch (error) {
      logger.error(`Failed to get course notifications: ${error}`);
      throw error;
    }
  });

  // Get attachments for a notification
  ipcMain.handle('data:getAttachments', (_event, notificationId: number) => {
    try {
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
    } catch (error) {
      logger.error(`Failed to get attachments: ${error}`);
      throw error;
    }
  });

  // Get file references for a notification (with attachment details if linked)
  ipcMain.handle('data:getFileReferences', (_event, notificationId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        notification_id: number;
        attachment_id: number | null;
        start_position: number;
        end_position: number;
        matched_text: string;
        original_url: string | null;
        // Joined attachment fields
        att_id: number | null;
        att_external_id: string | null;
        att_display_name: string | null;
        att_filename: string | null;
        att_url: string | null;
        att_size_bytes: number | null;
        att_content_type: string | null;
        att_local_path: string | null;
        att_download_status: string | null;
        att_downloaded_at: string | null;
      }>(
        `SELECT
          fr.id, fr.notification_id, fr.attachment_id, fr.start_position, fr.end_position,
          fr.matched_text, fr.original_url,
          a.id as att_id, a.external_id as att_external_id, a.display_name as att_display_name,
          a.filename as att_filename, a.url as att_url, a.size_bytes as att_size_bytes,
          a.content_type as att_content_type, a.local_path as att_local_path,
          a.download_status as att_download_status, a.downloaded_at as att_downloaded_at
        FROM announcement_file_references fr
        LEFT JOIN notification_attachments a ON fr.attachment_id = a.id
        WHERE fr.notification_id = ?
        ORDER BY fr.start_position`,
        [notificationId]
      );

      return rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        attachmentId: row.attachment_id,
        startPosition: row.start_position,
        endPosition: row.end_position,
        matchedText: row.matched_text,
        originalUrl: row.original_url,
        attachment: row.att_id
          ? {
              id: row.att_id,
              notificationId: row.notification_id,
              externalId: row.att_external_id!,
              displayName: row.att_display_name!,
              filename: row.att_filename!,
              url: row.att_url!,
              sizeBytes: row.att_size_bytes,
              contentType: row.att_content_type,
              localPath: row.att_local_path,
              downloadStatus: row.att_download_status,
              downloadedAt: row.att_downloaded_at,
            }
          : undefined,
      }));
    } catch (error) {
      logger.error(`Failed to get file references: ${error}`);
      throw error;
    }
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
    }>('SELECT * FROM notification_attachments WHERE id = ?', [attachmentId]);

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

      const onComplete = (result: {
        id: string;
        success: boolean;
        localPath?: string;
        error?: string;
      }) => {
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
  ipcMain.handle('attachment:open', (_event, attachmentId: number) => {
    const attachment = database.executeReadOne<{
      local_path: string | null;
      url: string;
    }>('SELECT local_path, url FROM notification_attachments WHERE id = ?', [
      attachmentId,
    ]);

    logger.debug(
      `[attachment:open] Attachment: ${JSON.stringify({ attachmentId, localPath: attachment?.local_path, url: attachment?.url })}`
    );

    if (!attachment?.local_path) {
      logger.debug('[attachment:open] No local_path, file not downloaded');
      return { success: false, error: 'File not downloaded' };
    }

    // Verify the local path is actually a file path, not a URL
    if (
      attachment.local_path.startsWith('http://') ||
      attachment.local_path.startsWith('https://')
    ) {
      logger.error(
        `[attachment:open] local_path is a URL, not a file path: ${attachment.local_path}`
      );
      return {
        success: false,
        error: 'Invalid local path (URL stored instead of file path)',
      };
    }

    const fs = require('fs');

    // Check if file exists
    if (!fs.existsSync(attachment.local_path)) {
      logger.error(`[attachment:open] File does not exist: ${attachment.local_path}`);
      return { success: false, error: 'File not found on disk' };
    }

    // Use Electron's shell.openPath for cross-platform file opening
    const { shell } = require('electron');
    shell.openPath(attachment.local_path).then((error: string) => {
      if (error) {
        logger.error(`[attachment:open] Failed to open: ${error}`);
      }
    });

    logger.debug('[attachment:open] Opening file with default application');
    return { success: true };
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

  // Files directory handlers
  ipcMain.handle('files:getDirectory', () => {
    return { path: fileDownloadManager.getBaseDir() };
  });

  ipcMain.handle('files:openDirectory', () => {
    const { shell } = require('electron');
    const currentDir = fileDownloadManager.getBaseDir();

    // Ensure directory exists
    if (!fs.existsSync(currentDir)) {
      fs.mkdirSync(currentDir, { recursive: true });
    }

    shell.openPath(currentDir);
    return { success: true };
  });

  // Select a new download directory via system dialog
  ipcMain.handle('files:selectDirectory', async () => {
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Download Location',
      defaultPath: fileDownloadManager.getBaseDir(),
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Selection cancelled' };
    }

    const selectedPath = result.filePaths[0];
    return { success: true, data: { path: selectedPath } };
  });

  // Set the download directory (persists via localStorage on renderer side)
  ipcMain.handle('files:setDirectory', (_event, newPath: string) => {
    try {
      // Validate input
      if (!newPath || typeof newPath !== 'string') {
        return { success: false, error: 'Invalid path' };
      }

      // Normalize and resolve the path to prevent traversal attacks
      const resolvedPath = path.resolve(newPath);

      // Check for null bytes (path injection)
      if (newPath.includes('\0') || resolvedPath.includes('\0')) {
        logger.warn(`Rejected path with null byte: ${newPath}`);
        return { success: false, error: 'Invalid path characters' };
      }

      // Prevent setting to system-critical directories
      /* eslint-disable cross-platform/no-hardcoded-app-paths -- Fallbacks for system directories when env vars are not set */
      const criticalPaths = [
        process.env.SystemRoot || 'C:\\Windows',
        process.env.ProgramFiles || 'C:\\Program Files',
        process.env.ProgramData || 'C:\\ProgramData',
        '/etc',
        '/usr',
        '/bin',
        '/sbin',
        '/var',
        '/System',
      ].map((p) => path.resolve(p).toLowerCase());
      /* eslint-enable cross-platform/no-hardcoded-app-paths */

      const resolvedLower = resolvedPath.toLowerCase();
      for (const critical of criticalPaths) {
        if (resolvedLower === critical || resolvedLower.startsWith(critical + path.sep)) {
          logger.warn(
            `Rejected attempt to set files directory to system path: ${newPath}`
          );
          return { success: false, error: 'Cannot use system directory' };
        }
      }

      // Validate the path exists or can be created
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      }

      fileDownloadManager.updateBaseDir(resolvedPath);
      logger.info(`Download directory changed to: ${resolvedPath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to set download directory: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Save file with dialog
  ipcMain.handle(
    'file:save',
    async (
      _event,
      options: {
        defaultName: string;
        content: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }
    ) => {
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: options.defaultName,
        filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      try {
        fs.writeFileSync(result.filePath, options.content, 'utf-8');
        logger.info(`File saved: ${result.filePath}`);
        return { success: true, data: { filePath: result.filePath } };
      } catch (error) {
        logger.error(`Failed to save file: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Clear synced files data (resources and notification attachments)
  ipcMain.handle('files:clearSync', () => {
    logger.info('Clearing synced files data');
    try {
      database.transaction(() => {
        // Clear resources (Canvas files/folders)
        database.executeWrite('DELETE FROM resources', [], 'resources');
        // Clear notification attachments
        database.executeWrite(
          'DELETE FROM notification_attachments',
          [],
          'notification_attachments'
        );
        // Clear sync metadata for files/folders endpoints
        database.executeWrite(
          "DELETE FROM sync_metadata WHERE endpoint LIKE '%/files' OR endpoint LIKE '%/folders'",
          [],
          'sync_metadata'
        );
      });
      logger.info('Synced files data cleared successfully');
      return { success: true };
    } catch (error) {
      logger.error(`Failed to clear sync data: ${error}`);
      return { success: false, error: String(error) };
    }
  });

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
      database.executeWrite(
        'DELETE FROM policy_announcements',
        [],
        'policy_announcements'
      );
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
      database.executeWrite(
        'DELETE FROM pending_sync_conflicts',
        [],
        'pending_sync_conflicts'
      );
      database.executeWrite('DELETE FROM field_modifications', [], 'field_modifications');
    });

    // 2. Clear in-memory pending conflicts (database already cleared in transaction)
    if (syncEngine) {
      syncEngine.getConflictResolver().clearAllPendingConflicts();
      logger.info('Pending sync conflicts cleared from memory');
    }

    // 3. Delete all downloaded files
    if (fs.existsSync(FILES_DIR)) {
      try {
        fs.rmSync(FILES_DIR, { recursive: true, force: true });
        fs.mkdirSync(FILES_DIR, { recursive: true }); // Recreate empty directory
        logger.info('Downloaded files deleted');
      } catch (err) {
        logger.error(`Failed to delete files directory: ${err}`);
      }
    }

    // 3b. Reset window behavior settings (clear minimize-to-tray preference)
    const windowBehaviorPath = path.join(APP_DATA_DIR, 'window-behavior.json');
    if (fs.existsSync(windowBehaviorPath)) {
      try {
        fs.unlinkSync(windowBehaviorPath);
        logger.info('Window behavior settings reset');
      } catch (err) {
        logger.error(`Failed to delete window behavior settings: ${err}`);
      }
    }

    // 4. Delete credential and reset in-memory clients if requested
    if (deleteToken) {
      // Stop any ongoing sync operations first
      if (syncEngine) {
        await syncEngine.cancelPendingSync();
        syncEngine.stop();
        logger.info('Sync engine stopped');
      }

      // Stop background token validation
      credentialManager.stopBackgroundValidation();

      await credentialManager.delete();
      canvasClient = null;
      syncEngine = null;

      // Lock database to prevent any stray writes from in-flight operations
      database.lockWrites();
      logger.info('Canvas API token deleted, clients reset, and database locked');
    }

    // 5. Notify renderer to handle its side (clear localStorage, redirect to login)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:reset', {
        tokenDeleted: deleteToken,
        clearLocalStorage: deleteToken, // Clear all localStorage when token deleted
      });
    }

    logger.info(`App state reset complete (tokenDeleted: ${deleteToken})`);
    metricsCollector.increment('data.cleared');
  }

  // Clear all app data (optionally including Canvas API token)
  ipcMain.handle('data:clearAll', async (_event, options?: { deleteToken?: boolean }) => {
    const deleteToken = options?.deleteToken ?? false;
    logger.info(`Clearing all app data (deleteToken: ${deleteToken})`);
    try {
      await resetAppState({ deleteToken });
      return { success: true, tokenDeleted: deleteToken };
    } catch (error) {
      logger.error(`Failed to clear all data: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // ============ Course Pages Handlers ============

  // Get all pages for a course (wiki pages + syllabus)
  ipcMain.handle('pages:getByCourse', (_event, courseId: number) => {
    const pages = database.executeRead<{
      id: number;
      external_id: string | null;
      course_id: number;
      page_type: string;
      title: string;
      url_slug: string | null;
      body_html: string | null;
      body_text: string | null;
      is_front_page: number;
      published: number;
      last_synced_at: string | null;
    }>(
      'SELECT * FROM course_pages WHERE course_id = ? ORDER BY is_front_page DESC, title',
      [courseId]
    );

    // Also check if course has syllabus_body
    const course = database.executeRead<{
      id: number;
      code: string;
      name: string;
      syllabus_body: string | null;
    }>('SELECT id, code, name, syllabus_body FROM courses WHERE id = ?', [courseId])[0];

    const result = pages.map((p) => ({
      id: p.id,
      externalId: p.external_id,
      courseId: p.course_id,
      pageType: p.page_type,
      title: p.title,
      urlSlug: p.url_slug,
      bodyHtml: p.body_html,
      bodyText: p.body_text,
      isFrontPage: p.is_front_page === 1,
      published: p.published === 1,
      lastSyncedAt: p.last_synced_at,
    }));

    // Add syllabus as a virtual page if it exists
    if (course?.syllabus_body) {
      result.unshift({
        id: -1, // Virtual ID for syllabus
        externalId: `syllabus-${courseId}`,
        courseId: courseId,
        pageType: 'syllabus',
        title: 'Course Syllabus',
        urlSlug: 'syllabus',
        bodyHtml: course.syllabus_body,
        bodyText: course.syllabus_body
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        isFrontPage: false,
        published: true,
        lastSyncedAt: null,
      });
    }

    return result;
  });

  // Get a single page by ID
  ipcMain.handle('pages:get', (_event, pageId: number) => {
    // Handle virtual syllabus ID
    if (pageId === -1) {
      return { success: false, error: 'Use pages:getByCourse to get syllabus' };
    }

    const page = database.executeRead<{
      id: number;
      external_id: string | null;
      course_id: number;
      page_type: string;
      title: string;
      url_slug: string | null;
      body_html: string | null;
      body_text: string | null;
      is_front_page: number;
      published: number;
    }>('SELECT * FROM course_pages WHERE id = ?', [pageId])[0];

    if (!page) {
      return { success: false, error: 'Page not found' };
    }

    // Construct Canvas URL for the page
    let canvasUrl: string | null = null;
    if (canvasClient && page.url_slug) {
      const baseUrl = canvasClient.getBaseUrl();
      canvasUrl = `${baseUrl}/courses/${page.course_id}/pages/${page.url_slug}`;
    }

    return {
      success: true,
      data: {
        id: page.id,
        externalId: page.external_id,
        courseId: page.course_id,
        pageType: page.page_type,
        title: page.title,
        urlSlug: page.url_slug,
        bodyHtml: page.body_html,
        bodyText: page.body_text,
        isFrontPage: page.is_front_page === 1,
        published: page.published === 1,
        canvasUrl,
      },
    };
  });

  // Get Canvas URL for a resource (file or attachment)
  ipcMain.handle(
    'data:getResourceCanvasUrl',
    (_event, resourceId: number, source: 'resource' | 'attachment') => {
      try {
        if (!canvasClient) {
          return { success: false, error: 'Canvas client not connected' };
        }

        const baseUrl = canvasClient.getBaseUrl();

        if (source === 'resource') {
          // Get resource and its course's external_id
          const result = database.executeRead<{
            external_id: string;
            course_id: number;
          }>('SELECT external_id, course_id FROM resources WHERE id = ?', [resourceId]);

          if (!result[0]) {
            return { success: false, error: 'Resource not found' };
          }

          const resource = result[0];
          const course = database.executeReadOne<{ external_id: string }>(
            'SELECT external_id FROM courses WHERE id = ?',
            [resource.course_id]
          );

          if (!course) {
            return { success: false, error: 'Course not found' };
          }

          // Canvas file URL format: /courses/{course_id}/files/{file_id}
          const canvasUrl = `${baseUrl}/courses/${course.external_id}/files/${resource.external_id}`;
          return { success: true, data: { canvasUrl } };
        } else if (source === 'attachment') {
          // Get attachment and its course's external_id
          const result = database.executeRead<{
            external_id: string;
            course_id: number;
          }>('SELECT external_id, course_id FROM notification_attachments WHERE id = ?', [
            resourceId,
          ]);

          if (!result[0]) {
            return { success: false, error: 'Attachment not found' };
          }

          const attachment = result[0];
          const course = database.executeReadOne<{ external_id: string }>(
            'SELECT external_id FROM courses WHERE id = ?',
            [attachment.course_id]
          );

          if (!course) {
            return { success: false, error: 'Course not found' };
          }

          // Canvas file URL format: /courses/{course_id}/files/{file_id}
          const canvasUrl = `${baseUrl}/courses/${course.external_id}/files/${attachment.external_id}`;
          return { success: true, data: { canvasUrl } };
        }

        return { success: false, error: 'Invalid source type' };
      } catch (error) {
        logger.error('Failed to get resource Canvas URL:', error as Error);
        return { success: false, error: 'Failed to get Canvas URL' };
      }
    }
  );

  // Get Canvas URL for a task (assignment)
  ipcMain.handle('data:getTaskCanvasUrl', (_event, taskId: number) => {
    try {
      if (!canvasClient) {
        return { success: false, error: 'Canvas client not connected' };
      }

      const baseUrl = canvasClient.getBaseUrl();

      // Get task and its course's external_id
      const result = database.executeRead<{
        external_id: string;
        course_id: number;
      }>('SELECT external_id, course_id FROM tasks WHERE id = ?', [taskId]);

      if (!result[0]) {
        return { success: false, error: 'Task not found' };
      }

      const task = result[0];
      const course = database.executeReadOne<{ external_id: string }>(
        'SELECT external_id FROM courses WHERE id = ?',
        [task.course_id]
      );

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      // Canvas assignment URL format: /courses/{course_id}/assignments/{assignment_id}
      const canvasUrl = `${baseUrl}/courses/${course.external_id}/assignments/${task.external_id}`;
      return { success: true, data: { canvasUrl } };
    } catch (error) {
      logger.error('Failed to get task Canvas URL:', error as Error);
      return { success: false, error: 'Failed to get Canvas URL' };
    }
  });

  // Export page as HTML file (with proper HTML wrapper)
  ipcMain.handle(
    'pages:exportHtml',
    async (
      _event,
      options: {
        courseId: number;
        pageId: number; // -1 for syllabus
        title: string;
        bodyHtml: string;
      }
    ) => {
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      // Get course info for filename
      const course = database.executeRead<{ code: string }>(
        'SELECT code FROM courses WHERE id = ?',
        [options.courseId]
      )[0];

      const courseCode = course?.code || 'Unknown';
      const safeTitle = options.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
      const defaultName = `${courseCode}_${safeTitle}.html`;

      // Wrap body in full HTML document
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title} - ${courseCode}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
    h1, h2, h3 { color: #1e40af; }
    a { color: #2563eb; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f3f4f6; }
    pre, code { background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 4px; }
    pre { padding: 1rem; overflow-x: auto; }
    img { max-width: 100%; height: auto; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>${options.title}</h1>
  <p class="meta">Course: ${courseCode} | Exported: ${new Date().toLocaleDateString()}</p>
  <hr>
  ${options.bodyHtml}
</body>
</html>`;

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [
          { name: 'HTML Files', extensions: ['html', 'htm'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      try {
        fs.writeFileSync(result.filePath, fullHtml, 'utf-8');
        logger.info(`Page exported: ${result.filePath}`);
        return { success: true, data: { filePath: result.filePath } };
      } catch (error) {
        logger.error(`Failed to export page: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Batch export HTML content (saves to app files directory)
  ipcMain.handle(
    'html:exportBatch',
    async (
      _event,
      params: {
        courseId: number;
        items: Array<{
          sourceType: 'page' | 'assignment' | 'syllabus' | 'module' | 'announcement';
          sourceId: string;
          title: string;
          bodyHtml: string;
        }>;
      }
    ) => {
      // Get course info
      const course = database.executeRead<{ code: string; external_id: string }>(
        'SELECT code, external_id FROM courses WHERE id = ?',
        [params.courseId]
      )[0];

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      const courseCode = course.code.replace(/[^a-zA-Z0-9_-]/g, '_');
      const results: Array<{
        sourceType: string;
        sourceId: string;
        success: boolean;
        localPath?: string;
        error?: string;
      }> = [];

      for (const item of params.items) {
        try {
          // Create directory structure: files/{courseCode}/{sourceType}/
          const contextDir = path.join(
            FILES_DIR,
            courseCode,
            item.sourceType.charAt(0).toUpperCase() + item.sourceType.slice(1)
          );
          if (!fs.existsSync(contextDir)) {
            fs.mkdirSync(contextDir, { recursive: true });
          }

          // Generate safe filename
          const safeTitle = item.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const filename = `${safeTitle}.html`;
          const localPath = path.join(contextDir, filename);

          // Generate styled HTML
          const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title} - ${course.code}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
    h1, h2, h3 { color: #1e40af; }
    a { color: #2563eb; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f3f4f6; }
    pre, code { background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 4px; }
    pre { padding: 1rem; overflow-x: auto; }
    img { max-width: 100%; height: auto; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>${item.title}</h1>
  <p class="meta">Course: ${course.code} | Type: ${item.sourceType} | Exported: ${new Date().toLocaleDateString()}</p>
  <hr>
  ${item.bodyHtml}
</body>
</html>`;

          fs.writeFileSync(localPath, fullHtml, 'utf-8');

          // Compute content hash for change detection
          const contentHash = crypto
            .createHash('md5')
            .update(item.bodyHtml)
            .digest('hex');

          // Update html_exports table
          database.executeWrite(
            `INSERT INTO html_exports (course_id, source_type, source_id, title, content_hash, local_path, exported_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(course_id, source_type, source_id) DO UPDATE SET
               title = excluded.title,
               content_hash = excluded.content_hash,
               local_path = excluded.local_path,
               exported_at = CURRENT_TIMESTAMP`,
            [
              params.courseId,
              item.sourceType,
              item.sourceId,
              item.title,
              contentHash,
              localPath,
            ],
            'html_exports'
          );

          results.push({
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            success: true,
            localPath,
          });

          logger.debug(`HTML exported: ${localPath}`);
        } catch (error) {
          results.push({
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          logger.error(
            `Failed to export HTML ${item.sourceType}/${item.sourceId}: ${error}`
          );
        }
      }

      const successCount = results.filter((r) => r.success).length;
      logger.info(
        `Batch HTML export: ${successCount}/${params.items.length} items exported for course ${course.code}`
      );

      return {
        success: results.every((r) => r.success),
        data: {
          exported: successCount,
          total: params.items.length,
          results,
        },
      };
    }
  );

  // ============ Imported Calendar Handlers ============

  // Get all imported calendars
  ipcMain.handle('calendar:getImportedCalendars', () => {
    const rows = database.executeRead<{
      id: number;
      name: string;
      filename: string;
      file_hash: string | null;
      color: string;
      event_count: number;
      is_visible: number;
      imported_at: string;
      updated_at: string;
    }>('SELECT * FROM imported_calendars ORDER BY name');

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      filename: row.filename,
      fileHash: row.file_hash,
      color: row.color,
      eventCount: row.event_count,
      isVisible: Boolean(row.is_visible),
      importedAt: row.imported_at,
      updatedAt: row.updated_at,
    }));
  });

  // Parse ICS for preview (without importing)
  ipcMain.handle(
    'calendar:parseICSPreview',
    (_event, content: string, filename: string) => {
      const parser = new ICSParser();
      return parser.createPreview(content, filename);
    }
  );

  // Import ICS calendar
  ipcMain.handle(
    'calendar:importICS',
    async (
      _event,
      params: {
        content: string;
        filename: string;
        name?: string;
        color?: string;
      }
    ) => {
      try {
        const parser = new ICSParser();
        const result = parser.parse(params.content);

        // Generate file hash for duplicate detection
        const fileHash = crypto.createHash('md5').update(params.content).digest('hex');

        // Check if already imported
        const existing = database.executeReadOne<{ id: number }>(
          'SELECT id FROM imported_calendars WHERE file_hash = ?',
          [fileHash]
        );

        if (existing) {
          return { success: false, error: 'This calendar has already been imported' };
        }

        const calendarName =
          params.name || result.calendarName || params.filename.replace(/\.ics$/i, '');
        const color = params.color || '#6366F1';

        let calendarId: number = 0;
        let eventCount = 0;

        database.transaction(() => {
          // Insert calendar record
          const insertResult = database.executeWrite(
            `INSERT INTO imported_calendars (name, filename, file_hash, color, event_count) VALUES (?, ?, ?, ?, 0)`,
            [calendarName, params.filename, fileHash, color],
            'imported_calendars'
          );
          calendarId = insertResult.lastInsertRowid as number;

          // Insert events
          for (const event of result.events) {
            if (!event.dtstart) continue;

            database.executeWrite(
              `INSERT INTO calendar_events (
              imported_calendar_id, source_type, title, description,
              start_at, end_at, all_day, location, uid,
              recurrence_rule, recurrence_exception_dates
            ) VALUES (?, 'imported', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                calendarId,
                event.summary,
                event.description,
                event.dtstart.toISOString(),
                event.dtend?.toISOString() || null,
                event.allDay ? 1 : 0,
                event.location,
                event.uid,
                event.rrule,
                event.exdates ? JSON.stringify(event.exdates) : null,
              ],
              'calendar_events'
            );
            eventCount++;
          }

          // Update event count
          database.executeWrite(
            'UPDATE imported_calendars SET event_count = ? WHERE id = ?',
            [eventCount, calendarId],
            'imported_calendars'
          );
        });

        logger.info(
          `Imported calendar "${calendarName}" with ${eventCount} events (ID: ${calendarId})`
        );

        // Verify events were inserted
        const verifyCount = database.executeReadOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM calendar_events WHERE imported_calendar_id = ?',
          [calendarId]
        );
        logger.debug(
          `[Calendar] Verification: ${verifyCount?.count || 0} events in DB for calendar ${calendarId}`
        );

        return { success: true, data: { calendarId, eventCount } };
      } catch (error) {
        logger.error(`Failed to import ICS: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete imported calendar (CASCADE deletes events)
  ipcMain.handle('calendar:deleteCalendar', async (_event, calendarId: number) => {
    try {
      // Get calendar name for logging
      const calendar = database.executeReadOne<{ name: string }>(
        'SELECT name FROM imported_calendars WHERE id = ?',
        [calendarId]
      );

      if (!calendar) {
        return { success: false, error: 'Calendar not found' };
      }

      database.transaction(() => {
        // Delete events first (SQLite may not have CASCADE working via ALTER)
        database.executeWrite(
          'DELETE FROM calendar_events WHERE imported_calendar_id = ?',
          [calendarId],
          'calendar_events'
        );
        // Delete calendar
        database.executeWrite(
          'DELETE FROM imported_calendars WHERE id = ?',
          [calendarId],
          'imported_calendars'
        );
      });

      logger.info(`Deleted imported calendar: ${calendar.name}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete calendar: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Toggle calendar visibility
  ipcMain.handle(
    'calendar:toggleVisibility',
    async (_event, calendarId: number, isVisible: boolean) => {
      try {
        database.executeWrite(
          'UPDATE imported_calendars SET is_visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [isVisible ? 1 : 0, calendarId],
          'imported_calendars'
        );
        return { success: true };
      } catch (error) {
        logger.error(`Failed to toggle calendar visibility: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Update calendar metadata
  ipcMain.handle(
    'calendar:updateCalendar',
    async (
      _event,
      calendarId: number,
      updates: {
        name?: string;
        color?: string;
      }
    ) => {
      try {
        const setClauses: string[] = [];
        const values: unknown[] = [];

        if (updates.name !== undefined) {
          setClauses.push('name = ?');
          values.push(updates.name);
        }
        if (updates.color !== undefined) {
          setClauses.push('color = ?');
          values.push(updates.color);
        }

        if (setClauses.length === 0) {
          return { success: true };
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(calendarId);

        database.executeWrite(
          `UPDATE imported_calendars SET ${setClauses.join(', ')} WHERE id = ?`,
          values,
          'imported_calendars'
        );
        return { success: true };
      } catch (error) {
        logger.error(`Failed to update calendar: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Get calendar events for a date range (with RRULE expansion)
  ipcMain.handle(
    'calendar:getEventsForRange',
    async (
      _event,
      params: {
        startDate: string;
        endDate: string;
        includeHidden?: boolean;
      }
    ) => {
      try {
        const rangeStart = new Date(params.startDate);
        const rangeEnd = new Date(params.endDate);

        logger.debug(
          `[Calendar] Fetching events for range: ${params.startDate} to ${params.endDate}`
        );

        // First check how many events exist
        const countResult = database.executeReadOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM calendar_events WHERE source_type IN (?, ?) AND deleted_at IS NULL',
          ['imported', 'user']
        );
        logger.debug(
          `[Calendar] Total calendar events in DB: ${countResult?.count || 0}`
        );

        // Build query based on includeHidden flag - include both 'imported' and 'user' events
        let sql = `
        SELECT ce.*, ic.name as calendar_name, ic.color as calendar_color, ic.is_visible
        FROM calendar_events ce
        LEFT JOIN imported_calendars ic ON ce.imported_calendar_id = ic.id
        WHERE ce.source_type IN ('imported', 'user')
          AND ce.deleted_at IS NULL
      `;

        if (!params.includeHidden) {
          sql +=
            " AND (ic.is_visible = 1 OR ic.is_visible IS NULL OR ce.source_type = 'user')";
        }

        const rows = database.executeRead<{
          id: number;
          external_id: string | null;
          source_type: string;
          course_id: number | null;
          imported_calendar_id: number | null;
          title: string;
          description: string | null;
          start_at: string;
          end_at: string | null;
          all_day: number;
          location: string | null;
          uid: string | null;
          recurrence_rule: string | null;
          recurrence_exception_dates: string | null;
          parent_event_id: number | null;
          calendar_name: string | null;
          calendar_color: string | null;
        }>(sql);

        // Map to CalendarEventRecord format
        const events = rows.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          sourceType: row.source_type as 'canvas' | 'user' | 'imported',
          courseId: row.course_id,
          importedCalendarId: row.imported_calendar_id,
          title: row.title,
          description: row.description,
          startAt: row.start_at,
          endAt: row.end_at,
          allDay: Boolean(row.all_day),
          location: row.location,
          uid: row.uid,
          recurrenceRule: row.recurrence_rule,
          recurrenceExceptionDates: row.recurrence_exception_dates,
          parentEventId: row.parent_event_id,
          calendarName: row.calendar_name,
          color: row.calendar_color || '#6366F1',
        }));

        logger.debug(`[Calendar] Query returned ${rows.length} rows`);
        if (rows.length > 0) {
          logger.debug(`[Calendar] First event: ${JSON.stringify(rows[0])}`);
        }

        logger.debug(`[Calendar] Mapped ${events.length} events`);

        // Expand recurring events
        const expander = new RRuleExpander();
        const expandedEvents = expander.expandAll(events, rangeStart, rangeEnd);

        logger.debug(`[Calendar] After expansion: ${expandedEvents.length} events`);

        // Add color and calendar name to expanded events
        const result = expandedEvents.map((e) => ({
          ...e,
          color: (e as (typeof events)[0]).color || '#6366F1',
          calendarName: (e as (typeof events)[0]).calendarName,
        }));

        logger.debug(`[Calendar] Returning ${result.length} events to renderer`);
        return result;
      } catch (error) {
        logger.error(`Failed to get calendar events: ${error}`);
        return [];
      }
    }
  );

  // Create user calendar event
  ipcMain.handle(
    'calendar:createEvent',
    async (
      _event,
      data: {
        title: string;
        description?: string;
        startAt: string;
        endAt?: string;
        allDay: boolean;
        location?: string;
        courseId?: number;
      }
    ) => {
      try {
        // Generate a UID for ICS compatibility
        const uid = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@cid`;

        const result = database.executeWrite(
          `INSERT INTO calendar_events (
          source_type, course_id, title, description, start_at, end_at,
          all_day, location, uid, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            'user',
            data.courseId || null,
            data.title,
            data.description || null,
            data.startAt,
            data.endAt || null,
            data.allDay ? 1 : 0,
            data.location || null,
            uid,
          ],
          'calendar_events'
        );

        const eventId = result.lastInsertRowid as number;
        logger.info(`Created user calendar event: ${data.title} (id=${eventId})`);

        return { success: true, data: { id: eventId } };
      } catch (error) {
        logger.error(`Failed to create calendar event: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Update calendar event (user or imported only)
  ipcMain.handle(
    'calendar:updateEvent',
    async (
      _event,
      id: number,
      data: {
        title?: string;
        description?: string;
        startAt?: string;
        endAt?: string;
        allDay?: boolean;
        location?: string;
      }
    ) => {
      try {
        // Verify event exists and is editable (user or imported)
        const existing = database.executeReadOne<{ source_type: string }>(
          'SELECT source_type FROM calendar_events WHERE id = ? AND deleted_at IS NULL',
          [id]
        );

        if (!existing) {
          return { success: false, error: 'Event not found' };
        }

        if (existing.source_type === 'canvas') {
          return { success: false, error: 'Cannot edit Canvas events' };
        }

        const setClauses: string[] = [];
        const values: unknown[] = [];

        if (data.title !== undefined) {
          setClauses.push('title = ?');
          values.push(data.title);
        }
        if (data.description !== undefined) {
          setClauses.push('description = ?');
          values.push(data.description);
        }
        if (data.startAt !== undefined) {
          setClauses.push('start_at = ?');
          values.push(data.startAt);
        }
        if (data.endAt !== undefined) {
          setClauses.push('end_at = ?');
          values.push(data.endAt);
        }
        if (data.allDay !== undefined) {
          setClauses.push('all_day = ?');
          values.push(data.allDay ? 1 : 0);
        }
        if (data.location !== undefined) {
          setClauses.push('location = ?');
          values.push(data.location);
        }

        if (setClauses.length === 0) {
          return { success: true };
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        database.executeWrite(
          `UPDATE calendar_events SET ${setClauses.join(', ')} WHERE id = ?`,
          values,
          'calendar_events'
        );

        logger.info(`Updated calendar event id=${id}`);
        return { success: true };
      } catch (error) {
        logger.error(`Failed to update calendar event: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete calendar event (soft delete)
  ipcMain.handle('calendar:deleteEvent', async (_event, id: number) => {
    try {
      // Verify event exists
      const existing = database.executeReadOne<{
        source_type: string;
        imported_calendar_id: number | null;
        title: string;
      }>(
        'SELECT source_type, imported_calendar_id, title FROM calendar_events WHERE id = ? AND deleted_at IS NULL',
        [id]
      );

      if (!existing) {
        return { success: false, error: 'Event not found' };
      }

      if (existing.source_type === 'canvas') {
        return { success: false, error: 'Cannot delete Canvas events' };
      }

      // Soft delete the event
      database.executeWrite(
        'UPDATE calendar_events SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id],
        'calendar_events'
      );

      // Update event count on parent imported calendar if applicable
      if (existing.imported_calendar_id) {
        database.executeWrite(
          'UPDATE imported_calendars SET event_count = event_count - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [existing.imported_calendar_id],
          'imported_calendars'
        );
      }

      logger.info(`Deleted calendar event: ${existing.title} (id=${id})`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete calendar event: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Batch export calendars to ICS
  ipcMain.handle(
    'calendar:exportBatch',
    async (
      _event,
      options: {
        mode: 'all' | 'selected';
        calendarIds?: number[];
        courseIds?: number[];
        includeUserEvents?: boolean;
        consolidate?: boolean;
        dateRange?: { start: string; end: string };
      }
    ) => {
      try {
        const vevents: string[] = [];
        const calendarName = 'Canvas Integration Dashboard Export';

        // Helper to format date for ICS
        const formatICSDate = (dateStr: string, allDay: boolean): string => {
          const date = new Date(dateStr);
          if (allDay) {
            // All-day events use DATE format (YYYYMMDD)
            return date.toISOString().slice(0, 10).replace(/-/g, '');
          }
          // Regular events use DATETIME format (YYYYMMDDTHHMMSSZ)
          return date
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}/, '');
        };

        // Helper to escape ICS text
        const escapeICS = (text: string | null | undefined): string => {
          if (!text) return '';
          // Escape special ICS characters (backslash, semicolon, comma, newline)
          /* eslint-disable cross-platform/no-hardcoded-path-separator -- ICS text escaping, not path */
          return text
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
          /* eslint-enable cross-platform/no-hardcoded-path-separator */
        };

        // Build date range filter
        let dateFilter = '';
        const dateParams: string[] = [];
        if (options.dateRange) {
          dateFilter = ' AND start_at >= ? AND start_at <= ?';
          dateParams.push(options.dateRange.start, options.dateRange.end);
        }

        // Collect events based on mode
        if (options.mode === 'all' || options.includeUserEvents) {
          // Get user-created events
          const userEvents = database.executeRead<{
            id: number;
            title: string;
            description: string | null;
            start_at: string;
            end_at: string | null;
            all_day: number;
            location: string | null;
            uid: string | null;
          }>(
            `SELECT id, title, description, start_at, end_at, all_day, location, uid
           FROM calendar_events
           WHERE source_type = 'user' AND deleted_at IS NULL${dateFilter}`,
            dateParams
          );

          for (const evt of userEvents) {
            const uid = evt.uid || `user-${evt.id}@cid`;
            const lines = [
              'BEGIN:VEVENT',
              `UID:${uid}`,
              `DTSTAMP:${formatICSDate(new Date().toISOString(), false)}`,
            ];

            if (evt.all_day) {
              lines.push(`DTSTART;VALUE=DATE:${formatICSDate(evt.start_at, true)}`);
              if (evt.end_at) {
                lines.push(`DTEND;VALUE=DATE:${formatICSDate(evt.end_at, true)}`);
              }
            } else {
              lines.push(`DTSTART:${formatICSDate(evt.start_at, false)}`);
              if (evt.end_at) {
                lines.push(`DTEND:${formatICSDate(evt.end_at, false)}`);
              }
            }

            lines.push(`SUMMARY:${escapeICS(evt.title)}`);
            if (evt.description) lines.push(`DESCRIPTION:${escapeICS(evt.description)}`);
            if (evt.location) lines.push(`LOCATION:${escapeICS(evt.location)}`);
            lines.push('END:VEVENT');

            vevents.push(lines.join('\r\n'));
          }
        }

        // Get imported calendar events
        if (
          options.mode === 'all' ||
          (options.calendarIds && options.calendarIds.length > 0)
        ) {
          let calendarFilter = '';
          const params: (string | number)[] = [...dateParams];

          if (options.mode === 'selected' && options.calendarIds) {
            const placeholders = options.calendarIds.map(() => '?').join(',');
            calendarFilter = ` AND imported_calendar_id IN (${placeholders})`;
            params.push(...options.calendarIds);
          }

          const importedEvents = database.executeRead<{
            id: number;
            title: string;
            description: string | null;
            start_at: string;
            end_at: string | null;
            all_day: number;
            location: string | null;
            uid: string | null;
            recurrence_rule: string | null;
          }>(
            `SELECT id, title, description, start_at, end_at, all_day, location, uid, recurrence_rule
           FROM calendar_events
           WHERE source_type = 'imported' AND deleted_at IS NULL${dateFilter}${calendarFilter}`,
            params
          );

          for (const evt of importedEvents) {
            const uid = evt.uid || `imported-${evt.id}@cid`;
            const lines = [
              'BEGIN:VEVENT',
              `UID:${uid}`,
              `DTSTAMP:${formatICSDate(new Date().toISOString(), false)}`,
            ];

            if (evt.all_day) {
              lines.push(`DTSTART;VALUE=DATE:${formatICSDate(evt.start_at, true)}`);
              if (evt.end_at) {
                lines.push(`DTEND;VALUE=DATE:${formatICSDate(evt.end_at, true)}`);
              }
            } else {
              lines.push(`DTSTART:${formatICSDate(evt.start_at, false)}`);
              if (evt.end_at) {
                lines.push(`DTEND:${formatICSDate(evt.end_at, false)}`);
              }
            }

            lines.push(`SUMMARY:${escapeICS(evt.title)}`);
            if (evt.description) lines.push(`DESCRIPTION:${escapeICS(evt.description)}`);
            if (evt.location) lines.push(`LOCATION:${escapeICS(evt.location)}`);
            if (evt.recurrence_rule) lines.push(`RRULE:${evt.recurrence_rule}`);
            lines.push('END:VEVENT');

            vevents.push(lines.join('\r\n'));
          }
        }

        // Get course tasks as events
        if (
          options.mode === 'all' ||
          (options.courseIds && options.courseIds.length > 0)
        ) {
          let courseFilter = '';
          const params: (string | number)[] = [...dateParams];

          if (options.mode === 'selected' && options.courseIds) {
            const placeholders = options.courseIds.map(() => '?').join(',');
            courseFilter = ` AND t.course_id IN (${placeholders})`;
            params.push(...options.courseIds);
          }

          const tasks = database.executeRead<{
            id: number;
            title: string;
            description: string | null;
            due_at: string;
            course_code: string;
            task_type: string | null;
            weight: number;
          }>(
            `SELECT t.id, t.title, t.description, t.due_at, c.code as course_code, t.task_type, t.weight
           FROM tasks t
           JOIN courses c ON t.course_id = c.id
           WHERE t.due_at IS NOT NULL${dateFilter ? dateFilter.replace('start_at', 't.due_at') : ''}${courseFilter}`,
            params
          );

          for (const task of tasks) {
            const uid = `task-${task.id}@cid`;
            const dueDate = new Date(task.due_at);
            const endDate = new Date(dueDate.getTime() + 60 * 60 * 1000); // 1 hour duration

            const description = [
              `Course: ${task.course_code}`,
              task.task_type ? `Type: ${task.task_type}` : null,
              task.weight > 0 ? `Weight: ${task.weight}%` : null,
              task.description,
            ]
              .filter(Boolean)
              .join('\\n');

            const lines = [
              'BEGIN:VEVENT',
              `UID:${uid}`,
              `DTSTAMP:${formatICSDate(new Date().toISOString(), false)}`,
              `DTSTART:${formatICSDate(task.due_at, false)}`,
              `DTEND:${formatICSDate(endDate.toISOString(), false)}`,
              `SUMMARY:${escapeICS(task.title)}`,
              `DESCRIPTION:${escapeICS(description)}`,
              `CATEGORIES:${escapeICS(task.course_code)}`,
              'END:VEVENT',
            ];

            vevents.push(lines.join('\r\n'));
          }
        }

        // Build final ICS content
        const icsContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Canvas Integration Dashboard//EN',
          `X-WR-CALNAME:${escapeICS(calendarName)}`,
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          ...vevents,
          'END:VCALENDAR',
        ].join('\r\n');

        logger.info(`Exported ${vevents.length} events to ICS`);
        return {
          success: true,
          data: { content: icsContent, eventCount: vevents.length },
        };
      } catch (error) {
        logger.error(`Failed to export calendars: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Resource (Canvas file) handlers
  ipcMain.handle('resource:download', async (_event, resourceId: number) => {
    const resource = database.executeReadOne<{
      id: number;
      course_id: number;
      external_id: string;
      title: string;
      url: string | null;
    }>('SELECT * FROM resources WHERE id = ?', [resourceId]);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Handle HTML content items (pages, assignments, announcements)
    if (resource.external_id.startsWith('html-') && syncEngine?.['htmlContentSync']) {
      const htmlSync = syncEngine[
        'htmlContentSync'
      ] as import('./layers/l2-daemon/HtmlContentSync').HtmlContentSync;
      const result = await htmlSync.downloadHtmlItem(resource.external_id, FILES_DIR);
      if (result.success) {
        metricsCollector.increment('resource.download.html.success');
      } else {
        metricsCollector.increment('resource.download.html.failure');
      }
      return result;
    }

    if (!resource.url) {
      return { success: false, error: 'Resource has no download URL' };
    }

    // Get course code for folder organization
    const course = database.executeReadOne<{ code: string }>(
      'SELECT code FROM courses WHERE id = ?',
      [resource.course_id]
    );

    const courseCode = course?.code || 'unknown';

    // Get auth token for Canvas download
    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials available' };
    }

    // Queue the download
    return new Promise((resolve) => {
      const downloadId = `resource-${resourceId}`;

      const onComplete = (result: {
        id: string;
        success: boolean;
        localPath?: string;
        error?: string;
      }) => {
        if (result.id !== downloadId) return;

        fileDownloadManager.off('download-complete', onComplete);
        fileDownloadManager.off('download-error', onComplete);

        if (result.success && result.localPath) {
          // Update database with local path
          database.executeWrite(
            'UPDATE resources SET local_path = ?, synced_at = ? WHERE id = ?',
            [result.localPath, new Date().toISOString(), resourceId],
            'resources'
          );
          metricsCollector.increment('resource.download.success');
          resolve({ success: true, localPath: result.localPath });
        } else {
          metricsCollector.increment('resource.download.failure');
          resolve({ success: false, error: result.error || 'Download failed' });
        }
      };

      fileDownloadManager.on('download-complete', onComplete);
      fileDownloadManager.on('download-error', onComplete);

      fileDownloadManager.queueDownload({
        id: downloadId,
        url: resource.url!, // Already checked for null above
        courseCode,
        filename: resource.title,
        authToken: token,
      });
    });
  });

  ipcMain.handle('resource:open', (_event, resourceId: number) => {
    logger.debug(`[resource:open] START resourceId=${resourceId}`);
    const resource = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM resources WHERE id = ?',
      [resourceId]
    );

    if (!resource?.local_path) {
      logger.debug('[resource:open] No local_path');
      return { success: false, error: 'File not downloaded' };
    }

    // Check if file actually exists on disk
    if (!fs.existsSync(resource.local_path)) {
      logger.warn(
        `[resource:open] File not found on disk, clearing local_path: ${resource.local_path}`
      );
      // Clear the local_path since file was deleted
      database.executeWrite(
        'UPDATE resources SET local_path = NULL WHERE id = ?',
        [resourceId],
        'resources'
      );
      return { success: false, error: 'File was deleted from disk. Please re-download.' };
    }

    logger.debug(`[resource:open] Opening: ${resource.local_path}`);

    // Check if it's an HTML file - open in Electron to support canvas-file:// protocol
    const ext = path.extname(resource.local_path).toLowerCase();
    logger.info(`[resource:open] File extension: "${ext}", path: ${resource.local_path}`);

    if (ext === '.html' || ext === '.htm') {
      logger.info(
        `[resource:open] Detected HTML file, opening in Electron BrowserWindow`
      );
      // Open HTML in a new Electron window to support canvas-file:// protocol
      const htmlWindow = new BrowserWindow({
        width: 900,
        height: 700,
        title: path.basename(resource.local_path),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      htmlWindow.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription) => {
          logger.error(
            `[resource:open] HTML window failed to load: ${errorCode} - ${errorDescription}`
          );
        }
      );

      htmlWindow.webContents.on('did-finish-load', () => {
        logger.info(`[resource:open] HTML window finished loading`);
      });

      htmlWindow.loadFile(resource.local_path);
      logger.info(`[resource:open] Called loadFile for HTML window`);
      return { success: true };
    } else {
      logger.info(
        `[resource:open] Not an HTML file (ext="${ext}"), will use shell.openPath`
      );
    }

    // Use Electron's shell.openPath for other file types
    const { shell } = require('electron');
    shell.openPath(resource.local_path).then((error: string) => {
      if (error) {
        logger.error(`[resource:open] Failed to open: ${error}`);
      }
    });

    logger.debug('[resource:open] Opening file with default application');
    return { success: true };
  });

  ipcMain.handle('resource:showInFolder', (_event, resourceId: number) => {
    const resource = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM resources WHERE id = ?',
      [resourceId]
    );

    if (!resource?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    // Check if file actually exists on disk
    if (!fs.existsSync(resource.local_path)) {
      logger.warn(
        `[resource:showInFolder] File not found on disk, clearing local_path: ${resource.local_path}`
      );
      // Clear the local_path since file was deleted
      database.executeWrite(
        'UPDATE resources SET local_path = NULL WHERE id = ?',
        [resourceId],
        'resources'
      );
      return { success: false, error: 'File was deleted from disk. Please re-download.' };
    }

    const { shell } = require('electron');
    shell.showItemInFolder(resource.local_path);
    return { success: true };
  });

  // Delete local copy of a resource
  ipcMain.handle('resource:deleteLocal', (_event, resourceId: number) => {
    logger.debug(`[resource:deleteLocal] START resourceId=${resourceId}`);

    const resource = database.executeReadOne<{
      local_path: string | null;
      external_id: string;
    }>('SELECT local_path, external_id FROM resources WHERE id = ?', [resourceId]);

    if (!resource?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    try {
      // Delete the file from disk
      if (fs.existsSync(resource.local_path)) {
        fs.unlinkSync(resource.local_path);
        logger.info(`[resource:deleteLocal] Deleted file: ${resource.local_path}`);
      }

      // Clear local_path in database
      database.executeWrite(
        'UPDATE resources SET local_path = NULL WHERE id = ?',
        [resourceId],
        'resources'
      );

      // Notify renderer of the deletion
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'deleted',
          resourceId,
          externalId: resource.external_id,
          path: resource.local_path,
        });
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[resource:deleteLocal] Failed: ${message}`);
      return { success: false, error: message };
    }
  });

  // L4 Command handlers
  ipcMain.handle(
    'command:dispatch',
    async (_event, commandName: string, params: unknown) => {
      if (!commandDispatcher) {
        return { success: false, error: 'Command dispatcher not initialized' };
      }

      // Validate command name against registered commands (security: prevent arbitrary command injection)
      const registeredCommands = commandDispatcher.getRegisteredCommands();
      if (!registeredCommands.includes(commandName)) {
        logger.warn(`Rejected unknown command: ${commandName}`);
        metricsCollector.increment('command.rejected.unknown');
        return { success: false, error: `Unknown command: ${commandName}` };
      }

      const result = await commandDispatcher.dispatch(
        commandName as Parameters<typeof commandDispatcher.dispatch>[0],
        params
      );
      if (result.success) {
        metricsCollector.increment(`command.${commandName}.success`);
      } else {
        metricsCollector.increment(`command.${commandName}.failure`);
      }
      return result;
    }
  );

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

  // ============ Priority Handlers ============

  ipcMain.handle('priorities:calculate', () => {
    if (!priorityOrchestrator) {
      return { success: false, error: 'Priority system not initialized' };
    }
    try {
      const result = priorityOrchestrator.calculateAll();
      return { success: true, data: result };
    } catch (error) {
      logger.error('Priority calculation failed', error as Error);
      return { success: false, error: 'Priority calculation failed' };
    }
  });

  ipcMain.handle('priorities:refresh', () => {
    if (!priorityOrchestrator) {
      return { success: false, error: 'Priority system not initialized' };
    }
    try {
      priorityOrchestrator.calculateAll();
      return { success: true };
    } catch (error) {
      logger.error('Priority refresh failed', error as Error);
      return { success: false, error: 'Priority refresh failed' };
    }
  });

  ipcMain.handle('priorities:getExplanation', (_event, params: { taskId: number }) => {
    if (!priorityOrchestrator) {
      return { success: false, error: 'Priority system not initialized' };
    }
    try {
      const explanation = priorityOrchestrator.getExplanation(params.taskId);
      if (!explanation) {
        return { success: false, error: 'Task not found' };
      }
      return { success: true, data: explanation };
    } catch (error) {
      logger.error('Failed to get priority explanation', error as Error);
      return { success: false, error: 'Failed to get priority explanation' };
    }
  });

  // Recalculate priorities when relevant tables change
  database.on('commit', (tableName: string) => {
    if (['tasks', 'courses', 'course_policies', 'grace_tokens'].includes(tableName)) {
      // Debounce recalculation to avoid excessive computation
      setTimeout(() => {
        if (!priorityOrchestrator) return;
        try {
          priorityOrchestrator.calculateAll();
        } catch (error) {
          logger.error('Auto priority recalculation failed', error as Error);
        }
      }, 500);
    }
  });

  // ============ Intelligence - Recommendations ============

  ipcMain.handle('intelligence:getActiveRecommendations', () => {
    if (!recommendationOrchestrator) {
      return [];
    }
    try {
      const recommendations = recommendationOrchestrator.getActiveRecommendations();
      return recommendations.map((r) => ({
        ...r,
        validFrom: r.validFrom.toISOString(),
        validUntil: r.validUntil.toISOString(),
        dismissedAt: r.dismissedAt?.toISOString() ?? null,
        actedOnAt: r.actedOnAt?.toISOString() ?? null,
        createdAt: r.createdAt?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to get active recommendations', error as Error);
      return [];
    }
  });

  ipcMain.handle(
    'intelligence:generateRecommendations',
    (_event, params?: { availableMinutes?: number }) => {
      if (!recommendationOrchestrator) {
        return [];
      }
      try {
        const recommendations = recommendationOrchestrator.generateRecommendations(
          params?.availableMinutes
        );
        return recommendations.map((r) => ({
          ...r,
          validFrom: r.validFrom.toISOString(),
          validUntil: r.validUntil.toISOString(),
          dismissedAt: r.dismissedAt?.toISOString() ?? null,
          actedOnAt: r.actedOnAt?.toISOString() ?? null,
          createdAt: r.createdAt?.toISOString(),
        }));
      } catch (error) {
        logger.error('Failed to generate recommendations', error as Error);
        return [];
      }
    }
  );

  ipcMain.handle(
    'intelligence:dismissRecommendation',
    (_event, recommendationId: number) => {
      if (!recommendationOrchestrator) {
        return { success: false, error: 'Recommendation system not initialized' };
      }
      try {
        const dismissed =
          recommendationOrchestrator.dismissRecommendation(recommendationId);
        return { success: dismissed };
      } catch (error) {
        logger.error('Failed to dismiss recommendation', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'intelligence:actOnRecommendation',
    (_event, recommendationId: number) => {
      if (!recommendationOrchestrator) {
        return { success: false, error: 'Recommendation system not initialized' };
      }
      try {
        const acted =
          recommendationOrchestrator.markRecommendationActed(recommendationId);
        return { success: acted };
      } catch (error) {
        logger.error('Failed to mark recommendation as acted', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('intelligence:getRecommendationStats', () => {
    if (!recommendationOrchestrator) {
      return { totalGenerated: 0, totalDismissed: 0, totalActedOn: 0, activeCount: 0 };
    }
    try {
      return recommendationOrchestrator.getStatistics();
    } catch (error) {
      logger.error('Failed to get recommendation stats', error as Error);
      return { totalGenerated: 0, totalDismissed: 0, totalActedOn: 0, activeCount: 0 };
    }
  });

  // ============ Intelligence - Insights ============

  ipcMain.handle('intelligence:getActiveInsights', () => {
    if (!insightOrchestrator) {
      return [];
    }
    try {
      const insights = insightOrchestrator.getActiveInsights();
      return insights.map((i) => ({
        ...i,
        acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        createdAt: i.createdAt?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to get active insights', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:generateInsights', () => {
    if (!insightOrchestrator) {
      return [];
    }
    try {
      const insights = insightOrchestrator.generateInsights();
      return insights.map((i) => ({
        ...i,
        acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        createdAt: i.createdAt?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to generate insights', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:acknowledgeInsight', (_event, insightId: number) => {
    if (!insightOrchestrator) {
      return { success: false, error: 'Insight system not initialized' };
    }
    try {
      const acknowledged = insightOrchestrator.acknowledgeInsight(insightId);
      return { success: acknowledged };
    } catch (error) {
      logger.error('Failed to acknowledge insight', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:acknowledgeAllInsights', () => {
    if (!insightOrchestrator) {
      return { success: false, error: 'Insight system not initialized' };
    }
    try {
      const count = insightOrchestrator.acknowledgeAllInsights();
      return { success: true, data: { count } };
    } catch (error) {
      logger.error('Failed to acknowledge all insights', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:getInsightStats', () => {
    if (!insightOrchestrator) {
      return {
        totalGenerated: 0,
        totalAcknowledged: 0,
        activeCount: 0,
        bySeverity: { info: 0, warning: 0, critical: 0 },
        byType: {},
      };
    }
    try {
      return insightOrchestrator.getStatistics();
    } catch (error) {
      logger.error('Failed to get insight stats', error as Error);
      return {
        totalGenerated: 0,
        totalAcknowledged: 0,
        activeCount: 0,
        bySeverity: { info: 0, warning: 0, critical: 0 },
        byType: {},
      };
    }
  });

  // ============ Intelligence - Suppression (Never Show Again) ============

  ipcMain.handle('intelligence:suppressRecommendation', (_event, id: number) => {
    if (!recommendationOrchestrator) {
      return { success: false, error: 'Recommendation system not initialized' };
    }
    try {
      const suppressed = recommendationOrchestrator.suppressRecommendationForever(id);
      return { success: suppressed };
    } catch (error) {
      logger.error('Failed to suppress recommendation', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:suppressInsight', (_event, id: number) => {
    if (!insightOrchestrator) {
      return { success: false, error: 'Insight system not initialized' };
    }
    try {
      const suppressed = insightOrchestrator.suppressInsightForever(id);
      return { success: suppressed };
    } catch (error) {
      logger.error('Failed to suppress insight', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ============ Intelligence - Workload ============

  ipcMain.handle(
    'intelligence:getWorkloadDistribution',
    (_event, params?: { startDate?: string; endDate?: string }) => {
      if (!workloadOrchestrator) {
        return null;
      }
      try {
        const startDate = params?.startDate ? new Date(params.startDate) : new Date();
        const endDate = params?.endDate ? new Date(params.endDate) : undefined;
        const distribution = workloadOrchestrator.analyzeWorkload(startDate, endDate);

        return {
          startDate: distribution.startDate.toISOString(),
          endDate: distribution.endDate.toISOString(),
          dailySnapshots: distribution.dailySnapshots.map((s) => ({
            snapshotDate: s.snapshotDate.toISOString(),
            totalTasksDue: s.totalTasksDue,
            totalEstimatedMinutes: s.totalEstimatedMinutes,
            tasksByCourse: s.tasksByCourse,
            tasksByUrgency: s.tasksByUrgency,
            deadlineClusteringScore: s.deadlineClusteringScore,
          })),
          peakDay: distribution.peakDay?.toISOString() ?? null,
          peakMinutes: distribution.peakMinutes,
          avgDailyMinutes: distribution.avgDailyMinutes,
          clusteringScore: distribution.clusteringScore,
          balanceScore: distribution.balanceScore,
        };
      } catch (error) {
        logger.error('Failed to get workload distribution', error as Error);
        return null;
      }
    }
  );

  ipcMain.handle('intelligence:getDailyPlan', (_event, params?: { date?: string }) => {
    if (!workloadOrchestrator) {
      return [];
    }
    try {
      const date = params?.date ? new Date(params.date) : new Date();
      const plan = workloadOrchestrator.generateDailyPlan(date);
      return plan.map((entry) => ({
        ...entry,
        dueAt: entry.dueAt?.toISOString() ?? null,
        recommendedStartTime: entry.recommendedStartTime?.toISOString() ?? null,
      }));
    } catch (error) {
      logger.error('Failed to generate daily plan', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getEffortEstimate', (_event, taskId: number) => {
    if (!workloadOrchestrator) {
      return null;
    }
    try {
      return workloadOrchestrator.getEffortEstimate(taskId);
    } catch (error) {
      logger.error('Failed to get effort estimate', error as Error);
      return null;
    }
  });

  ipcMain.handle(
    'intelligence:getClusteringScore',
    (_event, params?: { windowDays?: number }) => {
      if (!workloadOrchestrator) {
        return 0;
      }
      try {
        return workloadOrchestrator.getClusteringScore(params?.windowDays);
      } catch (error) {
        logger.error('Failed to get clustering score', error as Error);
        return 0;
      }
    }
  );

  ipcMain.handle(
    'intelligence:getNeglectedCourses',
    (_event, params?: { windowDays?: number }) => {
      if (!workloadOrchestrator) {
        return [];
      }
      try {
        return workloadOrchestrator.getNeglectedCourses(params?.windowDays ?? 14);
      } catch (error) {
        logger.error('Failed to get neglected courses', error as Error);
        return [];
      }
    }
  );

  ipcMain.handle(
    'intelligence:getDeadlineClusters',
    (_event, params?: { windowHours?: number }) => {
      if (!workloadOrchestrator) {
        return [];
      }
      try {
        return workloadOrchestrator.getDeadlineClusters(params?.windowHours ?? 48);
      } catch (error) {
        logger.error('Failed to get deadline clusters', error as Error);
        return [];
      }
    }
  );

  ipcMain.handle('intelligence:getCourseBalanceScore', () => {
    if (!workloadOrchestrator) {
      return 0;
    }
    try {
      return workloadOrchestrator.getCourseBalanceScore();
    } catch (error) {
      logger.error('Failed to get course balance score', error as Error);
      return 0;
    }
  });

  ipcMain.handle(
    'intelligence:getWorkloadSnapshots',
    (_event, params?: { days?: number }) => {
      if (!workloadOrchestrator) {
        return [];
      }
      try {
        return workloadOrchestrator.getHistoricalSnapshots(params?.days ?? 30);
      } catch (error) {
        logger.error('Failed to get workload snapshots', error as Error);
        return [];
      }
    }
  );

  // ============ Intelligence - Behavior Tracking ============

  ipcMain.handle('intelligence:getWeeklyRhythm', () => {
    if (!behaviorTrackingOrchestrator) {
      return null;
    }
    try {
      const rhythm = behaviorTrackingOrchestrator.getWeeklyRhythm();
      return {
        productiveDays: rhythm.productiveDays,
        productiveHours: rhythm.productiveHours,
        peakDay: rhythm.peakDay,
        peakHour: rhythm.peakHour,
        sampleSize: rhythm.sampleSize,
        confidence: rhythm.confidence,
      };
    } catch (error) {
      logger.error('Failed to get weekly rhythm', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:getCoursePerformance', () => {
    if (!behaviorTrackingOrchestrator) {
      return [];
    }
    try {
      return behaviorTrackingOrchestrator.getCoursePerformance();
    } catch (error) {
      logger.error('Failed to get course performance', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getStrugglePatterns', () => {
    if (!behaviorTrackingOrchestrator) {
      return [];
    }
    try {
      return behaviorTrackingOrchestrator.getStrugglePatterns();
    } catch (error) {
      logger.error('Failed to get struggle patterns', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getCompletionTiming', () => {
    if (!behaviorTrackingOrchestrator) {
      return null;
    }
    try {
      return behaviorTrackingOrchestrator.getCompletionTiming();
    } catch (error) {
      logger.error('Failed to get completion timing', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:getBehaviorEventCount', () => {
    if (!behaviorTrackingOrchestrator) {
      return 0;
    }
    try {
      return behaviorTrackingOrchestrator.getEventCount();
    } catch (error) {
      logger.error('Failed to get behavior event count', error as Error);
      return 0;
    }
  });

  // ============ Intelligence - Adaptive Learning ============

  ipcMain.handle('intelligence:getAdaptiveWeights', () => {
    if (!adaptiveLearningOrchestrator) {
      return null;
    }
    try {
      return adaptiveLearningOrchestrator.getCachedWeights();
    } catch (error) {
      logger.error('Failed to get adaptive weights', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:getWeightAdjustments', () => {
    if (!adaptiveLearningOrchestrator) {
      return [];
    }
    try {
      return adaptiveLearningOrchestrator.getWeightAdjustments();
    } catch (error) {
      logger.error('Failed to get weight adjustments', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getAdaptiveSummary', () => {
    if (!adaptiveLearningOrchestrator) {
      return [];
    }
    try {
      return adaptiveLearningOrchestrator.getSummary();
    } catch (error) {
      logger.error('Failed to get adaptive summary', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getAdaptiveStatistics', () => {
    if (!adaptiveLearningOrchestrator) {
      return null;
    }
    try {
      return adaptiveLearningOrchestrator.getStatistics();
    } catch (error) {
      logger.error('Failed to get adaptive statistics', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:recalculateAdaptiveWeights', () => {
    if (!adaptiveLearningOrchestrator) {
      return { success: false, error: 'Adaptive learning not initialized' };
    }
    try {
      const weights = adaptiveLearningOrchestrator.recalculateWeights();
      return { success: true, data: weights };
    } catch (error) {
      logger.error('Failed to recalculate adaptive weights', error as Error);
      return { success: false, error: 'Failed to recalculate weights' };
    }
  });

  // ============ Sync Conflict Handlers ============

  ipcMain.handle('sync:getPendingConflicts', () => {
    if (!syncEngine) {
      return [];
    }
    return syncEngine.getConflictResolver().getPendingConflicts();
  });

  ipcMain.handle(
    'sync:resolveConflict',
    async (
      _event,
      resolution: {
        conflictId: string;
        useCanvasValue: boolean;
        rememberChoice: boolean;
        rememberForAll: boolean;
        expiresAt?: string | null;
      }
    ) => {
      if (!syncEngine) {
        return { success: false, error: 'Sync engine not initialized' };
      }

      try {
        // Get the conflict BEFORE resolving (since resolving removes it from pending list)
        const conflict = syncEngine
          .getConflictResolver()
          .getPendingConflicts()
          .find((c) => c.id === resolution.conflictId);

        if (!conflict) {
          return { success: false, error: 'Conflict not found' };
        }

        const result = syncEngine.getConflictResolver().resolveConflict(resolution);
        if (result) {
          // Apply the resolution to the database
          const tableName =
            conflict.entity === 'course'
              ? 'courses'
              : conflict.entity === 'task'
                ? 'tasks'
                : 'notifications';
          database.executeWrite(
            `UPDATE ${tableName} SET ${result.field} = ? WHERE id = ?`,
            [result.value, conflict.entityId],
            tableName
          );

          // Clear the modified flag if using Canvas value
          if (resolution.useCanvasValue) {
            syncEngine
              .getConflictResolver()
              .clearFieldModified(tableName, conflict.entityId, result.field);
          }
        }
        return { success: true };
      } catch (error) {
        logger.error(`Failed to resolve sync conflict: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('sync:resolveAllConflicts', async (_event, useCanvasValues: boolean) => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not initialized' };
    }

    try {
      const conflictResolver = syncEngine.getConflictResolver();
      const conflicts = conflictResolver.getPendingConflicts();
      const results = conflictResolver.resolveAllConflicts(useCanvasValues);

      // Apply all resolutions to the database
      database.transaction(() => {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const conflict = conflicts[i];
          if (conflict && result) {
            const tableName =
              conflict.entity === 'course'
                ? 'courses'
                : conflict.entity === 'task'
                  ? 'tasks'
                  : 'notifications';
            database.executeWrite(
              `UPDATE ${tableName} SET ${result.field} = ? WHERE id = ?`,
              [result.value, conflict.entityId],
              tableName
            );

            // Clear the modified flag if using Canvas value
            if (useCanvasValues) {
              conflictResolver.clearFieldModified(
                tableName,
                conflict.entityId,
                result.field
              );
            }
          }
        }
      });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to resolve all sync conflicts: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:getSyncPreferences', () => {
    if (!syncEngine) {
      return [];
    }
    return syncEngine.getConflictResolver().getAllPreferences();
  });

  ipcMain.handle(
    'sync:deleteSyncPreference',
    (_event, entity: string, entityId: number | null, field: string) => {
      if (!syncEngine) {
        return { success: false, error: 'Sync engine not initialized' };
      }

      try {
        syncEngine.getConflictResolver().deletePreference(entity, entityId, field);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Last Sync Time ============

  ipcMain.handle('sync:getLastSyncTime', () => {
    try {
      // Get the most recent sync time from sync_metadata table
      const result = database.executeReadOne<{ last_synced_at: string }>(
        'SELECT MAX(last_synced_at) as last_synced_at FROM sync_metadata'
      );
      return result?.last_synced_at || null;
    } catch (_e) {
      return null;
    }
  });

  // ============ Auto-Sync Preferences ============

  ipcMain.handle('sync:getAutoSyncPreferences', () => {
    try {
      const prefs = database.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'syncPreferences'"
      );
      if (prefs?.value) {
        return JSON.parse(prefs.value);
      }
      return { autoSyncEnabled: true, autoSyncInterval: 15, autoAssignDueDate: false };
    } catch (_e) {
      return { autoSyncEnabled: true, autoSyncInterval: 15, autoAssignDueDate: false };
    }
  });

  ipcMain.handle(
    'sync:setAutoSyncPreferences',
    (
      _event,
      prefs: {
        autoSyncEnabled: boolean;
        autoSyncInterval: number;
        autoAssignDueDate?: boolean;
      }
    ) => {
      try {
        database.executeWrite(
          `INSERT INTO user_preferences (key, value) VALUES ('syncPreferences', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [JSON.stringify(prefs)],
          'user_preferences'
        );

        // Restart auto-sync with new settings
        if (prefs.autoSyncEnabled) {
          startAutoSync();
        } else {
          stopAutoSync();
        }

        logger.info(
          `Auto-sync preferences updated: enabled=${prefs.autoSyncEnabled}, interval=${prefs.autoSyncInterval}min`
        );
        return { success: true };
      } catch (error) {
        logger.error('Failed to save auto-sync preferences:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // ============ Academic Settings Handlers ============

  ipcMain.handle('settings:getDefaultTargetGrade', () => {
    try {
      const prefs = database.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'academicSettings'"
      );
      if (prefs?.value) {
        const settings = JSON.parse(prefs.value);
        return { defaultTargetGrade: settings.defaultTargetGrade ?? 85 };
      }
      return { defaultTargetGrade: 85 };
    } catch (_e) {
      return { defaultTargetGrade: 85 };
    }
  });

  ipcMain.handle('settings:setDefaultTargetGrade', (_event, targetGrade: number) => {
    try {
      // Get existing settings and merge
      const existing = database.executeReadOne<{ value: string }>(
        "SELECT value FROM user_preferences WHERE key = 'academicSettings'"
      );
      const settings = existing?.value ? JSON.parse(existing.value) : {};
      settings.defaultTargetGrade = targetGrade;

      // Save to user_preferences
      database.executeWrite(
        `INSERT INTO user_preferences (key, value) VALUES ('academicSettings', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(settings)],
        'user_preferences'
      );

      // Update all courses with target_grade_source = 'default' to the new value
      const { CourseRepository } = require('./layers/l1-persistence/repositories');
      const courseRepo = new CourseRepository(database);
      const updatedCount = courseRepo.updateDefaultTargetGrades(targetGrade);

      logger.info(
        `Default target grade updated to ${targetGrade}%, propagated to ${updatedCount} courses`
      );
      return { success: true, data: { updatedCourses: updatedCount } };
    } catch (error) {
      logger.error('Failed to save default target grade:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ============ Visibility Settings Handlers ============

  ipcMain.handle('settings:getTermSelection', () => {
    try {
      if (!visibleDataProvider) {
        return { termSelection: 'auto' };
      }
      const termSelection = visibleDataProvider.getTermSelection();
      return { termSelection };
    } catch (error) {
      logger.error('Failed to get term selection:', error as Error);
      return { termSelection: 'auto' };
    }
  });

  ipcMain.handle(
    'settings:setTermSelection',
    (_event, value: 'all' | 'auto' | number) => {
      try {
        if (!visibleDataProvider) {
          return { success: false, error: 'VisibleDataProvider not initialized' };
        }
        visibleDataProvider.setTermSelection(value);
        logger.info(`Term selection updated to: ${value}`);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set term selection:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('visibility:getVisibleCourseIds', () => {
    try {
      if (!visibleDataProvider) {
        return { courseIds: [] };
      }
      const courseIds = visibleDataProvider.getVisibleCourseIds();
      return { courseIds };
    } catch (error) {
      logger.error('Failed to get visible course IDs:', error as Error);
      return { courseIds: [] };
    }
  });

  // ============ Window Behavior Settings Handlers ============

  ipcMain.handle('settings:getWindowBehavior', () => {
    try {
      return getWindowBehavior();
    } catch (error) {
      logger.error('Failed to get window behavior settings:', error as Error);
      return DEFAULT_WINDOW_BEHAVIOR;
    }
  });

  ipcMain.handle(
    'settings:setWindowBehavior',
    (_event, settings: WindowBehaviorSettings) => {
      try {
        setWindowBehavior(settings);
        logger.info(
          `Window behavior updated: closeAction=${settings.closeAction}, showTrayIcon=${settings.showTrayIcon}`
        );
        return { success: true };
      } catch (error) {
        logger.error('Failed to set window behavior settings:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // One-way handler to hide window (for tray functionality)
  ipcMain.on('window:hide', () => {
    mainWindow?.hide();
  });

  // Handler for close behavior dialog response from renderer
  ipcMain.handle(
    'window:setCloseBehaviorAndApply',
    (_event, choice: 'minimize-to-tray' | 'quit') => {
      const settings = getWindowBehavior();
      setWindowBehavior({ ...settings, closeAction: choice });
      logger.info(`Close behavior set to: ${choice}`);

      // Apply the chosen action
      if (choice === 'minimize-to-tray') {
        mainWindow?.hide();
      } else {
        isQuitting = true;
        app.quit();
      }
      return { success: true };
    }
  );

  // ============ Course Settings Handlers ============

  ipcMain.handle('course:getSettings', (_event, courseId: number) => {
    try {
      const course = database.executeReadOne<{
        auto_assign_due_date: number | null;
        allow_guessed_override: number | null;
      }>(
        'SELECT auto_assign_due_date, allow_guessed_override FROM courses WHERE id = ?',
        [courseId]
      );

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      return {
        success: true,
        data: {
          autoAssignDueDate: course.auto_assign_due_date, // null = inherit, 0 = off, 1 = on
          allowGuessedOverride: course.allow_guessed_override ?? 1, // default 1
        },
      };
    } catch (_e) {
      return { success: false, error: String(_e) };
    }
  });

  ipcMain.handle(
    'course:updateSettings',
    (
      _event,
      courseId: number,
      settings: {
        autoAssignDueDate?: number | null;
        allowGuessedOverride?: number;
      }
    ) => {
      try {
        const updates: string[] = [];
        const values: (number | null)[] = [];

        if ('autoAssignDueDate' in settings) {
          updates.push('auto_assign_due_date = ?');
          values.push(settings.autoAssignDueDate ?? null);
        }

        if ('allowGuessedOverride' in settings) {
          updates.push('allow_guessed_override = ?');
          values.push(settings.allowGuessedOverride ?? 1);
        }

        if (updates.length === 0) {
          return { success: true };
        }

        values.push(courseId);
        database.executeWrite(
          `UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          values,
          'courses'
        );

        return { success: true };
      } catch (_e) {
        return { success: false, error: String(_e) };
      }
    }
  );

  // ============ Data Export/Backup Handlers ============

  ipcMain.handle('data:exportDatabase', async () => {
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `canvas-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Save cancelled' };
    }

    try {
      // Checkpoint WAL before copying
      database.executeWrite('PRAGMA wal_checkpoint(TRUNCATE)', [], 'system');

      // Copy database file
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
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'Import cancelled' };
    }

    const importPath = result.filePaths[0];

    try {
      // Verify it's a valid SQLite database by checking the magic bytes
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

      // Close current database connection
      database.close();

      // Backup current database before replacing
      const backupPath = `${DB_PATH}.backup-${Date.now()}`;
      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, backupPath);
      }

      // Remove WAL and SHM files if they exist
      const walPath = `${DB_PATH}-wal`;
      const shmPath = `${DB_PATH}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      // Copy imported database to replace current
      fs.copyFileSync(importPath, DB_PATH);

      logger.info(`Database imported from: ${importPath}`);
      logger.info(`Previous database backed up to: ${backupPath}`);
      metricsCollector.increment('data.import.database');

      // Notify user that app needs restart
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
    'data:exportCourseData',
    async (_event, params?: { courseIds?: number[]; includeFiles?: boolean }) => {
      if (!mainWindow) {
        return { success: false, error: 'No window available' };
      }

      try {
        // Build course filter
        let courseFilter = '';
        const courseIds = params?.courseIds;
        if (courseIds && courseIds.length > 0) {
          courseFilter = ` WHERE id IN (${courseIds.join(',')})`;
        }

        // Fetch courses with all fields
        const courses = database.executeRead<{
          id: number;
          external_id: string;
          code: string;
          name: string;
          nickname: string | null;
          color: string | null;
          enrollment_term_id: number | null;
          target_grade: number | null;
          target_grade_source: string | null;
          is_hidden: number;
          current_grade: number | null;
          assessed_grade: number | null;
          total_weight: number | null;
          syllabus_body: string | null;
          field_sources: string | null;
          allow_guessed_override: number | null;
          auto_assign_due_date: number | null;
        }>(`SELECT * FROM courses${courseFilter}`);

        if (courses.length === 0) {
          return { success: false, error: 'No courses found to export' };
        }

        const courseIdList = courses.map((c) => c.id).join(',');

        // Fetch related data
        const tasks = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM tasks WHERE course_id IN (${courseIdList})`
        );

        const notifications = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM notifications WHERE course_id IN (${courseIdList})`
        );

        const pages = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_pages WHERE course_id IN (${courseIdList})`
        );

        const policies = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_policies WHERE course_id IN (${courseIdList})`
        );

        const resources = database.executeRead<Record<string, unknown>>(
          `SELECT id, external_id, course_id, folder_path, type, title, url, size_bytes, mime_type FROM resources WHERE course_id IN (${courseIdList})`
        );

        // Fetch course_syllabuses
        const syllabuses = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM course_syllabuses WHERE course_id IN (${courseIdList})`
        );

        // Fetch grace_tokens and grace_token_usage
        const graceTokens = database.executeRead<Record<string, unknown>>(
          `SELECT * FROM grace_tokens WHERE course_id IN (${courseIdList})`
        );

        const graceTokenIds = graceTokens.map((g) => g.id).filter(Boolean);
        const graceTokenUsage =
          graceTokenIds.length > 0
            ? database.executeRead<Record<string, unknown>>(
                `SELECT * FROM grace_token_usage WHERE grace_token_id IN (${graceTokenIds.join(',')})`
              )
            : [];

        const exportData = {
          exportedAt: new Date().toISOString(),
          version: '1.1',
          courses: courses.map((c) => ({
            id: c.id,
            externalId: c.external_id,
            code: c.code,
            name: c.name,
            nickname: c.nickname,
            color: c.color,
            enrollmentTermId: c.enrollment_term_id,
            targetGrade: c.target_grade,
            targetGradeSource: c.target_grade_source,
            isHidden: c.is_hidden,
            currentGrade: c.current_grade,
            assessedGrade: c.assessed_grade,
            totalWeight: c.total_weight,
            syllabusBody: c.syllabus_body,
            fieldSources: c.field_sources,
            allowGuessedOverride: c.allow_guessed_override,
            autoAssignDueDate: c.auto_assign_due_date,
          })),
          tasks,
          notifications,
          pages,
          policies,
          resources: resources.map((r) => ({
            ...r,
            localPath: undefined, // Don't include local paths in export
          })),
          syllabuses,
          graceTokens,
          graceTokenUsage,
        };

        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `canvas-export-${new Date().toISOString().split('T')[0]}.json`,
          filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Save cancelled' };
        }

        fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8');
        logger.info(`Course data exported to: ${result.filePath}`);
        metricsCollector.increment('data.export.courses');

        return {
          success: true,
          data: {
            filePath: result.filePath,
            courseCount: courses.length,
            taskCount: tasks.length,
            notificationCount: notifications.length,
          },
        };
      } catch (error) {
        logger.error('Failed to export course data:', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Import course data from JSON (same format as export)
  ipcMain.handle('data:importCourseData', async () => {
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: 'Import cancelled' };
      }

      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const importData = JSON.parse(fileContent);

      // Validate format
      if (!importData.version || !importData.courses) {
        return {
          success: false,
          error: 'Invalid export file format. Missing version or courses.',
        };
      }

      let coursesImported = 0;
      let tasksImported = 0;
      let notificationsImported = 0;
      let pagesImported = 0;
      let policiesImported = 0;
      let resourcesImported = 0;

      // Build course ID mapping: old ID -> new ID (using external_id as key)
      const courseIdMap = new Map<number, number>();

      // Import courses first and build mapping
      if (Array.isArray(importData.courses)) {
        for (const course of importData.courses) {
          const externalId = course.externalId || course.external_id;
          const oldId = course.id;

          database.upsert(
            'courses',
            {
              external_id: externalId,
              code: course.code,
              name: course.name,
              nickname: course.nickname,
              color: course.color,
              enrollment_term_id: course.enrollmentTermId || course.enrollment_term_id,
              target_grade: course.targetGrade ?? course.target_grade ?? 85.0,
              target_grade_source:
                course.targetGradeSource || course.target_grade_source || 'default',
              is_hidden: course.isHidden ?? course.is_hidden ?? 0,
              current_grade: course.currentGrade ?? course.current_grade,
              assessed_grade: course.assessedGrade ?? course.assessed_grade,
              total_weight: course.totalWeight ?? course.total_weight ?? 0,
              syllabus_body: course.syllabusBody || course.syllabus_body,
              field_sources: course.fieldSources || course.field_sources,
              allow_guessed_override:
                course.allowGuessedOverride ?? course.allow_guessed_override ?? 1,
              auto_assign_due_date:
                course.autoAssignDueDate ?? course.auto_assign_due_date,
            },
            'external_id'
          );

          // Get the actual ID from database
          const dbCourse = database.executeReadOne<{ id: number }>(
            'SELECT id FROM courses WHERE external_id = ?',
            [externalId]
          );
          if (dbCourse && oldId) {
            courseIdMap.set(oldId, dbCourse.id);
          }
          coursesImported++;
        }
      }

      // Helper to map old course ID to new course ID
      const mapCourseId = (oldId: number | null | undefined): number | null => {
        if (oldId == null) return null;
        return courseIdMap.get(oldId) ?? oldId; // Fall back to original if not in map
      };

      // Build ID mappings for tasks, resources, and policies
      const taskIdMap = new Map<number, number>();
      const resourceIdMap = new Map<number, number>();
      const policyIdMap = new Map<number, number>();

      // Import tasks and build mapping
      if (Array.isArray(importData.tasks)) {
        for (const task of importData.tasks) {
          const oldCourseId = task.course_id || task.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          const externalId = task.external_id || task.externalId;
          const oldId = task.id;

          database.upsert(
            'tasks',
            {
              external_id: externalId,
              course_id: newCourseId,
              title: task.title,
              description: task.description,
              due_at: task.due_at || task.dueAt,
              unlock_at: task.unlock_at || task.unlockAt,
              lock_at: task.lock_at || task.lockAt,
              weight: task.weight || 0,
              grade: task.grade,
              points_possible: task.points_possible || task.pointsPossible,
              priority_score: task.priority_score || task.priorityScore || 0,
              is_completed: task.is_completed ?? task.isCompleted ?? 0,
              is_optional: task.is_optional ?? task.isOptional ?? 0,
              completed_at: task.completed_at || task.completedAt,
              submission_status: task.submission_status || task.submissionStatus,
              task_type: task.task_type || task.taskType,
              task_group_id: task.task_group_id || task.taskGroupId,
              field_sources: task.field_sources || task.fieldSources,
              pain_index: task.pain_index ?? task.painIndex ?? 0,
              penalty_severity: task.penalty_severity ?? task.penaltySeverity ?? 0,
              has_safety_net: task.has_safety_net ?? task.hasSafetyNet ?? 0,
              days_until_cutoff: task.days_until_cutoff ?? task.daysUntilCutoff,
            },
            'external_id'
          );

          // Get the actual ID from database for mapping
          if (oldId && externalId) {
            const dbTask = database.executeReadOne<{ id: number }>(
              'SELECT id FROM tasks WHERE external_id = ?',
              [externalId]
            );
            if (dbTask) {
              taskIdMap.set(oldId, dbTask.id);
            }
          }
          tasksImported++;
        }
      }

      // Import notifications (unique on source_type + source_id, no updated_at column)
      if (Array.isArray(importData.notifications)) {
        for (const notif of importData.notifications) {
          const oldCourseId = notif.course_id || notif.courseId;
          const newCourseId = mapCourseId(oldCourseId);

          database.upsert(
            'notifications',
            {
              source_type: notif.source_type || notif.sourceType || 'canvas',
              source_id: notif.source_id || notif.sourceId,
              course_id: newCourseId,
              title: notif.title,
              message: notif.message,
              message_html: notif.message_html || notif.messageHtml,
              published_at: notif.published_at || notif.publishedAt,
              dismissed_at: notif.dismissed_at || notif.dismissedAt,
              url: notif.url,
            },
            ['source_type', 'source_id'],
            false // notifications table has no updated_at column
          );
          notificationsImported++;
        }
      }

      // Import pages
      if (Array.isArray(importData.pages)) {
        for (const page of importData.pages) {
          const oldCourseId = page.course_id || page.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          database.upsert(
            'course_pages',
            {
              external_id: page.external_id || page.externalId,
              course_id: newCourseId,
              title: page.title,
              body_html: page.body_html || page.bodyHtml || page.body,
              body_text: page.body_text || page.bodyText,
              url_slug: page.url_slug || page.urlSlug || page.url,
              page_type: page.page_type || page.pageType || 'content',
              published: page.published ?? 1,
              is_front_page:
                page.is_front_page ||
                page.isFrontPage ||
                page.front_page ||
                page.frontPage ||
                0,
            },
            'external_id'
          );
          pagesImported++;
        }
      }

      // Import policies and build ID mapping
      if (Array.isArray(importData.policies)) {
        for (const policy of importData.policies) {
          const oldCourseId = policy.course_id || policy.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          const oldId = policy.id;
          const policyType = policy.policy_type || policy.policyType;
          const policyName = policy.policy_name || policy.policyName || 'imported';

          database.upsert(
            'course_policies',
            {
              course_id: newCourseId,
              policy_type: policyType,
              policy_name: policyName,
              policy_config:
                policy.policy_config ||
                policy.policyConfig ||
                JSON.stringify({ value: policy.value }),
              raw_text: policy.raw_text || policy.rawText,
            },
            ['course_id', 'policy_type', 'policy_name']
          );

          // Get the actual ID from database for mapping
          if (oldId) {
            const dbPolicy = database.executeReadOne<{ id: number }>(
              'SELECT id FROM course_policies WHERE course_id = ? AND policy_type = ? AND policy_name = ?',
              [newCourseId, policyType, policyName]
            );
            if (dbPolicy) {
              policyIdMap.set(oldId, dbPolicy.id);
            }
          }
          policiesImported++;
        }
      }

      // Import resources (without local paths) and build ID mapping
      if (Array.isArray(importData.resources)) {
        for (const resource of importData.resources) {
          const oldCourseId = resource.course_id || resource.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          const externalId = resource.external_id || resource.externalId;
          const oldId = resource.id;

          database.upsert(
            'resources',
            {
              external_id: externalId,
              course_id: newCourseId,
              folder_path: resource.folder_path || resource.folderPath,
              type: resource.type,
              title: resource.title,
              url: resource.url,
              size_bytes: resource.size_bytes || resource.sizeBytes,
              mime_type: resource.mime_type || resource.mimeType,
            },
            'external_id'
          );

          // Get the actual ID from database for mapping
          if (oldId && externalId) {
            const dbResource = database.executeReadOne<{ id: number }>(
              'SELECT id FROM resources WHERE external_id = ?',
              [externalId]
            );
            if (dbResource) {
              resourceIdMap.set(oldId, dbResource.id);
            }
          }
          resourcesImported++;
        }
      }

      // Import syllabuses (v1.1+)
      let syllabusesImported = 0;
      if (Array.isArray(importData.syllabuses)) {
        for (const syllabus of importData.syllabuses) {
          const oldCourseId = syllabus.course_id || syllabus.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue;

          // Map resource_id to new ID, skip if resource doesn't exist
          const oldResourceId = syllabus.resource_id || syllabus.resourceId;
          const newResourceId = oldResourceId ? resourceIdMap.get(oldResourceId) : null;
          if (!newResourceId) continue; // Skip if resource wasn't imported

          database.upsert(
            'course_syllabuses',
            {
              course_id: newCourseId,
              resource_id: newResourceId,
              source_type: syllabus.source_type || syllabus.sourceType || 'resource',
              resource_updated_at:
                syllabus.resource_updated_at || syllabus.resourceUpdatedAt,
              last_reviewed_at:
                syllabus.last_reviewed_at ||
                syllabus.lastReviewedAt ||
                new Date().toISOString(),
              change_detected_at:
                syllabus.change_detected_at || syllabus.changeDetectedAt,
              marked_at: syllabus.marked_at || syllabus.markedAt,
            },
            'course_id',
            false // course_syllabuses table has no updated_at column
          );
          syllabusesImported++;
        }
      }

      // Import grace tokens and usage (v1.1+)
      let graceTokensImported = 0;
      let graceTokenUsageImported = 0;
      const graceTokenIdMap = new Map<number, number>();

      if (Array.isArray(importData.graceTokens)) {
        for (const token of importData.graceTokens) {
          const oldCourseId = token.course_id || token.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue;

          // Map policy_id to new ID, skip if policy doesn't exist
          const oldPolicyId = token.policy_id || token.policyId;
          const newPolicyId = oldPolicyId ? policyIdMap.get(oldPolicyId) : null;
          if (!newPolicyId) continue; // Skip if policy wasn't imported

          const oldId = token.id;

          database.upsert(
            'grace_tokens',
            {
              course_id: newCourseId,
              policy_id: newPolicyId,
              total_tokens: token.total_tokens || token.totalTokens,
              tokens_remaining: token.tokens_remaining || token.tokensRemaining,
              hours_per_token: token.hours_per_token ?? token.hoursPerToken ?? 24,
              max_tokens_per_task:
                token.max_tokens_per_task ?? token.maxTokensPerTask ?? 2,
            },
            ['course_id', 'policy_id']
          );

          // Get the actual ID from database to map usage records
          const dbToken = database.executeReadOne<{ id: number }>(
            'SELECT id FROM grace_tokens WHERE course_id = ? AND policy_id = ?',
            [newCourseId, newPolicyId]
          );
          if (dbToken && oldId) {
            graceTokenIdMap.set(oldId, dbToken.id);
          }
          graceTokensImported++;
        }
      }

      if (Array.isArray(importData.graceTokenUsage)) {
        for (const usage of importData.graceTokenUsage) {
          const oldTokenId = usage.grace_token_id || usage.graceTokenId;
          const newTokenId = graceTokenIdMap.get(oldTokenId);
          if (!newTokenId) continue;

          // Map task_id to new ID, skip if task doesn't exist
          const oldTaskId = usage.task_id || usage.taskId;
          const newTaskId = oldTaskId ? taskIdMap.get(oldTaskId) : null;
          if (!newTaskId) continue; // Skip if task wasn't imported

          database.upsert(
            'grace_token_usage',
            {
              grace_token_id: newTokenId,
              task_id: newTaskId,
              tokens_used: usage.tokens_used || usage.tokensUsed,
              hours_extended: usage.hours_extended || usage.hoursExtended,
              used_at: usage.used_at || usage.usedAt,
            },
            ['grace_token_id', 'task_id'],
            false // grace_token_usage table has no updated_at column
          );
          graceTokenUsageImported++;
        }
      }

      logger.info(
        `Data imported from: ${filePath} (${coursesImported} courses, ${tasksImported} tasks, ${notificationsImported} notifications, ${pagesImported} pages, ${policiesImported} policies, ${resourcesImported} resources, ${syllabusesImported} syllabuses, ${graceTokensImported} grace tokens)`
      );
      metricsCollector.increment('data.import.courses');

      return {
        success: true,
        data: {
          filePath,
          coursesImported,
          tasksImported,
          notificationsImported,
          pagesImported,
          policiesImported,
          resourcesImported,
          syllabusesImported,
          graceTokensImported,
          graceTokenUsageImported,
        },
      };
    } catch (error) {
      logger.error('Failed to import course data:', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // Check if previous session crashed (for recovery dialog)
  ipcMain.handle('app:getCrashInfo', () => {
    const crashCheck = checkCrashFlag();
    return crashCheck.crashed ? crashCheck.data : null;
  });

  // Get current recovery status (safe mode, crash info)
  ipcMain.handle('app:getRecoveryStatus', () => {
    return getRecoveryStatus();
  });

  // Manually exit safe mode (user dismisses recovery banner)
  ipcMain.handle('app:exitSafeMode', () => {
    clearSafeMode();
    // Try to start auto-sync now that safe mode is cleared
    startAutoSync();
    return { success: true };
  });

  // Clear last crash info (user acknowledges crash notification)
  ipcMain.handle('app:dismissCrashNotification', () => {
    lastCrashInfo = null;
    return { success: true };
  });

  // Handle database corruption response
  ipcMain.handle('app:handleCorruption', async (_event, action: string) => {
    logger.info(`User chose corruption action: ${action}`);

    if (action === 'export') {
      // Export data before reset
      try {
        const exportData = database.exportAllData();
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
      databaseCorruptionDetected = null;
      logger.warn('User chose to continue with corrupted database');
      return { success: true };
    }

    return { success: false, error: 'Unknown action' };
  });

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
      const history = loadCrashHistory();
      history.crashes.push({
        timestamp: errorInfo.timestamp,
        reason: `renderer_error: ${errorInfo.message.substring(0, 100)}`,
      });

      // Keep only recent crashes
      const cutoff = Date.now() - CRASH_LOOP_WINDOW_MS * 2;
      history.crashes = history.crashes.filter(
        (c) => new Date(c.timestamp).getTime() > cutoff
      );

      saveCrashHistory(history);

      return { success: true };
    }
  );
}

// ============ Crash Protection ============

/**
 * Load crash history from disk
 */
function loadCrashHistory(): CrashHistory {
  try {
    if (fs.existsSync(CRASH_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(CRASH_HISTORY_FILE, 'utf-8'));
    }
  } catch (_e) {
    // Ignore parse errors, return default
  }
  return { crashes: [], lastCleanExit: null, safeMode: false };
}

/**
 * Save crash history to disk
 */
function saveCrashHistory(history: CrashHistory): void {
  try {
    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CRASH_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (_e) {
    // Cannot log, just ignore
  }
}

/**
 * Check if crash loop detected (3+ crashes in 10 minutes)
 */
function checkCrashLoop(): { inLoop: boolean; crashCount: number } {
  const history = loadCrashHistory();
  const now = Date.now();

  // Count crashes within the window
  const recentCrashes = history.crashes.filter((crash) => {
    const crashTime = new Date(crash.timestamp).getTime();
    return now - crashTime < CRASH_LOOP_WINDOW_MS;
  });

  const inLoop = recentCrashes.length >= CRASH_LOOP_THRESHOLD;

  if (inLoop && !history.safeMode) {
    // Enter safe mode
    history.safeMode = true;
    saveCrashHistory(history);
  }

  return { inLoop, crashCount: recentCrashes.length };
}

/**
 * Record a crash in history and write crash flag
 */
function writeCrashFlag(reason: string): void {
  try {
    const timestamp = new Date().toISOString();
    const crashData = {
      timestamp,
      reason,
      pid: process.pid,
      platform: process.platform,
    };

    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }

    // Write immediate crash flag
    fs.writeFileSync(CRASH_FLAG_FILE, JSON.stringify(crashData, null, 2));

    // Also record in crash history (skip session_start as it's not a real crash)
    if (reason !== 'session_start') {
      const history = loadCrashHistory();
      history.crashes.push({ timestamp, reason });

      // Keep only crashes within the window + a buffer
      const cutoff = Date.now() - CRASH_LOOP_WINDOW_MS * 2;
      history.crashes = history.crashes.filter(
        (c) => new Date(c.timestamp).getTime() > cutoff
      );

      saveCrashHistory(history);
    }
  } catch (_e) {
    // Cannot log, just ignore
  }
}

/**
 * Clear crash flag and record clean exit
 */
function clearCrashFlag(): void {
  try {
    if (fs.existsSync(CRASH_FLAG_FILE)) {
      fs.unlinkSync(CRASH_FLAG_FILE);
    }

    // Record clean exit in history
    const history = loadCrashHistory();
    history.lastCleanExit = new Date().toISOString();
    saveCrashHistory(history);
  } catch (_e) {
    // Ignore
  }
}

/**
 * Clear safe mode after stable runtime
 */
function clearSafeMode(): void {
  const history = loadCrashHistory();
  if (history.safeMode) {
    history.safeMode = false;
    history.crashes = []; // Clear crash history on successful recovery
    saveCrashHistory(history);
    safeModeEnabled = false;
    logger.info('Safe mode cleared after stable runtime');

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:recovery-status', {
        safeMode: false,
        lastCrash: null,
        message: 'App has been stable - safe mode disabled',
      });
    }
  }
}

/**
 * Start safe mode clear timer - clears after 5 minutes of stable runtime
 */
function startSafeModeClearTimer(): void {
  if (safeModeTimer) {
    clearTimeout(safeModeTimer);
  }

  safeModeTimer = setTimeout(() => {
    clearSafeMode();
    safeModeTimer = null;
  }, SAFE_MODE_CLEAR_DELAY_MS);
}

/**
 * Check if previous session crashed
 */
function checkCrashFlag(): {
  crashed: boolean;
  data?: { timestamp: string; reason: string };
} {
  try {
    if (fs.existsSync(CRASH_FLAG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CRASH_FLAG_FILE, 'utf-8'));
      return { crashed: true, data };
    }
  } catch (_e) {
    // Ignore
  }
  return { crashed: false };
}

/**
 * Get current recovery status for renderer
 */
function getRecoveryStatus(): {
  safeMode: boolean;
  lastCrash: CrashHistoryEntry | null;
  crashCount: number;
  message: string | null;
} {
  const history = loadCrashHistory();
  const recentCrashes = history.crashes.filter((crash) => {
    const crashTime = new Date(crash.timestamp).getTime();
    return Date.now() - crashTime < CRASH_LOOP_WINDOW_MS;
  });

  let message: string | null = null;
  if (safeModeEnabled) {
    message = `Auto-sync disabled due to ${recentCrashes.length} recent crashes. Manual sync is still available.`;
  } else if (lastCrashInfo) {
    message = 'App recovered from previous crash.';
  }

  return {
    safeMode: safeModeEnabled,
    lastCrash: lastCrashInfo,
    crashCount: recentCrashes.length,
    message,
  };
}

/**
 * Emergency cleanup on crash
 */
function emergencyCleanup(): void {
  try {
    // Try to checkpoint database with timeout
    const timeout = setTimeout(() => {
      process.exit(1);
    }, 2000); // 2 second timeout

    try {
      database.close();
      clearTimeout(timeout);
    } catch (_e) {
      clearTimeout(timeout);
    }
  } catch (_e) {
    // Ignore
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  writeCrashFlag(`uncaughtException: ${error.message}`);
  logger.error('Uncaught Exception:', error);
  emergencyCleanup();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, _promise) => {
  writeCrashFlag(`unhandledRejection: ${reason}`);
  logger.error(
    'Unhandled Rejection:',
    reason instanceof Error ? reason : new Error(String(reason))
  );
  // Don't exit on unhandled rejection, just log
});

// ============ Download Queue Persistence ============

interface PendingDownloadRow {
  id: number;
  resource_id: string;
  course_code: string;
  url: string;
  filename: string;
  context_folder: string | null;
  folder_path: string | null;
  expected_size: number | null;
  priority: number;
  status: string;
  retry_count: number;
}

/**
 * Save pending downloads to database for crash recovery
 */
function savePendingDownloads(): void {
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

// ============ Auto-Sync ============

/**
 * Start the auto-sync scheduler based on user settings
 */
function startAutoSync(): void {
  stopAutoSync(); // Clear any existing interval

  // Check if safe mode is enabled (crash loop detected)
  if (safeModeEnabled) {
    logger.warn(
      'Safe mode enabled - auto-sync disabled. Manual sync is still available.'
    );
    return;
  }

  // Load sync preferences from localStorage equivalent (read from DB user_preferences)
  let autoSyncEnabled = true;
  let autoSyncIntervalMs = 15 * 60 * 1000; // Default 15 minutes

  try {
    const prefs = database.executeReadOne<{ value: string }>(
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
    logger.info('Auto-sync is disabled (manual sync only)');
    return;
  }

  logger.info(`Auto-sync enabled, interval: ${autoSyncIntervalMs / 60000} minutes`);

  // Start safe mode clear timer if we successfully started auto-sync
  startSafeModeClearTimer();

  autoSyncInterval = setInterval(async () => {
    if (!syncEngine || !systemMonitor.getState().canSync) {
      logger.debug(
        'Auto-sync skipped: sync engine not ready or system state prevents sync'
      );
      return;
    }

    logger.info('Auto-sync triggered');
    try {
      // Notify renderer that sync is starting
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:status', 'syncing');
      }

      await syncEngine.syncAll();

      // Notify renderer that sync completed
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:status', 'idle');
        // Trigger Files page refresh
        mainWindow.webContents.send('file-status-changed', { type: 'sync-complete' });
      }

      metricsCollector.increment('sync.auto.success');
    } catch (error) {
      logger.error(`Auto-sync failed: ${error}`);
      metricsCollector.increment('sync.auto.failure');

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:status', 'error');
      }
    }
  }, autoSyncIntervalMs);
}

/**
 * Stop the auto-sync scheduler
 */
function stopAutoSync(): void {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

/**
 * Trigger background sync when window regains focus after being away
 */
async function triggerFocusRestoreSync(): Promise<void> {
  if (!syncEngine || !systemMonitor.getState().canSync) {
    return;
  }

  logger.info('Focus restore sync triggered');
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', 'syncing');
    }

    await syncEngine.syncAll();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', 'idle');
      // Trigger Files page refresh
      mainWindow.webContents.send('file-status-changed', { type: 'sync-complete' });
    }

    metricsCollector.increment('sync.focus_restore.success');
  } catch (error) {
    logger.error(`Focus restore sync failed: ${error}`);
    metricsCollector.increment('sync.focus_restore.failure');

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', 'error');
    }
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

app.whenReady().then(async () => {
  logger.info('Canvas Integration Dashboard starting...');
  logger.info(`Platform: ${process.platform}, Electron: ${process.versions.electron}`);
  logger.info(`Data directory: ${APP_DATA_DIR}`);

  // Check for previous crash and crash loop
  const crashCheck = checkCrashFlag();
  if (crashCheck.crashed && crashCheck.data) {
    logger.warn(
      `Previous session crashed at ${crashCheck.data.timestamp}: ${crashCheck.data.reason}`
    );
    metricsCollector.increment('app.crash_recovery');

    // Store last crash info for recovery UI
    lastCrashInfo = {
      timestamp: crashCheck.data.timestamp,
      reason: crashCheck.data.reason,
    };

    // Clear the crash flag since we've detected it
    clearCrashFlag();
  }

  // Check for crash loop (3+ crashes in 10 minutes)
  const crashLoopCheck = checkCrashLoop();
  if (crashLoopCheck.inLoop) {
    safeModeEnabled = true;
    logger.warn(
      `Crash loop detected: ${crashLoopCheck.crashCount} crashes in last 10 minutes. Entering safe mode (auto-sync disabled).`
    );
    metricsCollector.increment('app.safe_mode_entered');
  } else {
    // Start timer to clear safe mode after stable runtime
    const history = loadCrashHistory();
    if (history.safeMode) {
      safeModeEnabled = true;
      logger.info('Resuming in safe mode from previous session');
      startSafeModeClearTimer();
    }
  }

  // Write crash flag - will be cleared on clean exit
  writeCrashFlag('session_start');

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
      logger.warn(`Migration errors: ${migrationResult.errors.join(', ')}`);
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
    // URL format: canvas-file://{canvasFileId}/{filename}
    protocol.handle('canvas-file', async (request) => {
      const url = new URL(request.url);
      let canvasFileId = url.hostname; // The file ID is in the hostname part
      const requestedPath = url.pathname;

      logger.info(`[canvas-file] Protocol request received: ${request.url}`);
      logger.info(
        `[canvas-file] Raw hostname: ${canvasFileId}, pathname: ${requestedPath}`
      );

      // JavaScript's URL parser converts numeric hostnames to IP addresses
      // e.g., canvas-file://41584900/file.pdf becomes hostname "2.122.137.4"
      // Convert IP-style hostname back to the original number
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(canvasFileId)) {
        const parts = canvasFileId.split('.').map(Number);
        const numericId =
          (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
        // Use unsigned conversion for large numbers
        const unsignedId = numericId >>> 0;
        canvasFileId = String(unsignedId);
        logger.info(
          `[canvas-file] Converted IP-style hostname to file ID: ${canvasFileId}`
        );
      }

      logger.info(`[canvas-file] Resolved fileId: ${canvasFileId}`);

      // Look up the resource in the database
      const resource = database.executeReadOne<{
        local_path: string | null;
        url: string | null;
      }>('SELECT local_path, url FROM resources WHERE external_id = ?', [canvasFileId]);

      logger.info(`[canvas-file] DB lookup result: ${JSON.stringify(resource)}`);

      if (resource?.local_path && fs.existsSync(resource.local_path)) {
        // Local file exists - serve it
        logger.info(`[canvas-file] Serving LOCAL file: ${resource.local_path}`);
        return net.fetch(`file://${resource.local_path}`);
      } else if (resource?.local_path) {
        logger.warn(
          `[canvas-file] local_path set but file doesn't exist: ${resource.local_path}`
        );
      }

      if (resource?.url) {
        // Fall back to Canvas URL - download locally first, then serve
        logger.info(`[canvas-file] Falling back to NETWORK URL: ${resource.url}`);

        try {
          // Get auth token for Canvas request
          const token = await credentialManager.retrieve();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          logger.info(`[canvas-file] Downloading file from Canvas...`);
          const response = await net.fetch(resource.url, { headers });

          if (!response.ok) {
            logger.error(
              `[canvas-file] Canvas fetch failed: ${response.status} ${response.statusText}`
            );
            return new Response(`Failed to fetch from Canvas: ${response.status}`, {
              status: response.status,
            });
          }

          // Get the file content
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Determine filename from URL path (URLs always use forward slashes)
          const filename = decodeURIComponent(
            requestedPath.split(/[/\\]/).pop() || `file_${canvasFileId}`
          );

          // Get course info to determine save location
          const resourceInfo = database.executeReadOne<{
            course_id: number;
            folder_path: string | null;
          }>('SELECT course_id, folder_path FROM resources WHERE external_id = ?', [
            canvasFileId,
          ]);

          if (resourceInfo) {
            const courseInfo = database.executeReadOne<{ code: string }>(
              'SELECT code FROM courses WHERE id = ?',
              [resourceInfo.course_id]
            );

            if (courseInfo) {
              // Sanitize course code for file system (replace spaces with underscores)
              const sanitizedCode = courseInfo.code
                .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
                .replace(/\s+/g, '_');
              // Save to course folder
              const courseFolder = path.join(FILES_DIR, sanitizedCode);
              const targetFolder = resourceInfo.folder_path
                ? path.join(courseFolder, resourceInfo.folder_path)
                : courseFolder;

              // Ensure folder exists
              if (!fs.existsSync(targetFolder)) {
                fs.mkdirSync(targetFolder, { recursive: true });
              }

              const localPath = path.join(targetFolder, filename);
              fs.writeFileSync(localPath, buffer);
              logger.info(`[canvas-file] Saved file to: ${localPath}`);

              // Update database with local_path
              database.executeWrite(
                'UPDATE resources SET local_path = ? WHERE external_id = ?',
                [localPath, canvasFileId],
                'resources'
              );
              logger.info(`[canvas-file] Updated database with local_path`);
            }
          }

          // Determine content type from filename
          const ext = path.extname(filename).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.html': 'text/html',
            '.htm': 'text/html',
            '.txt': 'text/plain',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.doc': 'application/msword',
            '.docx':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx':
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';

          // Return response with proper content-type for inline display
          logger.info(`[canvas-file] Serving downloaded content as ${contentType}`);
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(buffer.length),
            },
          });
        } catch (err) {
          logger.error(`[canvas-file] Error downloading from Canvas: ${err}`);
          return new Response(`Error fetching file: ${err}`, { status: 500 });
        }
      } else {
        // Resource not found
        logger.warn(
          `[canvas-file] Resource not found in DB for external_id: ${canvasFileId}`
        );
        return new Response('File not found', { status: 404 });
      }
    });
    logger.info('Registered canvas-file:// protocol handler');

    // Clean up old embedded- resource entries (no longer needed, protocol handles on-demand)
    const embeddedCleanup = database.executeWrite(
      `DELETE FROM resources WHERE external_id LIKE 'embedded-%'`,
      [],
      'resources'
    );
    if (embeddedCleanup.changes > 0) {
      logger.info(`Cleaned up ${embeddedCleanup.changes} old embedded resource entries`);
      // Notify renderer to refresh Files page
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

    // Initialize L3 PriorityEngine for simulation support
    priorityEngine = new PriorityEngine(database);

    // Initialize L4 CommandDispatcher with PriorityEngine and VisibleDataProvider
    commandDispatcher = new CommandDispatcher({
      db: database,
      priorityEngine,
      visibleDataProvider: visibleDataProvider ?? undefined,
    });

    // Initialize L3 PriorityOrchestrator with visibility filtering
    priorityOrchestrator = new PriorityOrchestrator(
      database,
      {
        refreshIntervalMs: 15 * 60 * 1000, // 15 minutes
        autoRefresh: true,
      },
      visibleDataProvider ?? undefined
    );

    // Initialize L3 Intelligence Orchestrators with visibility filtering
    recommendationOrchestrator = new RecommendationOrchestrator(database, {
      refreshIntervalMs: 30 * 60 * 1000, // 30 minutes
      autoRefresh: true,
    });

    insightOrchestrator = new InsightOrchestrator(
      database,
      {
        refreshIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
        autoRefresh: true,
      },
      visibleDataProvider ?? undefined
    );

    workloadOrchestrator = new WorkloadOrchestrator(
      database,
      {
        defaultAvailableHoursPerDay: 4,
        defaultLookAheadDays: 14,
      },
      visibleDataProvider ?? undefined
    );

    behaviorTrackingOrchestrator = new BehaviorTrackingOrchestrator(
      database,
      {
        refreshIntervalMs: 60 * 60 * 1000, // 1 hour
        maxEventAgeDays: 180,
        autoRefresh: true,
      },
      visibleDataProvider ?? undefined
    );

    adaptiveLearningOrchestrator = new AdaptiveLearningOrchestrator(database, {
      recalculateIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
      minSampleSize: 10,
      autoRecalculate: true,
    });

    logger.info(
      'L3 Intelligence orchestrators initialized (including behavior tracking and adaptive learning)'
    );

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

    // Track command metrics and behavior events
    commandDispatcher.on('command-completed', ({ command, params, result }) => {
      metricsCollector.increment(`command.${command}.executed`);

      // Track task completions for behavior analysis and adaptive learning
      if (command === 'MarkTaskComplete' && result?.success && params?.isComplete) {
        try {
          const taskId = params.taskId as number;

          // Get task details for tracking
          const task = database.executeReadOne<{
            id: number;
            course_id: number;
            task_type: string | null;
            due_at: string | null;
            points_possible: number | null;
            grade: number | null;
          }>(
            'SELECT id, course_id, task_type, due_at, points_possible, grade FROM tasks WHERE id = ?',
            [taskId]
          );

          if (task) {
            const completedAt = new Date();
            const dueAt = task.due_at ? new Date(task.due_at) : null;
            const wasLate = dueAt ? completedAt > dueAt : false;
            const daysBeforeDue = dueAt
              ? Math.round(
                  (dueAt.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24)
                )
              : null;

            // Record to behavior tracking
            if (behaviorTrackingOrchestrator) {
              behaviorTrackingOrchestrator.recordCompletionEvent(
                task.id,
                task.course_id,
                task.task_type || 'assignment',
                completedAt,
                {
                  dueAt: dueAt ?? undefined,
                  pointsPossible: task.points_possible ?? undefined,
                  scoreAchieved: task.grade ?? undefined,
                }
              );
            }

            // Record to adaptive learning (simplified - without full priority factors)
            // Note: Full integration would require storing priority factors at task completion time
            if (adaptiveLearningOrchestrator) {
              const defaultFactors = {
                urgency: 50,
                weight: task.points_possible
                  ? Math.min(50, task.points_possible / 2)
                  : 10,
                courseGap: 15,
                policyAdjustment: 0,
                dependency: 0,
                taskTypeBoost: 0,
                lockTimeUrgency: 0,
                graceTokenFactor: 0,
                submissionFactor: 0,
              };
              adaptiveLearningOrchestrator.recordOutcome(
                task.id,
                task.course_id,
                task.task_type || 'assignment',
                50, // Placeholder priority score
                defaultFactors,
                wasLate,
                daysBeforeDue
              );
            }

            logger.debug(
              `Recorded task completion for behavior tracking: task ${taskId}`
            );
          }
        } catch (error) {
          logger.warn(`Failed to track task completion for behavior analysis: ${error}`);
        }
      }
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

      // Start auto-sync scheduler after Canvas client is ready
      startAutoSync();
    }
  }

  // Restore any pending downloads from previous session (if database available)
  try {
    restorePendingDownloads();
  } catch (error) {
    logger.error('Failed to restore pending downloads', error as Error);
  }

  createWindow();

  // Create system tray icon
  createTray();

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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-status-changed', {
          type: 'deleted',
          resourceId: resource.id,
          externalId: resource.external_id,
          path: event.path,
        });
      }
    }
  });

  // Handle file additions - could be from external download or sync
  fileWatcher.on('file-added', (event: { path: string; relativePath: string }) => {
    logger.debug(`[FileWatcher] File added: ${event.path}`);

    // Notify renderer of new file
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-status-changed', {
        type: 'added',
        path: event.path,
      });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
    const settings = getWindowBehavior();
    // Only quit if not set to minimize-to-tray
    if (settings.closeAction !== 'minimize-to-tray') {
      app.quit();
    } else {
      logger.info('Staying in tray (minimize-to-tray enabled)');
    }
  }
});

app.on('quit', () => {
  logger.info('Application quitting...');

  // Clean up tray
  destroyTray();

  // Stop auto-sync scheduler
  stopAutoSync();

  // Abort any in-flight sync operations
  if (syncEngine) {
    try {
      syncEngine.abort();
      logger.info('Sync engine aborted');
    } catch (error) {
      logger.error('Failed to abort sync engine', error as Error);
    }
  }

  // Clear safe mode timer if running
  if (safeModeTimer) {
    clearTimeout(safeModeTimer);
    safeModeTimer = null;
  }

  // Clear crash flag on clean exit
  clearCrashFlag();

  // Clear simulation state (as per spec: clears on app close)
  if (commandDispatcher) {
    commandDispatcher.clearSimulation();
  }

  // Stop L3 Intelligence orchestrators
  if (recommendationOrchestrator) {
    recommendationOrchestrator.stop();
  }
  if (insightOrchestrator) {
    insightOrchestrator.stop();
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
