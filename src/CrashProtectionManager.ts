/**
 * Crash Protection Manager
 * Handles crash detection, recovery, and safe mode for the application
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import type { Database } from './layers/l1-persistence';

// Minimal logger interface that works with both Logger and ComponentLogger
interface MinimalLogger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error, ...args: unknown[]): void;
}

// Types
export interface CrashHistoryEntry {
  timestamp: string;
  reason: string;
}

export interface CrashHistory {
  crashes: CrashHistoryEntry[];
  lastCleanExit: string | null;
  safeMode: boolean;
}

export interface RecoveryStatus {
  safeMode: boolean;
  lastCrash: CrashHistoryEntry | null;
  crashCount: number;
  message: string | null;
}

export interface CrashFlagResult {
  crashed: boolean;
  data?: { timestamp: string; reason: string };
}

export interface CrashLoopResult {
  inLoop: boolean;
  crashCount: number;
}

export interface CrashProtectionConfig {
  configDir: string;
  crashLoopThreshold?: number;
  crashLoopWindowMs?: number;
  safeModeClearDelayMs?: number;
}

// Default constants
const DEFAULT_CRASH_LOOP_THRESHOLD = 3;
const DEFAULT_CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_SAFE_MODE_CLEAR_DELAY_MS = 5 * 60 * 1000; // 5 minutes

export class CrashProtectionManager {
  private readonly configDir: string;
  private readonly crashFlagFile: string;
  private readonly crashHistoryFile: string;
  private readonly crashLoopThreshold: number;
  private readonly crashLoopWindowMs: number;
  private readonly safeModeClearDelayMs: number;

  private safeModeEnabled = false;
  private safeModeTimer: NodeJS.Timeout | null = null;
  private lastCrashInfo: CrashHistoryEntry | null = null;

  // Optional dependencies for advanced features
  private logger: MinimalLogger | null = null;
  private database: Database | null = null;
  private getMainWindow: (() => BrowserWindow | null) | null = null;

  constructor(config: CrashProtectionConfig) {
    this.configDir = config.configDir;
    this.crashFlagFile = path.join(config.configDir, 'crash-flag.json');
    this.crashHistoryFile = path.join(config.configDir, 'crash-history.json');
    this.crashLoopThreshold = config.crashLoopThreshold ?? DEFAULT_CRASH_LOOP_THRESHOLD;
    this.crashLoopWindowMs = config.crashLoopWindowMs ?? DEFAULT_CRASH_LOOP_WINDOW_MS;
    this.safeModeClearDelayMs =
      config.safeModeClearDelayMs ?? DEFAULT_SAFE_MODE_CLEAR_DELAY_MS;
  }

  /**
   * Set optional dependencies for advanced features
   */
  setDependencies(deps: {
    logger?: MinimalLogger;
    database?: Database;
    getMainWindow?: () => BrowserWindow | null;
  }): void {
    if (deps.logger) this.logger = deps.logger;
    if (deps.database) this.database = deps.database;
    if (deps.getMainWindow) this.getMainWindow = deps.getMainWindow;
  }

  /**
   * Get current safe mode state
   */
  isSafeModeEnabled(): boolean {
    return this.safeModeEnabled;
  }

  /**
   * Set safe mode state
   */
  setSafeModeEnabled(enabled: boolean): void {
    this.safeModeEnabled = enabled;
  }

  /**
   * Get last crash info
   */
  getLastCrashInfo(): CrashHistoryEntry | null {
    return this.lastCrashInfo;
  }

  /**
   * Set last crash info
   */
  setLastCrashInfo(info: CrashHistoryEntry | null): void {
    this.lastCrashInfo = info;
  }

  /**
   * Load crash history from disk
   */
  loadCrashHistory(): CrashHistory {
    try {
      if (fs.existsSync(this.crashHistoryFile)) {
        return JSON.parse(fs.readFileSync(this.crashHistoryFile, 'utf-8'));
      }
    } catch (_e) {
      // Ignore parse errors, return default
    }
    return { crashes: [], lastCleanExit: null, safeMode: false };
  }

  /**
   * Save crash history to disk
   */
  saveCrashHistory(history: CrashHistory): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.crashHistoryFile, JSON.stringify(history, null, 2));
    } catch (_e) {
      // Cannot log, just ignore
    }
  }

  /**
   * Check if crash loop detected (3+ crashes in 10 minutes by default)
   */
  checkCrashLoop(): CrashLoopResult {
    const history = this.loadCrashHistory();
    const now = Date.now();

    // Count crashes within the window
    const recentCrashes = history.crashes.filter((crash) => {
      const crashTime = new Date(crash.timestamp).getTime();
      return now - crashTime < this.crashLoopWindowMs;
    });

    const inLoop = recentCrashes.length >= this.crashLoopThreshold;

    if (inLoop && !history.safeMode) {
      // Enter safe mode
      history.safeMode = true;
      this.saveCrashHistory(history);
    }

    return { inLoop, crashCount: recentCrashes.length };
  }

  /**
   * Record a soft error in crash history (doesn't write crash flag or trigger safe mode)
   * Used for non-fatal errors like renderer errors
   */
  recordSoftError(reason: string, timestamp?: string): void {
    try {
      const history = this.loadCrashHistory();
      history.crashes.push({
        timestamp: timestamp ?? new Date().toISOString(),
        reason,
      });

      // Keep only crashes within the window + a buffer
      const cutoff = Date.now() - this.crashLoopWindowMs * 2;
      history.crashes = history.crashes.filter(
        (c) => new Date(c.timestamp).getTime() > cutoff
      );

      this.saveCrashHistory(history);
    } catch (_e) {
      // Ignore errors
    }
  }

  /**
   * Record a crash in history and write crash flag
   */
  writeCrashFlag(reason: string): void {
    try {
      const timestamp = new Date().toISOString();
      const crashData = {
        timestamp,
        reason,
        pid: process.pid,
        platform: process.platform,
      };

      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      // Write immediate crash flag
      fs.writeFileSync(this.crashFlagFile, JSON.stringify(crashData, null, 2));

      // Also record in crash history (skip session_start as it's not a real crash)
      if (reason !== 'session_start') {
        const history = this.loadCrashHistory();
        history.crashes.push({ timestamp, reason });

        // Keep only crashes within the window + a buffer
        const cutoff = Date.now() - this.crashLoopWindowMs * 2;
        history.crashes = history.crashes.filter(
          (c) => new Date(c.timestamp).getTime() > cutoff
        );

        this.saveCrashHistory(history);
      }
    } catch (_e) {
      // Cannot log, just ignore
    }
  }

  /**
   * Clear crash flag and record clean exit
   */
  clearCrashFlag(): void {
    try {
      if (fs.existsSync(this.crashFlagFile)) {
        fs.unlinkSync(this.crashFlagFile);
      }

      // Record clean exit in history
      const history = this.loadCrashHistory();
      history.lastCleanExit = new Date().toISOString();
      this.saveCrashHistory(history);
    } catch (_e) {
      // Ignore
    }
  }

  /**
   * Clear safe mode after stable runtime
   */
  clearSafeMode(): void {
    const history = this.loadCrashHistory();
    if (history.safeMode) {
      history.safeMode = false;
      history.crashes = []; // Clear crash history on successful recovery
      this.saveCrashHistory(history);
      this.safeModeEnabled = false;
      this.logger?.info('Safe mode cleared after stable runtime');

      // Notify renderer
      const mainWindow = this.getMainWindow?.();
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
   * Start safe mode clear timer - clears after stable runtime
   */
  startSafeModeClearTimer(): void {
    if (this.safeModeTimer) {
      clearTimeout(this.safeModeTimer);
    }

    this.safeModeTimer = setTimeout(() => {
      this.clearSafeMode();
      this.safeModeTimer = null;
    }, this.safeModeClearDelayMs);
  }

  /**
   * Stop safe mode clear timer
   */
  stopSafeModeClearTimer(): void {
    if (this.safeModeTimer) {
      clearTimeout(this.safeModeTimer);
      this.safeModeTimer = null;
    }
  }

  /**
   * Check if previous session crashed
   */
  checkCrashFlag(): CrashFlagResult {
    try {
      if (fs.existsSync(this.crashFlagFile)) {
        const data = JSON.parse(fs.readFileSync(this.crashFlagFile, 'utf-8'));
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
  getRecoveryStatus(): RecoveryStatus {
    const history = this.loadCrashHistory();
    const recentCrashes = history.crashes.filter((crash) => {
      const crashTime = new Date(crash.timestamp).getTime();
      return Date.now() - crashTime < this.crashLoopWindowMs;
    });

    let message: string | null = null;
    if (this.safeModeEnabled) {
      message = `Auto-sync disabled due to ${recentCrashes.length} recent crashes. Manual sync is still available.`;
    } else if (this.lastCrashInfo) {
      message = 'App recovered from previous crash.';
    }

    return {
      safeMode: this.safeModeEnabled,
      lastCrash: this.lastCrashInfo,
      crashCount: recentCrashes.length,
      message,
    };
  }

  /**
   * Emergency cleanup on crash
   */
  emergencyCleanup(): void {
    try {
      // Try to checkpoint database with timeout
      const timeout = setTimeout(() => {
        process.exit(1);
      }, 2000); // 2 second timeout

      try {
        this.database?.close();
        clearTimeout(timeout);
      } catch (_e) {
        clearTimeout(timeout);
      }
    } catch (_e) {
      // Ignore
    }
  }

  /**
   * Register global error handlers
   */
  registerErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.writeCrashFlag(`uncaughtException: ${error.message}`);
      this.logger?.error('Uncaught Exception:', error);
      this.emergencyCleanup();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, _promise) => {
      this.writeCrashFlag(`unhandledRejection: ${reason}`);
      this.logger?.error(
        'Unhandled Rejection:',
        reason instanceof Error ? reason : new Error(String(reason))
      );
      // Don't exit on unhandled rejection, just log
    });
  }
}
