/**
 * Application Settings
 * Pure functions for reading/writing settings from config files and database.
 */

import fs from 'fs';
import path from 'path';
import type { Database } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';

// Window behavior settings type (must match renderer settings schema)
export interface WindowBehaviorSettings {
  closeAction: 'quit' | 'minimize-to-tray' | null;
  showTrayIcon: boolean;
}

// Default window behavior settings
const DEFAULT_WINDOW_BEHAVIOR: WindowBehaviorSettings = {
  closeAction: null, // null = not yet chosen, will prompt on first close
  showTrayIcon: true,
};

/**
 * Get window behavior settings from config directory.
 */
export function getWindowBehavior(configDir: string): WindowBehaviorSettings {
  const settingsPath = path.join(configDir, 'window-behavior.json');
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

/**
 * Save window behavior settings to config directory.
 */
export function setWindowBehavior(
  configDir: string,
  settings: WindowBehaviorSettings,
  logger: Logger
): void {
  const settingsPath = path.join(configDir, 'window-behavior.json');
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    logger.error('Failed to save window behavior settings:', error as Error);
  }
}

/** Sync preferences with defaults */
export interface SyncPreferences {
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  syncFiles: boolean;
  syncAnnouncements: boolean;
  autoAssignDueDate: boolean;
  saveHtmlContent: boolean;
  htmlUrlRewriting: 'local' | 'original';
  downloadImages: boolean;
  downloadLinkedFiles: boolean;
}

/**
 * Get sync preferences from database.
 * Returns default values if preferences are not set.
 */
export function getSyncPreferences(db: Database): SyncPreferences {
  const defaults: SyncPreferences = {
    autoSyncEnabled: true,
    autoSyncInterval: 30,
    syncFiles: true,
    syncAnnouncements: true,
    autoAssignDueDate: false,
    saveHtmlContent: true,
    htmlUrlRewriting: 'original',
    downloadImages: true,
    downloadLinkedFiles: false,
  };

  try {
    const prefs = db.executeReadOne<{ value: string }>(
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

/** Local HTML paths settings */
export interface LocalHtmlPathsSettings {
  enabled: boolean;
  autoRegenerate: boolean;
  promptForMissing: boolean;
}

/**
 * Get local HTML paths settings from database.
 * Returns default values if settings are not set.
 */
export function getLocalHtmlPathsSettings(db: Database): LocalHtmlPathsSettings {
  const defaults: LocalHtmlPathsSettings = {
    enabled: false, // Disabled by default - user can enable in Settings
    autoRegenerate: true,
    promptForMissing: true,
  };

  try {
    const settings = db.executeReadOne<{ value: string }>(
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
