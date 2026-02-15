/**
 * Database maintenance functions
 *
 * Handles VACUUM, WAL checkpoint, and vacuum scheduling.
 */

import path from 'path';
import fs from 'fs';
import type { ComponentLogger } from '../Logger';
import type { CleanupResult } from '../HousekeepingManager';

/**
 * Run database maintenance (VACUUM and optional WAL checkpoint)
 */
export async function runDatabaseMaintenance(
  dataDir: string,
  walCheckpointOnClose: boolean,
  log: ComponentLogger
): Promise<CleanupResult> {
  const result: CleanupResult = {
    task: 'database-maintenance',
    success: true,
    itemsProcessed: 0,
    bytesFreed: 0,
    errors: [],
  };

  const dbPath = path.join(dataDir, 'cid.db');

  try {
    if (!fs.existsSync(dbPath)) {
      return result;
    }

    // Get size before VACUUM
    const sizeBefore = fs.statSync(dbPath).size;

    // Run VACUUM using better-sqlite3
    const BetterSqlite3 = await import('better-sqlite3');
    const db = new BetterSqlite3.default(dbPath);
    if (walCheckpointOnClose) {
      db.pragma('wal_checkpoint(TRUNCATE)');
    }
    db.exec('VACUUM');
    db.close();

    // Get size after VACUUM
    const sizeAfter = fs.statSync(dbPath).size;
    result.bytesFreed = Math.max(0, sizeBefore - sizeAfter);
    result.itemsProcessed = 1;

    log.info(`Database VACUUM complete, freed ${result.bytesFreed} bytes`);
  } catch (error) {
    result.success = false;
    result.errors!.push(error instanceof Error ? error.message : String(error));
    log.error(
      'Failed to run database maintenance',
      error instanceof Error ? error : undefined
    );
  }

  return result;
}

/**
 * Check if VACUUM should run based on frequency and last run time
 */
export function shouldRunVacuum(
  lastVacuum: Date | null,
  vacuumFrequency: 'daily' | 'weekly' | 'monthly'
): boolean {
  if (!lastVacuum) {
    return true;
  }

  const daysSinceVacuum = Math.floor(
    (Date.now() - lastVacuum.getTime()) / (1000 * 60 * 60 * 24)
  );

  switch (vacuumFrequency) {
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
