/**
 * Application Path Constants
 * Centralizes all path definitions and directory initialization.
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// Application root - use userData in packaged mode, cwd in dev mode
// process.cwd() is unreliable in packaged apps (often C:\Windows\System32)
// path.dirname(exe) fails when installed to Program Files (no write access)
// app.getPath('userData') is always writable and the Electron convention
export const APP_ROOT = app.isPackaged ? app.getPath('userData') : process.cwd();

// Install directory - where the .exe lives (user-chosen, visible location)
export const INSTALL_DIR = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : process.cwd();

// Application paths
// Internal data (db, logs, config) -> APP_ROOT (userData) - always writable
// User-visible files (downloads) -> INSTALL_DIR - next to the app, easy to find
export const CONFIG_DIR = path.join(APP_ROOT, '.config'); // Hidden - internal config
export const LOG_DIR = path.join(APP_ROOT, '.logs'); // Hidden - application logs
export const PROJECT_DB_DIR = path.join(APP_ROOT, 'database'); // Internal - database
export const BACKUP_DIR = path.join(APP_ROOT, 'backups'); // Internal - backups
// Packaged builds MUST write downloads to a user-writable location, not the install dir:
// on Linux the install dir is /opt/<App> (root-owned → mkdir EACCES → startup crash), and
// on macOS it's inside /Applications. So when packaged, use ~/Documents/CanvasAssistant/
// Downloads on EVERY platform. In dev (not packaged) keep Downloads next to the app (cwd)
// for a self-contained, portable working tree.
export const FILES_DIR = app.isPackaged
  ? path.join(app.getPath('documents'), 'CanvasAssistant', 'Downloads')
  : path.join(INSTALL_DIR, 'Downloads');

export const DB_PATH = path.join(PROJECT_DB_DIR, 'canvas.db');
export const METRICS_DB_PATH = path.join(PROJECT_DB_DIR, 'metrics.db');

// Security-critical paths - must remain in secure location (OS keychain fallback)
export const APP_DATA_DIR = path.join(app.getPath('userData'), 'CanvasAssistant');
export const CREDENTIAL_FILE = path.join(APP_DATA_DIR, '.credentials');

/**
 * Ensure all required directories exist on startup.
 * Creates hidden config/log/backup dirs and the database directory.
 */
export function ensureDirectories(): void {
  for (const dir of [CONFIG_DIR, LOG_DIR, BACKUP_DIR, PROJECT_DB_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
