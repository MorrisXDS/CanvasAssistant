/**
 * Lifecycle Module Index
 * Re-exports all lifecycle utilities and the AppLifecycle class.
 */

export {
  APP_ROOT,
  INSTALL_DIR,
  CONFIG_DIR,
  LOG_DIR,
  PROJECT_DB_DIR,
  BACKUP_DIR,
  FILES_DIR,
  DB_PATH,
  METRICS_DB_PATH,
  APP_DATA_DIR,
  CREDENTIAL_FILE,
  ensureDirectories,
} from './appPaths';
export {
  getWindowBehavior,
  setWindowBehavior,
  getSyncPreferences,
  getLocalHtmlPathsSettings,
} from './appSettings';
export type {
  WindowBehaviorSettings,
  SyncPreferences,
  LocalHtmlPathsSettings,
} from './appSettings';
export { savePendingDownloads, restorePendingDownloads } from './downloadPersistence';
export { resetAppState } from './resetAppState';
export type { ResetAppStateDeps } from './resetAppState';
export { AppLifecycle } from './AppLifecycle';
export type { AppLifecycleConfig } from './AppLifecycle';

// Managers & Protocols
export { WindowManager } from './WindowManager';
export type { WindowManagerConfig } from './WindowManager';
export { CrashProtectionManager } from './CrashProtectionManager';
export { CanvasClientManager } from './CanvasClientManager';
export { BackupManager } from './BackupManager';
export { registerCanvasFileProtocol } from './canvasFileProtocol';
export { AutoSyncManager } from './AutoSyncManager';

// IPC Handlers
export * from './ipc-handlers';
