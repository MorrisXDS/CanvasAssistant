/**
 * IPC Handler Context
 * Provides dependencies to IPC handlers in a decoupled way
 */

import type { BrowserWindow } from 'electron';
import type { Database } from '../../layers/l1-persistence';
import type { Logger } from '../../layers/l0-utilities/Logger';
import type { MetricsCollector } from '../../layers/l0-utilities/MetricsCollector';
import type { CredentialManager } from '../../layers/l0-utilities/CredentialManager';
import type { FileDownloadManager } from '../../layers/l0-utilities/FileDownloadManager';
import type { HealthCheck } from '../../layers/l0-utilities/HealthCheck';
import type { SystemMonitor } from '../../layers/l0-utilities/SystemMonitor';
import type {
  SyncEngine,
  CanvasClient,
  OperationCoordinator,
} from '../../layers/l2-daemon';
import type { UpdateChecker } from '../../layers/l2-daemon/update/UpdateChecker';
import type { CommandDispatcher } from '../../layers/l4-controller';
import type { VisibilityOracle, FileEntityProvider } from '../../layers/l1-persistence';
import type { CrashProtectionManager } from '../CrashProtectionManager';

/**
 * Context object providing access to all dependencies needed by IPC handlers.
 * Uses getter functions to handle lazy initialization and nullable references.
 */
export interface IpcContext {
  // Window
  getMainWindow: () => BrowserWindow | null;

  // Core services
  getDatabase: () => Database;
  getLogger: () => Logger;
  getMetricsCollector: () => MetricsCollector;
  getCredentialManager: () => CredentialManager;
  getFileDownloadManager: () => FileDownloadManager;
  getHealthCheck: () => HealthCheck;
  getSystemMonitor: () => SystemMonitor;

  // L1 - Persistence
  getVisibilityOracle: () => VisibilityOracle | null;
  getFileEntityProvider: () => FileEntityProvider | null;

  // L2 - Daemon
  getCanvasClient: () => CanvasClient | null;
  getSyncEngine: () => SyncEngine | null;
  getOperationCoordinator: () => OperationCoordinator | null;
  /** Optional — only set when the update checker is wired in AppLifecycle. */
  getUpdateChecker?: () => UpdateChecker | null;

  // State modifiers (for credential/canvas handlers)
  clearCanvasClient: () => void;
  initializeCanvasClient: (token: string, baseUrl: string) => Promise<boolean>;

  // Settings helpers
  getWindowBehavior: () => {
    closeAction: 'quit' | 'minimize-to-tray' | null;
    showTrayIcon: boolean;
  };
  setWindowBehavior: (settings: {
    closeAction: 'quit' | 'minimize-to-tray' | null;
    showTrayIcon: boolean;
  }) => void;
  getLocalHtmlPathsSettings: () => {
    enabled: boolean;
    autoRegenerate: boolean;
    promptForMissing: boolean;
  };
  getIsQuitting: () => boolean;
  setIsQuitting: (value: boolean) => void;

  // Path and app info getters
  getConfigDir: () => string;
  getFilesDir: () => string;
  getDbPath: () => string;
  getBackupDir: () => string;
  getAppVersion: () => string;

  // Sync preferences
  getSyncPreferences: () => {
    autoSyncEnabled: boolean;
    autoSyncInterval: number;
    syncFiles: boolean;
    syncAnnouncements: boolean;
    autoAssignDueDate: boolean;
    saveHtmlContent: boolean;
    htmlUrlRewriting: 'local' | 'original';
    downloadImages: boolean;
    downloadLinkedFiles: boolean;
  };
  startAutoSync: () => void;
  stopAutoSync: () => void;

  // L4 - Controller
  getCommandDispatcher: () => CommandDispatcher | null;

  // Crash protection
  getCrashProtectionManager: () => CrashProtectionManager;
  getAppDataDir: () => string;
  getDatabaseCorruptionDetected: () => { errors: string[]; canContinue: boolean } | null;
  setDatabaseCorruptionDetected: (
    value: { errors: string[]; canContinue: boolean } | null
  ) => void;

  // Window management
  resetWindowSize: () => void;

  // Tray management
  createTray: () => void;
  destroyTray: () => void;

  // App state management
  resetAppState: (options: { deleteToken: boolean }) => Promise<void>;
}

/**
 * Helper type for handler registration functions
 */
export type IpcHandlerRegistrar = (ctx: IpcContext) => void;
