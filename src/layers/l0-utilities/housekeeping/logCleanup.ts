/**
 * Log cleanup functions
 *
 * Handles log rotation, old log file deletion, and recursive log clearing.
 */

import path from 'path';
import fs from 'fs';
import type { ComponentLogger } from '../Logger';
import type { CleanupResult } from '../HousekeepingManager';
import { deleteWeekDirectory } from './logCompression';

/**
 * Cleanup old log files beyond retention period
 */
export async function cleanupOldLogs(
  logDir: string,
  retentionLogsDays: number,
  log: ComponentLogger
): Promise<CleanupResult> {
  const result: CleanupResult = {
    task: 'cleanup-logs',
    success: true,
    itemsProcessed: 0,
    bytesFreed: 0,
    errors: [],
  };

  try {
    if (!fs.existsSync(logDir)) {
      return result;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionLogsDays);

    const files = fs.readdirSync(logDir);
    for (const file of files) {
      // Only process log files (including compressed)
      if (!file.endsWith('.log') && !file.endsWith('.log.gz')) {
        continue;
      }

      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);

      if (stats.mtime < cutoffDate) {
        result.bytesFreed += stats.size;
        fs.unlinkSync(filePath);
        result.itemsProcessed++;
        log.debug(`Deleted old log: ${file}`);
      }
    }

    log.info(`Cleaned up ${result.itemsProcessed} old log files`);
  } catch (error) {
    result.success = false;
    result.errors!.push(error instanceof Error ? error.message : String(error));
    log.error('Failed to cleanup logs', error instanceof Error ? error : undefined);
  }

  return result;
}

/**
 * Clear ALL logs (for app reset)
 * WARNING: This permanently deletes all log data
 */
export async function clearAllLogs(
  logDir: string,
  log: ComponentLogger
): Promise<CleanupResult> {
  const result: CleanupResult = {
    task: 'clear-all-logs',
    success: true,
    itemsProcessed: 0,
    bytesFreed: 0,
    errors: [],
  };

  try {
    if (!fs.existsSync(logDir)) {
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

    deleteRecursive(logDir);
    log.info(
      `Cleared all logs: ${result.itemsProcessed} files, ${result.bytesFreed} bytes freed`
    );
  } catch (error) {
    result.success = false;
    result.errors!.push(error instanceof Error ? error.message : String(error));
    log.error('Failed to clear all logs', error instanceof Error ? error : undefined);
  }

  return result;
}

/**
 * Delete old structured week log directories beyond retention period
 */
export function deleteOldWeekLogs(
  logDir: string,
  logRetentionWeeks: number,
  currentYear: number,
  currentWeek: number,
  log: ComponentLogger
): { bytesFreed: number; itemsProcessed: number } {
  let totalBytesFreed = 0;
  let totalItemsProcessed = 0;

  // Scan year directories
  const yearDirs = fs
    .readdirSync(logDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map((d) => d.name);

  for (const yearDir of yearDirs) {
    const year = parseInt(yearDir, 10);
    const yearPath = path.join(logDir, yearDir);

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

      // Delete weeks older than retention period
      if (weeksAgo > logRetentionWeeks) {
        const deleteResult = deleteWeekDirectory(weekPath);
        totalBytesFreed += deleteResult.bytesFreed;
        totalItemsProcessed += deleteResult.filesDeleted;
        log.debug(`Deleted old week logs: ${weekDir} (${weeksAgo} weeks old)`);
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

  return { bytesFreed: totalBytesFreed, itemsProcessed: totalItemsProcessed };
}
