import { app, BrowserWindow, ipcMain, dialog } from 'electron';
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

// L1 - Persistence
import { Database, MigrationRunner, coreMigrations } from './layers/l1-persistence';

// L2 - Daemon
import { CanvasClient, SyncEngine, RateLimiter, CircuitBreaker, htmlToPlainText, ICSParser, RRuleExpander } from './layers/l2-daemon';
import crypto from 'crypto';

// L3 - Intelligence
import { PriorityOrchestrator } from './layers/l3-intelligence/orchestration/PriorityOrchestrator';
import { RecommendationOrchestrator } from './layers/l3-intelligence/orchestration/RecommendationOrchestrator';
import { InsightOrchestrator } from './layers/l3-intelligence/orchestration/InsightOrchestrator';
import { WorkloadOrchestrator } from './layers/l3-intelligence/orchestration/WorkloadOrchestrator';

// L4 - Controller
import { CommandDispatcher } from './layers/l4-controller';

// Application paths
const APP_DATA_DIR = path.join(app.getPath('userData'), 'CanvasAssistant');
const DB_PATH = path.join(APP_DATA_DIR, 'canvas.db');
const METRICS_DB_PATH = path.join(APP_DATA_DIR, 'metrics.db');
const LOG_DIR = path.join(APP_DATA_DIR, 'logs');
const FILES_DIR = path.join(APP_DATA_DIR, 'files');
const CREDENTIAL_FILE = path.join(APP_DATA_DIR, '.credentials');
const CRASH_FLAG_FILE = path.join(APP_DATA_DIR, '.crash_flag');
const SESSION_STATE_FILE = path.join(APP_DATA_DIR, '.session_state');

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

// Initialize Layer 1 persistence
const database = new Database({ dbPath: DB_PATH, verbose: false });
const migrationRunner = new MigrationRunner(database);

// Initialize Layer 4 controller (after database is ready)
// Note: CommandDispatcher is initialized lazily after database.initialize()
let commandDispatcher: CommandDispatcher | null = null;
let priorityOrchestrator: PriorityOrchestrator | null = null;
let recommendationOrchestrator: RecommendationOrchestrator | null = null;
let insightOrchestrator: InsightOrchestrator | null = null;
let workloadOrchestrator: WorkloadOrchestrator | null = null;

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
    if (lastFocusLostAt && Date.now() - lastFocusLostAt > FOCUS_RESTORE_SYNC_THRESHOLD_MS) {
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
    });

    syncEngine.on('sync-error', ({ type, error }) => {
      metricsCollector.increment(`sync.${type}.errors`);
      logger.error(`Sync error in ${type}: ${error}`);
    });

    // Forward sync conflicts to renderer for user resolution
    syncEngine.on('sync-conflicts', ({ entity, conflicts }) => {
      if (mainWindow && !mainWindow.isDestroyed() && conflicts.length > 0) {
        logger.info(`Sync conflicts detected: ${conflicts.length} ${entity} conflict(s)`);
        mainWindow.webContents.send('sync:conflicts', conflicts);
        metricsCollector.increment(`sync.conflicts.${entity}`);
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
      logger.debug(`User profile received: name=${profile.name}, hasAvatar=${!!profile.avatar_url}`);

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

  // Debug: Direct Canvas API call (for testing)
  ipcMain.handle('canvas:debugFetch', async (_event, endpoint: string) => {
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
  ipcMain.handle('sync:full', async (_event, options?: {
    termSelection?: 'all' | 'auto' | string;
    syncCanvasFiles?: boolean;
    syncAnnouncements?: boolean;
    courseIds?: number[];
  }) => {
    console.debug(`[IPC sync:full] Received options: ${JSON.stringify(options)}`);

    if (!syncEngine) {
      logger.warn('Sync attempted but Canvas client not initialized');
      return { success: false, error: 'Canvas client not initialized. Please reconnect to Canvas.' };
    }

    if (!systemMonitor.getState().canSync) {
      logger.warn('Sync blocked due to system state');
      return { success: false, error: 'Sync disabled due to system state (battery/focus)' };
    }

    const courseIdsStr = options?.courseIds ? `courseIds=[${options.courseIds.length} courses]` : 'courseIds=all';
    logger.info(`Sync requested with options: termSelection=${options?.termSelection ?? 'all'}, syncCanvasFiles=${options?.syncCanvasFiles ?? true}, syncAnnouncements=${options?.syncAnnouncements ?? true}, ${courseIdsStr}`);

    try {
      const result = await syncEngine.syncAll(options);
      logger.info(`Sync completed: ${JSON.stringify(result)}`);
      return { success: true, result };
    } catch (error) {
      logger.error(`Sync failed: ${error}`);
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

  ipcMain.handle('sync:folderFiles', async (_event, params: {
    canvasFolderId: number;
    localCourseId: number;
    forceRefresh?: boolean;
  }) => {
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
  });

  ipcMain.handle('sync:folderByPath', async (_event, params: {
    courseId: number;
    folderPath: string;
  }) => {
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
  ipcMain.handle('data:getEnrollmentTerms', () => {
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
  });

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
    // Only return notifications from courses that are currently synced
    // (exist in courses table) or system notifications (course_id is null)
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
    }>(`
      SELECT n.* FROM notifications n
      LEFT JOIN courses c ON n.course_id = c.id
      WHERE n.course_id IS NULL OR c.id IS NOT NULL
      ORDER BY n.published_at DESC
    `);

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
  });

  // Get a single notification by ID
  ipcMain.handle('data:getNotification', (_event, notificationId: number) => {
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
  });

  // Get a single course by ID
  ipcMain.handle('data:getCourse', (_event, courseId: number) => {
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
  });

  // Get policies for a course
  ipcMain.handle('data:getPolicies', (_event, courseId: number) => {
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
    }>('SELECT * FROM course_policies WHERE course_id = ? AND is_active = 1 ORDER BY policy_type, policy_name', [courseId]);

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
  });

  // Get grade history for a course
  ipcMain.handle('data:getGradeHistory', (_event, courseId: number) => {
    const rows = database.executeRead<{
      id: number;
      course_id: number;
      grade: number;
      recorded_at: string;
    }>('SELECT * FROM grade_history WHERE course_id = ? ORDER BY recorded_at DESC LIMIT 30', [courseId]);

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      grade: row.grade,
      recordedAt: row.recorded_at,
    }));
  });

  // Get all files (resources + notification attachments)
  ipcMain.handle('data:getFiles', () => {
    // Get resources (files synced from Canvas)
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

    // Get pages from course_pages with module info
    const pages = database.executeRead<{
      id: number;
      external_id: string | null;
      course_id: number;
      page_type: string;
      title: string;
      url_slug: string | null;
      body_html: string | null;
      is_front_page: number;
      published: number;
      last_synced_at: string | null;
      module_name: string | null;
    }>(`
      SELECT
        cp.*,
        m.name as module_name
      FROM course_pages cp
      JOIN courses c ON cp.course_id = c.id
      LEFT JOIN module_items mi ON mi.item_type = 'Page' AND mi.content_id = cp.external_id
      LEFT JOIN modules m ON mi.module_id = m.id
      WHERE cp.published = 1
      ORDER BY cp.course_id, m.position, cp.title
    `);

    const downloadedResources = resources.filter(r => r.local_path !== null).length;
    const downloadedAttachments = attachments.filter(a => a.download_status === 'completed').length;
    logger.info(`Found ${resources.length} resources (${downloadedResources} downloaded), ${attachments.length} attachments (${downloadedAttachments} downloaded), and ${pages.length} pages`);

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
      pages: pages.map((p) => ({
        id: p.id,
        externalId: p.external_id,
        courseId: p.course_id,
        pageType: p.page_type,
        title: p.title,
        urlSlug: p.url_slug,
        hasContent: !!p.body_html,
        isFrontPage: p.is_front_page === 1,
        published: p.published === 1,
        lastSyncedAt: p.last_synced_at,
        folderPath: p.module_name || (p.is_front_page ? 'Front Page' : 'Pages'),
        sizeBytes: null,  // Pages don't have a file size
        source: 'page' as const,
      })),
    };
  });

  // Get announcements for a specific course
  ipcMain.handle('data:getCourseNotifications', (_event, courseId: number) => {
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
    }>('SELECT * FROM notifications WHERE course_id = ? ORDER BY published_at DESC', [courseId]);

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

  // Get file references for a notification (with attachment details if linked)
  ipcMain.handle('data:getFileReferences', (_event, notificationId: number) => {
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
      attachment: row.att_id ? {
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
      } : undefined,
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
  ipcMain.handle('attachment:open', (_event, attachmentId: number) => {
    const attachment = database.executeReadOne<{ local_path: string | null; url: string }>(
      'SELECT local_path, url FROM notification_attachments WHERE id = ?',
      [attachmentId]
    );

    console.log('[attachment:open] Attachment:', { attachmentId, localPath: attachment?.local_path, url: attachment?.url });

    if (!attachment?.local_path) {
      console.log('[attachment:open] No local_path, file not downloaded');
      return { success: false, error: 'File not downloaded' };
    }

    // Verify the local path is actually a file path, not a URL
    if (attachment.local_path.startsWith('http://') || attachment.local_path.startsWith('https://')) {
      console.error('[attachment:open] local_path is a URL, not a file path:', attachment.local_path);
      return { success: false, error: 'Invalid local path (URL stored instead of file path)' };
    }

    const fs = require('fs');

    // Check if file exists
    if (!fs.existsSync(attachment.local_path)) {
      console.error('[attachment:open] File does not exist:', attachment.local_path);
      return { success: false, error: 'File not found on disk' };
    }

    // Use spawn with detached to completely decouple from Electron process
    const { spawn } = require('child_process');
    const openCommand = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';

    const child = spawn(openCommand, [attachment.local_path], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref(); // Allow Electron to exit independently

    console.log('[attachment:open] Spawned detached process, returning immediately');
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
      // Validate the path exists or can be created
      if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
      }

      fileDownloadManager.updateBaseDir(newPath);
      logger.info(`Download directory changed to: ${newPath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to set download directory: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Save file with dialog
  ipcMain.handle('file:save', async (_event, options: {
    defaultName: string;
    content: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => {
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
  });

  // Clear synced files data (resources and notification attachments)
  ipcMain.handle('files:clearSync', () => {
    logger.info('Clearing synced files data');
    try {
      database.transaction(() => {
        // Clear resources (Canvas files/folders)
        database.executeWrite('DELETE FROM resources', [], 'resources');
        // Clear notification attachments
        database.executeWrite('DELETE FROM notification_attachments', [], 'notification_attachments');
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

  // Clear all app data (preserves Canvas API token)
  ipcMain.handle('data:clearAll', () => {
    logger.info('Clearing all app data (preserving credentials)');
    try {
      database.transaction(() => {
        // Clear all data tables in dependency order (children first, parents last)
        // Tables with foreign keys to other tables must be deleted before their parents

        // Intelligence/analytics tables (reference tasks/courses)
        database.executeWrite('DELETE FROM message_display_history', [], 'message_display_history');
        database.executeWrite('DELETE FROM field_notification_suppressions', [], 'field_notification_suppressions');
        database.executeWrite('DELETE FROM adaptive_weight_adjustments', [], 'adaptive_weight_adjustments');
        database.executeWrite('DELETE FROM user_insights', [], 'user_insights');
        database.executeWrite('DELETE FROM recommendations', [], 'recommendations');
        database.executeWrite('DELETE FROM workload_snapshots', [], 'workload_snapshots');
        database.executeWrite('DELETE FROM effort_estimations', [], 'effort_estimations');
        database.executeWrite('DELETE FROM user_behavior_patterns', [], 'user_behavior_patterns');
        database.executeWrite('DELETE FROM task_completion_events', [], 'task_completion_events');

        // Content/file reference tables (reference resources/courses)
        database.executeWrite('DELETE FROM html_exports', [], 'html_exports');
        database.executeWrite('DELETE FROM content_file_references', [], 'content_file_references');

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
        database.executeWrite('DELETE FROM announcement_file_references', [], 'announcement_file_references');
        database.executeWrite('DELETE FROM notification_attachments', [], 'notification_attachments');
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
        database.executeWrite('DELETE FROM field_modifications', [], 'field_modifications');
      });
      logger.info('All app data cleared successfully');
      metricsCollector.increment('data.cleared');
      return { success: true };
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
    }>('SELECT * FROM course_pages WHERE course_id = ? ORDER BY is_front_page DESC, title', [courseId]);

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
        bodyText: course.syllabus_body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
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
      const results: Array<{ sourceType: string; sourceId: string; success: boolean; localPath?: string; error?: string }> = [];

      for (const item of params.items) {
        try {
          // Create directory structure: files/{courseCode}/{sourceType}/
          const contextDir = path.join(FILES_DIR, courseCode, item.sourceType.charAt(0).toUpperCase() + item.sourceType.slice(1));
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
          const contentHash = crypto.createHash('md5').update(item.bodyHtml).digest('hex');

          // Update html_exports table
          database.executeWrite(
            `INSERT INTO html_exports (course_id, source_type, source_id, title, content_hash, local_path, exported_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(course_id, source_type, source_id) DO UPDATE SET
               title = excluded.title,
               content_hash = excluded.content_hash,
               local_path = excluded.local_path,
               exported_at = CURRENT_TIMESTAMP`,
            [params.courseId, item.sourceType, item.sourceId, item.title, contentHash, localPath],
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
          logger.error(`Failed to export HTML ${item.sourceType}/${item.sourceId}: ${error}`);
        }
      }

      const successCount = results.filter((r) => r.success).length;
      logger.info(`Batch HTML export: ${successCount}/${params.items.length} items exported for course ${course.code}`);

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
  ipcMain.handle('calendar:parseICSPreview', (_event, content: string, filename: string) => {
    const parser = new ICSParser();
    return parser.createPreview(content, filename);
  });

  // Import ICS calendar
  ipcMain.handle('calendar:importICS', async (_event, params: {
    content: string;
    filename: string;
    name?: string;
    color?: string;
  }) => {
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

      const calendarName = params.name || result.calendarName || params.filename.replace(/\.ics$/i, '');
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

      logger.info(`Imported calendar "${calendarName}" with ${eventCount} events (ID: ${calendarId})`);

      // Verify events were inserted
      const verifyCount = database.executeReadOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM calendar_events WHERE imported_calendar_id = ?',
        [calendarId]
      );
      logger.debug(`[Calendar] Verification: ${verifyCount?.count || 0} events in DB for calendar ${calendarId}`);

      return { success: true, data: { calendarId, eventCount } };
    } catch (error) {
      logger.error(`Failed to import ICS: ${error}`);
      return { success: false, error: String(error) };
    }
  });

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
  ipcMain.handle('calendar:toggleVisibility', async (_event, calendarId: number, isVisible: boolean) => {
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
  });

  // Update calendar metadata
  ipcMain.handle('calendar:updateCalendar', async (_event, calendarId: number, updates: {
    name?: string;
    color?: string;
  }) => {
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
  });

  // Get calendar events for a date range (with RRULE expansion)
  ipcMain.handle('calendar:getEventsForRange', async (_event, params: {
    startDate: string;
    endDate: string;
    includeHidden?: boolean;
  }) => {
    try {
      const rangeStart = new Date(params.startDate);
      const rangeEnd = new Date(params.endDate);

      logger.debug(`[Calendar] Fetching events for range: ${params.startDate} to ${params.endDate}`);

      // First check how many events exist
      const countResult = database.executeReadOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM calendar_events WHERE source_type = ?',
        ['imported']
      );
      logger.debug(`[Calendar] Total imported events in DB: ${countResult?.count || 0}`);

      // Build query based on includeHidden flag
      let sql = `
        SELECT ce.*, ic.name as calendar_name, ic.color as calendar_color, ic.is_visible
        FROM calendar_events ce
        LEFT JOIN imported_calendars ic ON ce.imported_calendar_id = ic.id
        WHERE ce.source_type = 'imported'
      `;

      if (!params.includeHidden) {
        sql += ' AND (ic.is_visible = 1 OR ic.is_visible IS NULL)';
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
        color: (e as typeof events[0]).color || '#6366F1',
        calendarName: (e as typeof events[0]).calendarName,
      }));

      logger.debug(`[Calendar] Returning ${result.length} events to renderer`);
      return result;
    } catch (error) {
      logger.error(`Failed to get calendar events: ${error}`);
      return [];
    }
  });

  // Resource (Canvas file) handlers
  ipcMain.handle('resource:download', async (_event, resourceId: number) => {
    const resource = database.executeReadOne<{
      id: number;
      course_id: number;
      external_id: string;
      title: string;
      url: string | null;
    }>(
      'SELECT * FROM resources WHERE id = ?',
      [resourceId]
    );

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Handle HTML content items (pages, assignments, announcements)
    if (resource.external_id.startsWith('html-') && syncEngine?.['htmlContentSync']) {
      const htmlSync = syncEngine['htmlContentSync'] as import('./layers/l2-daemon/HtmlContentSync').HtmlContentSync;
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

      const onComplete = (result: { id: string; success: boolean; localPath?: string; error?: string }) => {
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
    console.log('[resource:open] START', resourceId);
    const resource = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM resources WHERE id = ?',
      [resourceId]
    );

    if (!resource?.local_path) {
      console.log('[resource:open] No local_path');
      return { success: false, error: 'File not downloaded' };
    }

    console.log('[resource:open] Opening:', resource.local_path);

    // Use spawn with detached to completely decouple from Electron process
    const { spawn } = require('child_process');
    const openCommand = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';

    const child = spawn(openCommand, [resource.local_path], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref(); // Allow Electron to exit independently

    console.log('[resource:open] Spawned detached process, returning immediately');
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

    const { shell } = require('electron');
    shell.showItemInFolder(resource.local_path);
    return { success: true };
  });

  // L4 Command handlers
  ipcMain.handle('command:dispatch', async (_event, commandName: string, params: unknown) => {
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

  ipcMain.handle('intelligence:generateRecommendations', (_event, params?: { availableMinutes?: number }) => {
    if (!recommendationOrchestrator) {
      return [];
    }
    try {
      const recommendations = recommendationOrchestrator.generateRecommendations(params?.availableMinutes);
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
  });

  ipcMain.handle('intelligence:dismissRecommendation', (_event, recommendationId: number) => {
    if (!recommendationOrchestrator) {
      return { success: false, error: 'Recommendation system not initialized' };
    }
    try {
      const dismissed = recommendationOrchestrator.dismissRecommendation(recommendationId);
      return { success: dismissed };
    } catch (error) {
      logger.error('Failed to dismiss recommendation', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:actOnRecommendation', (_event, recommendationId: number) => {
    if (!recommendationOrchestrator) {
      return { success: false, error: 'Recommendation system not initialized' };
    }
    try {
      const acted = recommendationOrchestrator.markRecommendationActed(recommendationId);
      return { success: acted };
    } catch (error) {
      logger.error('Failed to mark recommendation as acted', error as Error);
      return { success: false, error: String(error) };
    }
  });

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

  // ============ Intelligence - Workload ============

  ipcMain.handle('intelligence:getWorkloadDistribution', (_event, params?: { startDate?: string; endDate?: string }) => {
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
  });

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

  ipcMain.handle('intelligence:getClusteringScore', (_event, params?: { windowDays?: number }) => {
    if (!workloadOrchestrator) {
      return 0;
    }
    try {
      return workloadOrchestrator.getClusteringScore(params?.windowDays);
    } catch (error) {
      logger.error('Failed to get clustering score', error as Error);
      return 0;
    }
  });

  // ============ Sync Conflict Handlers ============

  ipcMain.handle('sync:getPendingConflicts', () => {
    if (!syncEngine) {
      return [];
    }
    return syncEngine.getConflictResolver().getPendingConflicts();
  });

  ipcMain.handle('sync:resolveConflict', async (_event, resolution: {
    conflictId: string;
    useCanvasValue: boolean;
    rememberChoice: boolean;
    rememberForAll: boolean;
  }) => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not initialized' };
    }

    try {
      const result = syncEngine.getConflictResolver().resolveConflict(resolution);
      if (result) {
        // Apply the resolution to the database
        const conflict = syncEngine.getConflictResolver().getPendingConflicts()
          .find(c => c.id === resolution.conflictId);
        if (conflict) {
          const tableName = conflict.entity === 'course' ? 'courses' :
                           conflict.entity === 'task' ? 'tasks' : 'notifications';
          database.executeWrite(
            `UPDATE ${tableName} SET ${result.field} = ? WHERE id = ?`,
            [result.value, conflict.entityId],
            tableName
          );

          // Clear the modified flag if using Canvas value
          if (resolution.useCanvasValue) {
            syncEngine.getConflictResolver().clearFieldModified(tableName, conflict.entityId, result.field);
          }
        }
      }
      return { success: true };
    } catch (error) {
      logger.error(`Failed to resolve sync conflict: ${error}`);
      return { success: false, error: String(error) };
    }
  });

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
            const tableName = conflict.entity === 'course' ? 'courses' :
                             conflict.entity === 'task' ? 'tasks' : 'notifications';
            database.executeWrite(
              `UPDATE ${tableName} SET ${result.field} = ? WHERE id = ?`,
              [result.value, conflict.entityId],
              tableName
            );

            // Clear the modified flag if using Canvas value
            if (useCanvasValues) {
              conflictResolver.clearFieldModified(tableName, conflict.entityId, result.field);
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

  ipcMain.handle('sync:deleteSyncPreference', (_event, entity: string, entityId: number | null, field: string) => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not initialized' };
    }

    try {
      syncEngine.getConflictResolver().deletePreference(entity, entityId, field);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
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
      return { autoSyncEnabled: true, autoSyncInterval: 15 };
    } catch (e) {
      return { autoSyncEnabled: true, autoSyncInterval: 15 };
    }
  });

  ipcMain.handle('sync:setAutoSyncPreferences', (_event, prefs: { autoSyncEnabled: boolean; autoSyncInterval: number }) => {
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

      logger.info(`Auto-sync preferences updated: enabled=${prefs.autoSyncEnabled}, interval=${prefs.autoSyncInterval}min`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to save auto-sync preferences:', error as Error);
      return { success: false, error: String(error) };
    }
  });

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

  ipcMain.handle('data:exportCourseData', async (_event, params?: { courseIds?: number[]; includeFiles?: boolean }) => {
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

      // Fetch courses
      const courses = database.executeRead<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        nickname: string | null;
        color: string | null;
        workflow_state: string | null;
        enrollment_term_id: number | null;
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

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        courses: courses.map((c) => ({
          id: c.id,
          externalId: c.external_id,
          code: c.code,
          name: c.name,
          nickname: c.nickname,
          color: c.color,
          workflowState: c.workflow_state,
          enrollmentTermId: c.enrollment_term_id,
        })),
        tasks,
        notifications,
        pages,
        policies,
        resources: resources.map((r) => ({
          ...r,
          localPath: undefined, // Don't include local paths in export
        })),
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
  });

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
        return { success: false, error: 'Invalid export file format. Missing version or courses.' };
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

      // Import tasks
      if (Array.isArray(importData.tasks)) {
        for (const task of importData.tasks) {
          const oldCourseId = task.course_id || task.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          database.upsert(
            'tasks',
            {
              external_id: task.external_id || task.externalId,
              course_id: newCourseId,
              title: task.title,
              description: task.description,
              due_at: task.due_at || task.dueAt,
              weight: task.weight || 0,
              grade: task.grade,
              points_possible: task.points_possible || task.pointsPossible,
              priority_score: task.priority_score || task.priorityScore || 0,
              is_completed: task.is_completed || task.isCompleted || 0,
              completed_at: task.completed_at || task.completedAt,
              submission_status: task.submission_status || task.submissionStatus,
              task_type: task.task_type || task.taskType,
              task_group_id: task.task_group_id || task.taskGroupId,
            },
            'external_id'
          );
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
              is_front_page: page.is_front_page || page.isFrontPage || page.front_page || page.frontPage || 0,
            },
            'external_id'
          );
          pagesImported++;
        }
      }

      // Import policies
      if (Array.isArray(importData.policies)) {
        for (const policy of importData.policies) {
          const oldCourseId = policy.course_id || policy.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          database.upsert(
            'course_policies',
            {
              course_id: newCourseId,
              policy_type: policy.policy_type || policy.policyType,
              policy_name: policy.policy_name || policy.policyName || 'imported',
              policy_config: policy.policy_config || policy.policyConfig || JSON.stringify({ value: policy.value }),
              raw_text: policy.raw_text || policy.rawText,
            },
            ['course_id', 'policy_type', 'policy_name']
          );
          policiesImported++;
        }
      }

      // Import resources (without local paths)
      if (Array.isArray(importData.resources)) {
        for (const resource of importData.resources) {
          const oldCourseId = resource.course_id || resource.courseId;
          const newCourseId = mapCourseId(oldCourseId);
          if (!newCourseId) continue; // Skip if no valid course

          database.upsert(
            'resources',
            {
              external_id: resource.external_id || resource.externalId,
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
          resourcesImported++;
        }
      }

      logger.info(`Data imported from: ${filePath} (${coursesImported} courses, ${tasksImported} tasks, ${notificationsImported} notifications, ${pagesImported} pages, ${policiesImported} policies, ${resourcesImported} resources)`);
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
}

// ============ Crash Protection ============

/**
 * Write crash flag to disk on unexpected exit
 */
function writeCrashFlag(reason: string): void {
  try {
    const crashData = {
      timestamp: new Date().toISOString(),
      reason,
      pid: process.pid,
      platform: process.platform,
    };
    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CRASH_FLAG_FILE, JSON.stringify(crashData, null, 2));
  } catch (e) {
    // Cannot log, just ignore
  }
}

/**
 * Clear crash flag on clean exit
 */
function clearCrashFlag(): void {
  try {
    if (fs.existsSync(CRASH_FLAG_FILE)) {
      fs.unlinkSync(CRASH_FLAG_FILE);
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Check if previous session crashed
 */
function checkCrashFlag(): { crashed: boolean; data?: { timestamp: string; reason: string } } {
  try {
    if (fs.existsSync(CRASH_FLAG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CRASH_FLAG_FILE, 'utf-8'));
      return { crashed: true, data };
    }
  } catch (e) {
    // Ignore
  }
  return { crashed: false };
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
    } catch (e) {
      clearTimeout(timeout);
    }
  } catch (e) {
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
process.on('unhandledRejection', (reason, promise) => {
  writeCrashFlag(`unhandledRejection: ${reason}`);
  logger.error('Unhandled Rejection:', reason instanceof Error ? reason : new Error(String(reason)));
  // Don't exit on unhandled rejection, just log
});

// ============ Auto-Sync ============

/**
 * Start the auto-sync scheduler based on user settings
 */
function startAutoSync(): void {
  stopAutoSync(); // Clear any existing interval

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
  } catch (e) {
    // Use defaults
  }

  if (!autoSyncEnabled) {
    logger.info('Auto-sync is disabled');
    return;
  }

  logger.info(`Auto-sync enabled, interval: ${autoSyncIntervalMs / 60000} minutes`);

  autoSyncInterval = setInterval(async () => {
    if (!syncEngine || !systemMonitor.getState().canSync) {
      logger.debug('Auto-sync skipped: sync engine not ready or system state prevents sync');
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

app.whenReady().then(async () => {
  logger.info('Canvas Integration Dashboard starting...');
  logger.info(`Platform: ${process.platform}, Electron: ${process.versions.electron}`);
  logger.info(`Data directory: ${APP_DATA_DIR}`);

  // Check for previous crash
  const crashCheck = checkCrashFlag();
  if (crashCheck.crashed && crashCheck.data) {
    logger.warn(`Previous session crashed at ${crashCheck.data.timestamp}: ${crashCheck.data.reason}`);
    metricsCollector.increment('app.crash_recovery');
    // Clear the crash flag since we've detected it
    clearCrashFlag();
  }

  // Write crash flag - will be cleared on clean exit
  writeCrashFlag('session_start');

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

    // Initialize L4 CommandDispatcher now that database is ready
    commandDispatcher = new CommandDispatcher({ db: database });

    // Initialize L3 PriorityOrchestrator
    priorityOrchestrator = new PriorityOrchestrator(database, {
      refreshIntervalMs: 15 * 60 * 1000, // 15 minutes
      autoRefresh: true,
    });

    // Initialize L3 Intelligence Orchestrators
    recommendationOrchestrator = new RecommendationOrchestrator(database, {
      refreshIntervalMs: 30 * 60 * 1000, // 30 minutes
      autoRefresh: true,
    });

    insightOrchestrator = new InsightOrchestrator(database, {
      refreshIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
      autoRefresh: true,
    });

    workloadOrchestrator = new WorkloadOrchestrator(database, {
      defaultAvailableHoursPerDay: 4,
      defaultLookAheadDays: 14,
    });

    logger.info('L3 Intelligence orchestrators initialized');

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

      // Start auto-sync scheduler after Canvas client is ready
      startAutoSync();
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

  // Stop auto-sync scheduler
  stopAutoSync();

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
  systemMonitor.stop();
  healthCheck.stop();
  metricsCollector.stop();
  housekeepingManager.stop();
  circuitBreaker.stop();

  // Close database with timeout protection
  const closeTimeout = setTimeout(() => {
    logger.warn('Database close timed out');
  }, 2000);
  try {
    database.close();
    clearTimeout(closeTimeout);
  } catch (e) {
    clearTimeout(closeTimeout);
    logger.error('Database close failed:', e as Error);
  }

  logger.close();
});
