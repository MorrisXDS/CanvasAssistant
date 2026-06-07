/**
 * Canvas Client Manager
 * Handles Canvas API client and sync engine initialization and event forwarding
 */

import { Notification, powerMonitor, type BrowserWindow } from 'electron';
import { shouldSuppressNotification } from './notifications/shouldSuppressNotification';
import type { Database } from '../layers/l1-persistence';
import type { VisibilityOracle } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';
import type { MetricsCollector } from '../layers/l0-utilities/MetricsCollector';
import type { CredentialManager } from '../layers/l0-utilities/CredentialManager';
import type { FileDownloadManager } from '../layers/l0-utilities/FileDownloadManager';
import type { OperationCoordinator } from '../layers/l2-daemon';
import {
  CanvasClient,
  SyncEngine,
  RateLimiter,
  CircuitBreaker,
} from '../layers/l2-daemon';

interface NotificationSettings {
  enabled: boolean;
  syncStatus: boolean;
  dueDateReminders: boolean;
  gradeAlerts: boolean;
  quietWhenUnplugged: boolean;
}

/** Notification "kind" → the per-kind enable flag that gates it. */
type NotificationKind = 'sync' | 'dueDate' | 'grade';

/**
 * Get notification settings from user_preferences in the database.
 *
 * Raw read is allowed here: this is lifecycle code, NOT under
 * `src/lifecycle/ipc-handlers/` (ADR-0007 applies to the handler folder only).
 * Fields default to the safe value when a key is absent so old/partial rows
 * (e.g. pre-ADR-0016 rows still carrying quietWhenFullscreen/quietWhenBusy)
 * read cleanly.
 */
function getNotificationSettings(db: Database): NotificationSettings | null {
  try {
    const prefs = db.executeReadOne<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'notificationSettings'"
    );
    if (prefs?.value) {
      const raw = JSON.parse(prefs.value) as Partial<NotificationSettings>;
      return {
        enabled: raw.enabled ?? false,
        syncStatus: raw.syncStatus ?? false,
        dueDateReminders: raw.dueDateReminders ?? false,
        gradeAlerts: raw.gradeAlerts ?? false,
        quietWhenUnplugged: raw.quietWhenUnplugged ?? false,
      };
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
  getVisibilityOracle: () => VisibilityOracle | null;
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
   * Single show seam for ALL desktop notifications (sync status, due-date
   * reminders, grade alerts). Every notification passes through here so the
   * per-kind enable gate AND the pure suppression predicate apply uniformly
   * (ADR-0016). Do NOT construct `new Notification(...).show()` anywhere else.
   *
   * Returns true if the notification was shown, false if gated/suppressed
   * (mainly to make the seam observable to tests + callers).
   */
  showDesktopNotification(title: string, body: string, kind: NotificationKind): boolean {
    const settings = getNotificationSettings(this.config.database);
    if (!settings?.enabled) return false;

    // Per-kind enable gate.
    const kindEnabled =
      kind === 'sync'
        ? settings.syncStatus
        : kind === 'dueDate'
          ? settings.dueDateReminders
          : settings.gradeAlerts;
    if (!kindEnabled) return false;

    // Pure suppression predicate fed by live system state.
    const onBatteryPower = (() => {
      try {
        return powerMonitor.isOnBatteryPower();
      } catch {
        // powerMonitor can be unavailable in headless/test contexts — treat as
        // plugged in so notifications are NOT suppressed by a read failure.
        return false;
      }
    })();
    if (shouldSuppressNotification(settings, { onBatteryPower })) {
      return false;
    }

    new Notification({ title, body }).show();
    return true;
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
      getVisibilityOracle,
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
        visibilityOracle: getVisibilityOracle() ?? undefined,
        operationCoordinator: getOperationCoordinator() ?? undefined,
      });

      // Forward sync events to metrics and renderer
      this.setupSyncEventHandlers(
        logger,
        metricsCollector,
        getMainWindow,
        getVisibilityOracle
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
    getVisibilityOracle: () => VisibilityOracle | null
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

      // Invalidate VisibilityOracle cache so new courses appear immediately
      const visibilityOracle = getVisibilityOracle();
      if (visibilityOracle) {
        visibilityOracle.invalidateCache();
        logger.debug('VisibilityOracle cache invalidated after sync');
      }

      // Desktop notification for sync complete (routed through the single seam).
      const coursesCount = result.courses?.count ?? 0;
      const tasksCount = result.tasks?.count ?? 0;
      this.showDesktopNotification(
        'Sync Complete',
        `Updated ${coursesCount} courses, ${tasksCount} tasks`,
        'sync'
      );
    });

    this.syncEngine.on('sync-error', ({ type, error }) => {
      metricsCollector.increment(`sync.${type}.errors`);
      logger.error(`Sync error in ${type}: ${error}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:error', { type, error });
      }

      // Desktop notification for sync error (routed through the single seam).
      const errorMessage =
        typeof error === 'string' ? error : (error?.message ?? 'Unknown error');
      this.showDesktopNotification(
        'Sync Failed',
        `Error during ${type}: ${errorMessage}`,
        'sync'
      );
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
      if (reason === 'manual_abort') {
        logger.info(`Sync cancelled by user`);
      } else {
        logger.error(`Sync aborted: ${reason} - ${error}`);
      }
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

      // Grade alerts (ADR-0016): the commit-phase sync-updates payload carries a
      // `gradeChanges` count (resource-update emits do not — hence `?? 0`). Fire
      // ONE batched notification through the single show seam, which applies the
      // `enabled && gradeAlerts` gate + suppression. Batched (not per-grade) =
      // zero new query, no toast spam.
      const gradeChanges = (updates as { gradeChanges?: number }).gradeChanges ?? 0;
      if (gradeChanges > 0) {
        const body =
          gradeChanges === 1 ? '1 new grade posted' : `${gradeChanges} new grades posted`;
        this.showDesktopNotification('New grades', body, 'grade');
      }

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
