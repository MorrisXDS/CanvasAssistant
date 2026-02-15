/**
 * Disk space monitoring
 *
 * Monitors available disk space and provides low-space warnings.
 */

import path from 'path';
import fs from 'fs';

/**
 * Check available disk space on the partition containing dataDir
 */
export function checkDiskSpace(
  dataDir: string,
  diskSpaceWarningMb: number
): { available: number; isLow: boolean; warningThreshold: number } {
  try {
    const dataPath = path.resolve(dataDir);
    const stats = fs.statfsSync(dataPath);

    const available = stats.bavail * stats.bsize;
    const warningThreshold = diskSpaceWarningMb * 1024 * 1024;

    return {
      available,
      isLow: available < warningThreshold,
      warningThreshold: diskSpaceWarningMb,
    };
  } catch {
    // Fallback if statfs not available
    return {
      available: Number.MAX_SAFE_INTEGER,
      isLow: false,
      warningThreshold: diskSpaceWarningMb,
    };
  }
}
