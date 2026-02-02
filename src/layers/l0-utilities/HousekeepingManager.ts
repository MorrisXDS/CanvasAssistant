/**
 * L0 Utilities - Housekeeping Manager
 *
 * Manages cleanup tasks for logs, metrics, database maintenance, and disk space.
 * Runs on a configurable schedule and provides cleanup warnings without forcing actions.
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { HousekeepingConfig } from './AppConfig';
import { ComponentLogger, Logger } from './Logger';
import { MetricsCollector } from './MetricsCollector';

export interface HousekeepingManagerOptions {
  enabled?: boolean;
  logDir?: string;
  dataDir?: string;
  metricsCollector?: MetricsCollector;
  schedule?: {
    runAt?: string;
    runOnStartup?: boolean;
  };
  retention?: {
    logsDays?: number;
    metricsDays?: number;
    tempFileHours?: number;
    syncCacheDays?: number;
    /** Number of weeks to keep logs before deletion (default: 13 = ~90 days) */
    logRetentionWeeks?: number;
  };
  database?: {
    vacuumFrequency?: 'daily' | 'weekly' | 'monthly';
    walCheckpointOnClose?: boolean;
  };
  diskSpaceWarningMb?: number;
  logger?: Logger;
  /** Enable structured log directory compression (year/week/day structure) */
  compressStructuredLogs?: boolean;
}

export interface CleanupResult {
  task: string;
  success: boolean;
  itemsProcessed: number;
  bytesFreed: number;
  errors?: string[];
}

export interface HousekeepingReport {
  timestamp: Date;
  results: CleanupResult[];
  totalBytesFreed: number;
  warnings: string[];
  diskSpaceStatus: {
    available: number;
    isLow: boolean;
    warningThreshold: number;
  };
}

/**
 * Housekeeping Manager for system cleanup tasks
 *
 * Features:
 * - Log rotation and cleanup
 * - Metrics database purging
 * - Database maintenance (VACUUM)
 * - Disk space monitoring and warnings
 * - Scheduled execution
 */
export class HousekeepingManager extends EventEmitter {
  private readonly enabled: boolean;
  private readonly logDir: string;
  private readonly dataDir: string;
  private readonly metricsCollector: MetricsCollector | null;
  private readonly scheduleRunAt: string;
  private readonly runOnStartup: boolean;
  private readonly retentionLogsDays: number;
  private readonly retentionMetricsDays: number;
  private readonly retentionTempFileHours: number;
  private readonly retentionSyncCacheDays: number;
  private readonly vacuumFrequency: 'daily' | 'weekly' | 'monthly';
  private readonly walCheckpointOnClose: boolean;
  private readonly diskSpaceWarningMb: number;
  private readonly log: ComponentLogger;
  private readonly compressStructuredLogs: boolean;
  private readonly logRetentionWeeks: number;

  private scheduledTimer: NodeJS.Timeout | null = null;
  private lastRun: Date | null = null;
  private lastVacuum: Date | null = null;

  constructor(
    config?: HousekeepingConfig | HousekeepingManagerOptions,
    logger?: Logger,
    metricsCollector?: MetricsCollector
  ) {
    super();

    // Apply defaults
    this.enabled = config?.enabled ?? true;
    this.logDir = (config && 'logDir' in config ? config.logDir : undefined) ?? 'logs';
    this.dataDir = (config && 'dataDir' in config ? config.dataDir : undefined) ?? 'data';
    this.metricsCollector = metricsCollector ?? null;

    // Schedule settings
    this.scheduleRunAt = config?.schedule?.runAt ?? '03:00';
    this.runOnStartup = config?.schedule?.runOnStartup ?? false;

    // Retention settings
    this.retentionLogsDays = config?.retention?.logsDays ?? 30;
    this.retentionMetricsDays = config?.retention?.metricsDays ?? 90;
    this.retentionTempFileHours = config?.retention?.tempFileHours ?? 24;
    this.retentionSyncCacheDays = config?.retention?.syncCacheDays ?? 7;

    // Database settings
    this.vacuumFrequency = config?.database?.vacuumFrequency ?? 'weekly';
    this.walCheckpointOnClose = config?.database?.walCheckpointOnClose ?? true;

    // Disk space warning
    this.diskSpaceWarningMb = config?.diskSpaceWarningMb ?? 500;

    // Log compression settings
    this.compressStructuredLogs =
      (config && 'compressStructuredLogs' in config
        ? config.compressStructuredLogs
        : undefined) ?? true;
    // Check for logRetentionWeeks in retention config (extended interface)
    const extendedRetention = config?.retention as
      | { logRetentionWeeks?: number }
      | undefined;
    this.logRetentionWeeks = extendedRetention?.logRetentionWeeks ?? 13;

    // Setup logger
    if (config && 'logger' in config && config.logger) {
      this.log = config.logger.child('housekeeping');
    } else if (logger) {
      this.log = logger.child('housekeeping');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('housekeeping');
    }
  }

  /**
   * Start the housekeeping scheduler
   */
  start(): void {
    if (!this.enabled || this.scheduledTimer) {
      return;
    }

    if (this.runOnStartup) {
      // Run cleanup asynchronously on startup
      setImmediate(() => {
        this.runCleanup().catch((err) => {
          this.log.error(
            'Startup cleanup failed',
            err instanceof Error ? err : undefined
          );
        });
      });
    }

    // Schedule daily run
    this.scheduleNextRun();

    this.log.info(`Housekeeping started, scheduled at ${this.scheduleRunAt}`);
    this.emit('started');
  }

  /**
   * Stop the housekeeping scheduler
   */
  stop(): void {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    this.log.info('Housekeeping stopped');
    this.emit('stopped');
  }

  /**
   * Schedule the next cleanup run
   */
  private scheduleNextRun(): void {
    const now = new Date();
    const [hours, minutes] = this.scheduleRunAt.split(':').map(Number);

    // Calculate next run time
    const nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();

    this.scheduledTimer = setTimeout(() => {
      this.runCleanup()
        .then(() => this.scheduleNextRun())
        .catch((err) => {
          this.log.error(
            'Scheduled cleanup failed',
            err instanceof Error ? err : undefined
          );
          this.scheduleNextRun();
        });
    }, delay);

    this.log.debug(`Next cleanup scheduled for ${nextRun.toISOString()}`);
  }

  /**
   * Run all cleanup tasks
   */
  async runCleanup(): Promise<HousekeepingReport> {
    this.log.info('Starting housekeeping cleanup');
    this.emit('cleanup-started');

    const results: CleanupResult[] = [];
    const warnings: string[] = [];

    // Check disk space first
    const diskStatus = this.checkDiskSpace();
    if (diskStatus.isLow) {
      warnings.push(
        `Low disk space: ${Math.round(diskStatus.available / 1024 / 1024)}MB available ` +
          `(threshold: ${diskStatus.warningThreshold}MB)`
      );
      this.emit('disk-space-warning', diskStatus);
    }

    // Run cleanup tasks
    results.push(await this.cleanupOldLogs());
    results.push(await this.cleanupMetrics());
    results.push(await this.cleanupTempFiles());
    results.push(await this.cleanupSyncCache());

    // Compress old week logs if structured logging is enabled
    if (this.compressStructuredLogs) {
      results.push(await this.compressOldWeekLogs());
    }

    // Database maintenance (check frequency)
    if (this.shouldRunVacuum()) {
      results.push(await this.runDatabaseMaintenance());
    }

    const totalBytesFreed = results.reduce((sum, r) => sum + r.bytesFreed, 0);
    this.lastRun = new Date();

    const report: HousekeepingReport = {
      timestamp: this.lastRun,
      results,
      totalBytesFreed,
      warnings,
      diskSpaceStatus: diskStatus,
    };

    this.log.info(
      `Housekeeping complete: ${totalBytesFreed} bytes freed, ${warnings.length} warnings`
    );
    this.emit('cleanup-complete', report);

    return report;
  }

  /**
   * Cleanup old log files
   */
  async cleanupOldLogs(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'cleanup-logs',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      if (!fs.existsSync(this.logDir)) {
        return result;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionLogsDays);

      const files = fs.readdirSync(this.logDir);
      for (const file of files) {
        // Only process log files (including compressed)
        if (!file.endsWith('.log') && !file.endsWith('.log.gz')) {
          continue;
        }

        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          result.bytesFreed += stats.size;
          fs.unlinkSync(filePath);
          result.itemsProcessed++;
          this.log.debug(`Deleted old log: ${file}`);
        }
      }

      this.log.info(`Cleaned up ${result.itemsProcessed} old log files`);
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to cleanup logs',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Cleanup old metrics
   */
  async cleanupMetrics(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'cleanup-metrics',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      if (this.metricsCollector) {
        const purged = this.metricsCollector.purgeOldMetrics(this.retentionMetricsDays);
        result.itemsProcessed = purged;
        // Estimate bytes freed (rough average of 100 bytes per metric)
        result.bytesFreed = purged * 100;
        this.log.info(`Purged ${purged} old metrics`);
      }
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to cleanup metrics',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Cleanup temp files
   */
  async cleanupTempFiles(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'cleanup-temp',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    const tempDir = path.join(this.dataDir, 'temp');

    try {
      if (!fs.existsSync(tempDir)) {
        return result;
      }

      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - this.retentionTempFileHours);

      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          result.bytesFreed += stats.size;
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
          result.itemsProcessed++;
          this.log.debug(`Deleted temp file: ${file}`);
        }
      }

      this.log.info(`Cleaned up ${result.itemsProcessed} temp files`);
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to cleanup temp files',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Cleanup sync cache
   */
  async cleanupSyncCache(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'cleanup-sync-cache',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    const cacheDir = path.join(this.dataDir, 'cache');

    try {
      if (!fs.existsSync(cacheDir)) {
        return result;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionSyncCacheDays);

      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          result.bytesFreed += stats.size;
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
          result.itemsProcessed++;
          this.log.debug(`Deleted cache file: ${file}`);
        }
      }

      this.log.info(`Cleaned up ${result.itemsProcessed} cache files`);
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to cleanup sync cache',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Compress old week log directories
   *
   * Directory structure expected:
   * logs/
   *   2026/
   *     week-05/           # Current week - daily files (keep uncompressed)
   *       2026-01-27.json
   *       2026-01-28.json
   *     week-04/           # Previous weeks - compress
   *       week-04.json.gz  # Merged and compressed
   *     week-03/
   *       week-03.json.gz
   */
  async compressOldWeekLogs(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'compress-old-week-logs',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      if (!fs.existsSync(this.logDir)) {
        return result;
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentWeek = this.getISOWeekNumber(now);

      // Scan year directories
      const yearDirs = fs
        .readdirSync(this.logDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
        .map((d) => d.name);

      for (const yearDir of yearDirs) {
        const year = parseInt(yearDir, 10);
        const yearPath = path.join(this.logDir, yearDir);

        // Scan week directories
        const weekDirs = fs
          .readdirSync(yearPath, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^week-\d{2}$/.test(d.name))
          .map((d) => d.name);

        for (const weekDir of weekDirs) {
          const weekNum = parseInt(weekDir.replace('week-', ''), 10);
          const weekPath = path.join(yearPath, weekDir);

          // Calculate age in weeks
          const weeksAgo =
            year === currentYear
              ? currentWeek - weekNum
              : (currentYear - year) * 52 + (currentWeek - weekNum);

          // Skip current week (keep daily files)
          if (weeksAgo <= 0) {
            continue;
          }

          // Delete weeks older than retention period
          if (weeksAgo > this.logRetentionWeeks) {
            const deleteResult = this.deleteWeekDirectory(weekPath);
            result.bytesFreed += deleteResult.bytesFreed;
            result.itemsProcessed += deleteResult.filesDeleted;
            this.log.debug(`Deleted old week logs: ${weekDir} (${weeksAgo} weeks old)`);
            continue;
          }

          // Compress previous weeks (if not already compressed)
          const archivePath = path.join(weekPath, `${weekDir}.json.gz`);

          if (!fs.existsSync(archivePath)) {
            const compressResult = await this.compressWeekDirectory(
              weekPath,
              archivePath,
              weekDir
            );
            if (compressResult.success) {
              result.bytesFreed += compressResult.bytesFreed;
              result.itemsProcessed++;
              this.log.debug(`Compressed week logs: ${weekDir}`);
            } else if (compressResult.error) {
              result.errors!.push(compressResult.error);
            }
          }
        }

        // Remove empty year directories
        try {
          const remaining = fs.readdirSync(yearPath);
          if (remaining.length === 0) {
            fs.rmdirSync(yearPath);
          }
        } catch {
          // Ignore cleanup errors
        }
      }

      if (result.itemsProcessed > 0 || result.bytesFreed > 0) {
        this.log.info(
          `Compressed ${result.itemsProcessed} week logs, freed ${result.bytesFreed} bytes`
        );
      }
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to compress old week logs',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Get ISO week number for a date
   */
  private getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Delete a week directory and all its contents
   */
  private deleteWeekDirectory(weekPath: string): {
    filesDeleted: number;
    bytesFreed: number;
  } {
    let filesDeleted = 0;
    let bytesFreed = 0;

    try {
      const files = fs.readdirSync(weekPath);
      for (const file of files) {
        const filePath = path.join(weekPath, file);
        try {
          const stats = fs.statSync(filePath);
          bytesFreed += stats.size;
          fs.unlinkSync(filePath);
          filesDeleted++;
        } catch {
          // Ignore individual file errors
        }
      }
      fs.rmdirSync(weekPath);
    } catch {
      // Ignore directory errors
    }

    return { filesDeleted, bytesFreed };
  }

  /**
   * Compress a week's daily log files into a single gzipped archive
   */
  private async compressWeekDirectory(
    weekPath: string,
    archivePath: string,
    weekDir: string
  ): Promise<{ success: boolean; bytesFreed: number; error?: string }> {
    try {
      // Find all daily log files (JSON or log)
      const logFiles = fs
        .readdirSync(weekPath)
        .filter((f) => f.endsWith('.json') || f.endsWith('.log'))
        .sort(); // Sort by date

      if (logFiles.length === 0) {
        return { success: true, bytesFreed: 0 };
      }

      // Merge all log files
      const mergedLogs: string[] = [];

      for (const logFile of logFiles) {
        const filePath = path.join(weekPath, logFile);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          mergedLogs.push(content);
        } catch {
          // Skip unreadable files
        }
      }

      if (mergedLogs.length === 0) {
        return { success: true, bytesFreed: 0 };
      }

      // Compress and write
      const mergedContent = mergedLogs.join('\n');
      const compressed = await new Promise<Buffer>((resolve, reject) => {
        zlib.gzip(mergedContent, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      fs.writeFileSync(archivePath, compressed);

      // Delete original files
      let bytesFreed = 0;
      for (const logFile of logFiles) {
        const filePath = path.join(weekPath, logFile);
        try {
          const stats = fs.statSync(filePath);
          bytesFreed += stats.size;
          fs.unlinkSync(filePath);
        } catch {
          // Ignore deletion errors
        }
      }

      // Account for the archive size
      const archiveStats = fs.statSync(archivePath);
      bytesFreed -= archiveStats.size;

      return { success: true, bytesFreed: Math.max(0, bytesFreed) };
    } catch (error) {
      return {
        success: false,
        bytesFreed: 0,
        error: `Failed to compress ${weekDir}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Clear ALL logs (for app reset)
   * WARNING: This permanently deletes all log data
   */
  async clearAllLogs(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'clear-all-logs',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      if (!fs.existsSync(this.logDir)) {
        return result;
      }

      // Recursively delete all files
      const deleteRecursive = (dirPath: string): void => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            deleteRecursive(fullPath);
            try {
              fs.rmdirSync(fullPath);
            } catch {
              // Ignore if not empty
            }
          } else {
            try {
              const stats = fs.statSync(fullPath);
              result.bytesFreed += stats.size;
              fs.unlinkSync(fullPath);
              result.itemsProcessed++;
            } catch {
              // Ignore file errors
            }
          }
        }
      };

      deleteRecursive(this.logDir);
      this.log.info(
        `Cleared all logs: ${result.itemsProcessed} files, ${result.bytesFreed} bytes freed`
      );
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to clear all logs',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Run database maintenance (VACUUM)
   */
  async runDatabaseMaintenance(): Promise<CleanupResult> {
    const result: CleanupResult = {
      task: 'database-maintenance',
      success: true,
      itemsProcessed: 0,
      bytesFreed: 0,
      errors: [],
    };

    const dbPath = path.join(this.dataDir, 'cid.db');

    try {
      if (!fs.existsSync(dbPath)) {
        return result;
      }

      // Get size before VACUUM
      const sizeBefore = fs.statSync(dbPath).size;

      // Run VACUUM using better-sqlite3
      const BetterSqlite3 = await import('better-sqlite3');
      const db = new BetterSqlite3.default(dbPath);
      if (this.walCheckpointOnClose) {
        db.pragma('wal_checkpoint(TRUNCATE)');
      }
      db.exec('VACUUM');
      db.close();

      // Get size after VACUUM
      const sizeAfter = fs.statSync(dbPath).size;
      result.bytesFreed = Math.max(0, sizeBefore - sizeAfter);
      result.itemsProcessed = 1;

      this.lastVacuum = new Date();
      this.log.info(`Database VACUUM complete, freed ${result.bytesFreed} bytes`);
    } catch (error) {
      result.success = false;
      result.errors!.push(error instanceof Error ? error.message : String(error));
      this.log.error(
        'Failed to run database maintenance',
        error instanceof Error ? error : undefined
      );
    }

    return result;
  }

  /**
   * Check if VACUUM should run based on frequency
   */
  private shouldRunVacuum(): boolean {
    if (!this.lastVacuum) {
      return true;
    }

    const daysSinceVacuum = Math.floor(
      (Date.now() - this.lastVacuum.getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (this.vacuumFrequency) {
      case 'daily':
        return daysSinceVacuum >= 1;
      case 'weekly':
        return daysSinceVacuum >= 7;
      case 'monthly':
        return daysSinceVacuum >= 30;
      default:
        return false;
    }
  }

  /**
   * Check disk space
   */
  checkDiskSpace(): { available: number; isLow: boolean; warningThreshold: number } {
    try {
      // Use different methods based on platform
      const dataPath = path.resolve(this.dataDir);
      const stats = fs.statfsSync(dataPath);

      const available = stats.bavail * stats.bsize;
      const warningThreshold = this.diskSpaceWarningMb * 1024 * 1024;

      return {
        available,
        isLow: available < warningThreshold,
        warningThreshold: this.diskSpaceWarningMb,
      };
    } catch {
      // Fallback if statfs not available
      return {
        available: Number.MAX_SAFE_INTEGER,
        isLow: false,
        warningThreshold: this.diskSpaceWarningMb,
      };
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats(): {
    lastRun: Date | null;
    lastVacuum: Date | null;
    enabled: boolean;
    scheduleRunAt: string;
  } {
    return {
      lastRun: this.lastRun,
      lastVacuum: this.lastVacuum,
      enabled: this.enabled,
      scheduleRunAt: this.scheduleRunAt,
    };
  }

  /**
   * Force immediate cleanup (manual trigger)
   */
  async forceCleanup(): Promise<HousekeepingReport> {
    this.log.info('Manual cleanup triggered');
    return this.runCleanup();
  }

  /**
   * Get estimated cleanup size (without actually deleting)
   */
  async estimateCleanup(): Promise<{
    logs: { count: number; bytes: number };
    tempFiles: { count: number; bytes: number };
    cacheFiles: { count: number; bytes: number };
    total: number;
  }> {
    const logs = { count: 0, bytes: 0 };
    const tempFiles = { count: 0, bytes: 0 };
    const cacheFiles = { count: 0, bytes: 0 };

    // Estimate logs
    if (fs.existsSync(this.logDir)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionLogsDays);

      const files = fs.readdirSync(this.logDir);
      for (const file of files) {
        if (!file.endsWith('.log') && !file.endsWith('.log.gz')) continue;

        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
          logs.count++;
          logs.bytes += stats.size;
        }
      }
    }

    // Estimate temp files
    const tempDir = path.join(this.dataDir, 'temp');
    if (fs.existsSync(tempDir)) {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - this.retentionTempFileHours);

      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
          tempFiles.count++;
          tempFiles.bytes += stats.size;
        }
      }
    }

    // Estimate cache files
    const cacheDir = path.join(this.dataDir, 'cache');
    if (fs.existsSync(cacheDir)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionSyncCacheDays);

      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
          cacheFiles.count++;
          cacheFiles.bytes += stats.size;
        }
      }
    }

    return {
      logs,
      tempFiles,
      cacheFiles,
      total: logs.bytes + tempFiles.bytes + cacheFiles.bytes,
    };
  }
}
