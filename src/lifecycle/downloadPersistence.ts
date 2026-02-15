/**
 * Download Queue Persistence
 * Saves and restores pending file downloads for crash recovery.
 */

import type { Database } from '../layers/l1-persistence';
import type { PendingDownloadRow } from '../layers/l1-persistence';
import type { FileDownloadManager } from '../layers/l0-utilities/FileDownloadManager';
import type { Logger } from '../layers/l0-utilities/Logger';

/**
 * Save pending downloads to database for crash recovery.
 * Skips if database is closed (e.g., during import restart).
 */
export function savePendingDownloads(
  db: Database,
  fdm: FileDownloadManager,
  logger: Logger
): void {
  if (!db.isOpen) {
    return;
  }

  try {
    const pending = fdm.getPendingDownloads();
    const active = fdm.getActiveDownloadRequests();

    if (pending.length === 0 && active.length === 0) {
      // Clear any stale pending downloads
      db.executeWrite('DELETE FROM pending_downloads', [], 'pending_downloads');
      return;
    }

    logger.info(`Saving ${pending.length} pending + ${active.length} active downloads`);

    // Clear existing pending downloads
    db.executeWrite('DELETE FROM pending_downloads', [], 'pending_downloads');

    // Save pending downloads
    for (const request of pending) {
      db.executeWrite(
        `INSERT INTO pending_downloads (resource_id, course_code, url, filename, context_folder, folder_path, expected_size, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          request.id,
          request.courseCode,
          request.url,
          request.filename,
          request.contextFolder || null,
          request.folderPath || null,
          request.expectedSize || null,
        ],
        'pending_downloads'
      );
    }

    logger.info('Pending downloads saved successfully');
  } catch (error) {
    logger.error('Failed to save pending downloads:', error as Error);
  }
}

/**
 * Restore pending downloads from database on startup.
 */
export function restorePendingDownloads(
  db: Database,
  fdm: FileDownloadManager,
  logger: Logger
): void {
  try {
    const rows = db.executeRead<PendingDownloadRow>(
      "SELECT * FROM pending_downloads WHERE status IN ('pending', 'in_progress') ORDER BY priority DESC"
    );

    if (rows.length === 0) {
      return;
    }

    logger.info(`Found ${rows.length} pending downloads to restore`);

    const requests = rows.map((row) => ({
      id: row.resource_id,
      url: row.url,
      courseCode: row.course_code,
      filename: row.filename,
      contextFolder: row.context_folder || undefined,
      folderPath: row.folder_path || undefined,
      expectedSize: row.expected_size || undefined,
    }));

    // Clear the persisted queue since we're restoring it
    db.executeWrite('DELETE FROM pending_downloads', [], 'pending_downloads');

    // Restore to download manager
    fdm.restoreDownloads(requests);

    logger.info(`Restored ${requests.length} pending downloads`);
  } catch (error) {
    logger.error('Failed to restore pending downloads:', error as Error);
  }
}
