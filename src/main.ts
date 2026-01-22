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
    minWidth: 900,
    minHeight: 600,
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

    syncEngine.on('sync-complete', (result) => {
      metricsCollector.increment('sync.full.completed');
      metricsCollector.recordTiming('sync.full.duration', result.totalDuration);
      logger.info(`Sync completed in ${result.totalDuration}ms`);
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

  // Sync operations
  ipcMain.handle('sync:full', async (_event, options?: {
    courseIds?: number[];
    syncCanvasFiles?: boolean;
    syncAnnouncements?: boolean;
  }) => {
    if (!syncEngine) {
      logger.warn('Sync attempted but Canvas client not initialized');
      return { success: false, error: 'Canvas client not initialized. Please reconnect to Canvas.' };
    }

    if (!systemMonitor.getState().canSync) {
      logger.warn('Sync blocked due to system state');
      return { success: false, error: 'Sync disabled due to system state (battery/focus)' };
    }

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

  // Get a single notification by ID
  ipcMain.handle('data:getNotification', (_event, notificationId: number) => {
    const row = database.executeReadOne<{
      id: number;
      source_type: string;
      source_id: string;
      course_id: number | null;
      title: string;
      message: string;
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
    logger.info('Fetching files from database');
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
      WHERE r.type = 'file'
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

    logger.info(`Found ${resources.length} resources and ${attachments.length} attachments`);

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
  ipcMain.handle('attachment:open', async (_event, attachmentId: number) => {
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

    const { shell } = require('electron');
    const fs = require('fs');

    // Check if file exists
    if (!fs.existsSync(attachment.local_path)) {
      console.error('[attachment:open] File does not exist:', attachment.local_path);
      return { success: false, error: 'File not found on disk' };
    }

    try {
      const result = await shell.openPath(attachment.local_path);
      console.log('[attachment:open] shell.openPath result:', result || 'success (empty string)');
      if (result) {
        // shell.openPath returns error string on failure, empty string on success
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      console.error('[attachment:open] Error:', error);
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

  // Files directory handlers
  ipcMain.handle('files:getDirectory', () => {
    return { path: FILES_DIR };
  });

  ipcMain.handle('files:openDirectory', () => {
    const { shell } = require('electron');

    // Ensure directory exists
    if (!fs.existsSync(FILES_DIR)) {
      fs.mkdirSync(FILES_DIR, { recursive: true });
    }

    shell.openPath(FILES_DIR);
    return { success: true };
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

  ipcMain.handle('resource:open', async (_event, resourceId: number) => {
    const resource = database.executeReadOne<{ local_path: string | null }>(
      'SELECT local_path FROM resources WHERE id = ?',
      [resourceId]
    );

    if (!resource?.local_path) {
      return { success: false, error: 'File not downloaded' };
    }

    const { shell } = require('electron');
    const result = await shell.openPath(resource.local_path);
    if (result) {
      return { success: false, error: result };
    }
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
