/**
 * Reset App State
 * Clears database, files, credentials, and in-memory clients.
 * This is the single source of truth for full app reset.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import type { Database } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';
import type { MetricsCollector } from '../layers/l0-utilities/MetricsCollector';
import type { CredentialManager } from '../layers/l0-utilities/CredentialManager';
import type { FileWatcher } from '../layers/l0-utilities/FileWatcher';
import type { SyncEngine } from '../layers/l2-daemon';
import type { CanvasClientManager } from '../CanvasClientManager';

export interface ResetAppStateDeps {
  database: Database;
  logger: Logger;
  metricsCollector: MetricsCollector;
  credentialManager: CredentialManager;
  fileWatcher: FileWatcher;
  configDir: string;
  filesDir: string;
  getMainWindow: () => BrowserWindow | null;
  getSyncEngine: () => SyncEngine | null;
  canvasClientManager: CanvasClientManager | null;
}

/**
 * Reset all application state - clears database, files, credentials, and in-memory clients.
 */
export async function resetAppState(
  deps: ResetAppStateDeps,
  options: { deleteToken: boolean }
): Promise<void> {
  const {
    database,
    logger,
    metricsCollector,
    credentialManager,
    fileWatcher,
    configDir,
    filesDir,
    getMainWindow,
    getSyncEngine,
    canvasClientManager,
  } = deps;
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

  if (fs.existsSync(filesDir)) {
    try {
      fs.rmSync(filesDir, { recursive: true, force: true });
      fs.mkdirSync(filesDir, { recursive: true }); // Recreate empty directory
      logger.info('Downloaded files deleted');
    } catch (err) {
      logger.error(`Failed to delete files directory: ${err}`);
    }
  }

  // Restart FileWatcher to monitor the recreated directory
  fileWatcher.start();

  // 3b. Reset window behavior settings (clear minimize-to-tray preference)
  const windowBehaviorPath = path.join(configDir, 'window-behavior.json');
  if (fs.existsSync(windowBehaviorPath)) {
    try {
      fs.unlinkSync(windowBehaviorPath);
      logger.info('Window behavior settings reset');
    } catch (err) {
      logger.error(`Failed to delete window behavior settings: ${err}`);
    }
  }

  // 3c. Reset window state (clear saved window size/position)
  const windowStatePath = path.join(configDir, 'window-state.json');
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
