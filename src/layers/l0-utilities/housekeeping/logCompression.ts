/**
 * Log compression functions
 *
 * Handles compression of structured week log directories and ISO week calculation.
 */

import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import type { ComponentLogger } from '../Logger';
import type { CleanupResult } from '../HousekeepingManager';

/**
 * Get ISO week number for a date
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Delete a week directory and all its contents
 */
export function deleteWeekDirectory(weekPath: string): {
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
export async function compressWeekDirectory(
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
 * Compress old week log directories.
 * Scans structured log directories (year/week/day) and compresses previous weeks.
 */
export async function compressOldWeekLogs(
  logDir: string,
  logRetentionWeeks: number,
  log: ComponentLogger
): Promise<CleanupResult> {
  const result: CleanupResult = {
    task: 'compress-old-week-logs',
    success: true,
    itemsProcessed: 0,
    bytesFreed: 0,
    errors: [],
  };

  try {
    if (!fs.existsSync(logDir)) {
      return result;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = getISOWeekNumber(now);

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

        // Skip current week (keep daily files)
        if (weeksAgo <= 0) {
          continue;
        }

        // Delete weeks older than retention period
        if (weeksAgo > logRetentionWeeks) {
          const deleteResult = deleteWeekDirectory(weekPath);
          result.bytesFreed += deleteResult.bytesFreed;
          result.itemsProcessed += deleteResult.filesDeleted;
          log.debug(`Deleted old week logs: ${weekDir} (${weeksAgo} weeks old)`);
          continue;
        }

        // Compress previous weeks (if not already compressed)
        const archivePath = path.join(weekPath, `${weekDir}.json.gz`);

        if (!fs.existsSync(archivePath)) {
          const compressResult = await compressWeekDirectory(
            weekPath,
            archivePath,
            weekDir
          );
          if (compressResult.success) {
            result.bytesFreed += compressResult.bytesFreed;
            result.itemsProcessed++;
            log.debug(`Compressed week logs: ${weekDir}`);
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
      log.info(
        `Compressed ${result.itemsProcessed} week logs, freed ${result.bytesFreed} bytes`
      );
    }
  } catch (error) {
    result.success = false;
    result.errors!.push(error instanceof Error ? error.message : String(error));
    log.error(
      'Failed to compress old week logs',
      error instanceof Error ? error : undefined
    );
  }

  return result;
}
