/**
 * L0 Utilities - Housekeeping Manager (Facade)
 *
 * Thin facade that delegates cleanup work to submodules in ./housekeeping/.
 * Manages scheduling, configuration, and orchestration of cleanup tasks.
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { HousekeepingConfig } from './AppConfig';
import { ComponentLogger, Logger } from './Logger';
import { MetricsCollector } from './MetricsCollector';
import { DEFAULT_PATHS } from './DefaultPaths';

// Import delegated functions from submodules
import { cleanupOldLogs, clearAllLogs } from './housekeeping/logCleanup';
import { compressOldWeekLogs } from './housekeeping/logCompression';
import { runDatabaseMaintenance, shouldRunVacuum } from './housekeeping/dbMaintenance';
import { checkDiskSpace } from './housekeeping/diskMonitor';

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
    this.logDir =
      (config && 'logDir' in config ? config.logDir : undefined) ?? DEFAULT_PATHS.logs;
    this.dataDir =
      (config && 'dataDir' in config ? config.dataDir : undefined) ?? DEFAULT_PATHS.data;
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

    // Check disk space first (delegated)
    const diskStatus = this.checkDiskSpace();
    if (diskStatus.isLow) {
      warnings.push(
        `Low disk space: ${Math.round(diskStatus.available / 1024 / 1024)}MB available ` +
          `(threshold: ${diskStatus.warningThreshold}MB)`
      );
      this.emit('disk-space-warning', diskStatus);
    }

    // Run cleanup tasks (delegated where submodules exist)
    results.push(await this.cleanupOldLogs());
    results.push(await this.cleanupMetrics());
    results.push(await this.cleanupTempFiles());
    results.push(await this.cleanupSyncCache());

    // Compress old week logs if structured logging is enabled (delegated)
    if (this.compressStructuredLogs) {
      results.push(await this.compressOldWeekLogs());
    }

    // Database maintenance - check frequency (delegated)
    if (shouldRunVacuum(this.lastVacuum, this.vacuumFrequency)) {
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
   * Cleanup old log files (delegated to housekeeping/logCleanup)
   */
  async cleanupOldLogs(): Promise<CleanupResult> {
    return cleanupOldLogs(this.logDir, this.retentionLogsDays, this.log);
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
   * Compress old week log directories (delegated to housekeeping/logCompression)
   */
  async compressOldWeekLogs(): Promise<CleanupResult> {
    return compressOldWeekLogs(this.logDir, this.logRetentionWeeks, this.log);
  }

  /**
   * Clear ALL logs (for app reset) (delegated to housekeeping/logCleanup)
   * WARNING: This permanently deletes all log data
   */
  async clearAllLogs(): Promise<CleanupResult> {
    return clearAllLogs(this.logDir, this.log);
  }

  /**
   * Run database maintenance (VACUUM) (delegated to housekeeping/dbMaintenance)
   */
  async runDatabaseMaintenance(): Promise<CleanupResult> {
    const result = await runDatabaseMaintenance(
      this.dataDir,
      this.walCheckpointOnClose,
      this.log
    );
    if (result.success && result.itemsProcessed > 0) {
      this.lastVacuum = new Date();
    }
    return result;
  }

  /**
   * Check disk space (delegated to housekeeping/diskMonitor)
   */
  checkDiskSpace(): { available: number; isLow: boolean; warningThreshold: number } {
    return checkDiskSpace(this.dataDir, this.diskSpaceWarningMb);
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
