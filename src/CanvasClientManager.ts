/**
 * Canvas Client Manager
 * Handles Canvas API client and sync engine initialization and event forwarding
 */

import { Notification, type BrowserWindow } from 'electron';
import type { Database } from './layers/l1-persistence';
import type { VisibleDataProvider } from './layers/l1-persistence';
import type { Logger } from './layers/l0-utilities/Logger';
import type { MetricsCollector } from './layers/l0-utilities/MetricsCollector';
import type { CredentialManager } from './layers/l0-utilities/CredentialManager';
import type { FileDownloadManager } from './layers/l0-utilities/FileDownloadManager';
import type { OperationCoordinator } from './layers/l2-daemon';
import {
  CanvasClient,
  SyncEngine,
  RateLimiter,
  CircuitBreaker,
} from './layers/l2-daemon';

interface NotificationSettings {
  enabled: boolean;
  syncStatus: boolean;
  // other fields exist but not needed for sync notifications
}

/**
 * Get notification settings from user_preferences in the database
 */
function getNotificationSettings(db: Database): NotificationSettings | null {
  try {
    const prefs = db.executeReadOne<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'notificationSettings'"
    );
    if (prefs?.value) {
      return JSON.parse(prefs.value);
    }
  } catch {
    // Fall through
  }
  return null;
}

export interface CanvasClientManagerConfig {
  database: Database;
  logger: Logger;
  metricsCollector: MetricsCollector;
  credentialManager: CredentialManager;
  rateLimiter: RateLimiter;
  circuitBreaker: CircuitBreaker;
  fileDownloadManager: FileDownloadManager;
  filesDir: string;
  getMainWindow: () => BrowserWindow | null;
  getVisibleDataProvider: () => VisibleDataProvider | null;
  getOperationCoordinator: () => OperationCoordinator | null;
  getSyncPreferences: () => {
    saveHtmlContent: boolean;
    htmlUrlRewriting: 'local' | 'original';
    downloadImages: boolean;
    downloadLinkedFiles: boolean;
  };
}

export class CanvasClientManager {
  private config: CanvasClientManagerConfig;
  private canvasClient: CanvasClient | null = null;
  private syncEngine: SyncEngine | null = null;

  constructor(config: CanvasClientManagerConfig) {
    this.config = config;
  }

  /**
   * Get the current Canvas client instance
   */
  getCanvasClient(): CanvasClient | null {
    return this.canvasClient;
  }

  /**
   * Get the current sync engine instance
   */
  getSyncEngine(): SyncEngine | null {
    return this.syncEngine;
  }

  /**
   * Clear the Canvas client and sync engine instances
   */
  clear(): void {
    this.canvasClient = null;
    this.syncEngine = null;
  }

  /**
   * Initialize Canvas client with the given token and URL
   */
  async initialize(token: string, baseUrl: string): Promise<boolean> {
    const {
      database,
      logger,
      metricsCollector,
      credentialManager,
      rateLimiter,
      circuitBreaker,
      fileDownloadManager,
      filesDir,
      getMainWindow,
      getVisibleDataProvider,
      getOperationCoordinator,
      getSyncPreferences,
    } = this.config;

    try {
      this.canvasClient = new CanvasClient({
        baseUrl,
        accessToken: token,
        onRateLimit: (remaining: number) => rateLimiter.updateRateLimit(remaining),
      });

      // Validate the token
      const validation = await circuitBreaker.execute(() =>
        this.canvasClient!.validateToken()
      );

      if (!validation.valid) {
        logger.error(`Canvas token validation failed: ${validation.error}`);
        this.canvasClient = null;
        return false;
      }

      logger.info(`Canvas client initialized for user: ${validation.user?.name}`);
      metricsCollector.increment('canvas.auth.success');

      // Listen for auth errors (token expiration/invalidation)
      this.canvasClient.on('auth-error', (error) => {
        logger.warn(`Canvas auth error detected: ${error.message}`);
        metricsCollector.increment('canvas.auth.expired');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth:expired', { reason: error.message });
        }
      });

      // Read sync preferences from database for dynamic configuration
      const syncPrefs = getSyncPreferences();

      // Initialize sync engine with HTML content sync and visibility filtering
      this.syncEngine = new SyncEngine({
        client: this.canvasClient,
        db: database,
        rateLimiter,
        downloadManager: fileDownloadManager,
        filesBaseDir: filesDir,
        htmlContentSyncConfig: {
          enabled: syncPrefs.saveHtmlContent,
          urlRewriting: syncPrefs.htmlUrlRewriting,
          downloadImages: syncPrefs.downloadImages,
          downloadLinkedFiles: syncPrefs.downloadLinkedFiles,
          maxConcurrentDownloads: 3,
        },
        logger: logger.child('SyncEngine'),
        visibleDataProvider: getVisibleDataProvider() ?? undefined,
        operationCoordinator: getOperationCoordinator() ?? undefined,
      });

      // Forward sync events to metrics and renderer
      this.setupSyncEventHandlers(
        logger,
        metricsCollector,
        getMainWindow,
        getVisibleDataProvider
      );

      // Start background token validation to detect expired/revoked tokens
      credentialManager.startBackgroundValidation();

      // Listen for token invalidation events
      credentialManager.on('token-invalid', ({ reason }) => {
        logger.warn(`Token invalid: ${reason}`);
        metricsCollector.increment('canvas.token.invalid');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth:expired', { reason });
        }
      });

      return true;
    } catch (error) {
      logger.error(`Failed to initialize Canvas client: ${error}`);
      metricsCollector.increment('canvas.auth.failure');
      this.canvasClient = null;
      this.syncEngine = null;
      return false;
    }
  }

  /**
   * Set up sync engine event handlers for metrics and renderer forwarding
   */
  private setupSyncEventHandlers(
    logger: Logger,
    metricsCollector: MetricsCollector,
    getMainWindow: () => BrowserWindow | null,
    getVisibleDataProvider: () => VisibleDataProvider | null
  ): void {
    if (!this.syncEngine) return;

    this.syncEngine.on('sync-start', ({ type }) => {
      metricsCollector.increment(`sync.${type}.started`);
      logger.info(`Sync started: ${type}`);
    });

    this.syncEngine.on('sync-complete', (result) => {
      metricsCollector.increment('sync.full.completed');
      metricsCollector.recordTiming('sync.full.duration', result.totalDuration);
      logger.info(`Sync completed in ${result.totalDuration}ms`);

      // Invalidate VisibleDataProvider cache so new courses appear immediately
      const visibleDataProvider = getVisibleDataProvider();
      if (visibleDataProvider) {
        visibleDataProvider.invalidateCache();
        logger.debug('VisibleDataProvider cache invalidated after sync');
      }

      // Desktop notification for sync complete
      const notifSettings = getNotificationSettings(this.config.database);
      if (notifSettings?.enabled && notifSettings?.syncStatus) {
        const coursesCount = result.courses?.count ?? 0;
        const tasksCount = result.tasks?.count ?? 0;
        new Notification({
          title: 'Sync Complete',
          body: `Updated ${coursesCount} courses, ${tasksCount} tasks`,
        }).show();
      }
    });

    this.syncEngine.on('sync-error', ({ type, error }) => {
      metricsCollector.increment(`sync.${type}.errors`);
      logger.error(`Sync error in ${type}: ${error}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:error', { type, error });
      }

      // Desktop notification for sync error
      const notifSettings = getNotificationSettings(this.config.database);
      if (notifSettings?.enabled && notifSettings?.syncStatus) {
        const errorMessage =
          typeof error === 'string' ? error : (error?.message ?? 'Unknown error');
        new Notification({
          title: 'Sync Failed',
          body: `Error during ${type}: ${errorMessage}`,
        }).show();
      }
    });

    this.syncEngine.on(
      'sync-entity-error',
      ({ entity, externalId, error, courseName }) => {
        metricsCollector.increment(`sync.entity.${entity}.errors`);
        logger.warn(`Sync entity error: ${entity} (${externalId}): ${error}`);
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:entityError', {
            entity,
            externalId,
            error,
            courseName,
          });
        }
      }
    );

    this.syncEngine.on('sync-progress', (progress) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:progress', progress);
      }
    });

    this.syncEngine.on('sync-phase', ({ phase, status }) => {
      logger.info(`Sync phase ${phase}: ${status}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:phase', { phase, status });
      }
    });

    this.syncEngine.on('sync-aborted', ({ reason, error }) => {
      logger.error(`Sync aborted: ${reason} - ${error}`);
      metricsCollector.increment('sync.aborted');
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:aborted', { reason, error });
      }
    });

    this.syncEngine.on('sync-conflicts', ({ entity, conflicts }) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && conflicts.length > 0) {
        logger.info(`Sync conflicts detected: ${conflicts.length} ${entity} conflict(s)`);
        mainWindow.webContents.send('sync:conflicts', conflicts);
        metricsCollector.increment(`sync.conflicts.${entity}`);
      }
    });

    this.syncEngine.on('sync-updates', (updates) => {
      logger.info(
        `[CanvasClientManager] Received sync-updates event: ${JSON.stringify(updates)}`
      );
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && updates.total > 0) {
        logger.info(
          `[CanvasClientManager] Sending sync:updates to renderer with total: ${updates.total}`
        );
        mainWindow.webContents.send('sync:updates', {
          type: 'sync-complete',
          totalUnseen: updates.total,
          conflictCount: 0, // Conflicts handled separately
        });
      } else {
        logger.info(
          `[CanvasClientManager] Not sending to renderer - window: ${!!mainWindow}, total: ${updates.total}`
        );
      }
    });
  }
}
