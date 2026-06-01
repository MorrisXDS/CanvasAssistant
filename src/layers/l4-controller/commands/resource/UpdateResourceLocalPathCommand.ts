/**
 * UpdateResourceLocalPathCommand — partial updates to a resource's local_path,
 * extracted from resourceHandlers (ADR-0007).
 *
 * Two distinct writes:
 *   - `markDownloaded` — after a successful download, set local_path + synced_at.
 *   - `clear` — when a file is found missing on disk, null out local_path so the
 *     UI re-prompts for download.
 *
 * Both are simple `UPDATE resources … WHERE id = ?`; SQL preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class UpdateResourceLocalPathCommand {
  constructor(private readonly db: Database) {}

  /** Record a freshly-downloaded file's local path + sync timestamp. */
  markDownloaded(id: number, localPath: string, syncedAt: string): void {
    this.db.executeWrite(
      'UPDATE resources SET local_path = ?, synced_at = ? WHERE id = ?',
      [localPath, syncedAt, id],
      'resources'
    );
  }

  /** Clear a resource's local_path (file deleted from disk). */
  clear(id: number): void {
    this.db.executeWrite(
      'UPDATE resources SET local_path = NULL WHERE id = ?',
      [id],
      'resources'
    );
  }
}
