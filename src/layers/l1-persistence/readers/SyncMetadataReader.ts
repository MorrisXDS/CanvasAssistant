/**
 * SyncMetadataReader — read surface for the `sync_metadata` table (per-endpoint
 * ETag / last-synced cursors).
 *
 * Per ADR-0007, IPC handlers route reads through this reader. Stateless.
 */

import type { Database } from '../Database';

export class SyncMetadataReader {
  constructor(private readonly db: Database) {}

  /**
   * The most recent `last_synced_at` across all endpoints, or null if nothing
   * has synced yet. Backs `sync:getLastSyncTime`.
   */
  getLastSyncedAt(): string | null {
    const row = this.db.executeReadOne<{ last_synced_at: string | null }>(
      'SELECT MAX(last_synced_at) as last_synced_at FROM sync_metadata'
    );
    return row?.last_synced_at ?? null;
  }
}
