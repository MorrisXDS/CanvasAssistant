/**
 * ClearSyncedFilesCommand — wipes synced file data (resources + notification
 * attachments + the files/folders sync-metadata cursors), extracted from
 * fileHandlers (ADR-0007).
 *
 * Owns its own transaction so all three deletes commit atomically (the handler
 * previously wrapped them in `database.transaction`). SQL preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class ClearSyncedFilesCommand {
  constructor(private readonly db: Database) {}

  execute(): void {
    this.db.transaction(() => {
      // Clear resources (Canvas files/folders)
      this.db.executeWrite('DELETE FROM resources', [], 'resources');
      // Clear notification attachments
      this.db.executeWrite(
        'DELETE FROM notification_attachments',
        [],
        'notification_attachments'
      );
      // Clear sync metadata for files/folders endpoints
      this.db.executeWrite(
        "DELETE FROM sync_metadata WHERE endpoint LIKE '%/files' OR endpoint LIKE '%/folders'",
        [],
        'sync_metadata'
      );
    });
  }
}
