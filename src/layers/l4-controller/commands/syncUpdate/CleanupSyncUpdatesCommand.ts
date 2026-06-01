/**
 * CleanupSyncUpdatesCommand — deletes old seen `sync_updates` and the now-empty
 * `sync_sessions`, extracted from syncUpdatesHandlers (ADR-0007).
 *
 * Returns the number of sync_updates rows deleted (the value the handler
 * surfaced). SQL preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class CleanupSyncUpdatesCommand {
  constructor(private readonly db: Database) {}

  /** Delete seen updates (and orphaned sessions) older than `olderThanDays`. */
  execute(olderThanDays: number): number {
    // Delete seen updates older than X days
    const updatesResult = this.db.executeWrite(
      `DELETE FROM sync_updates
          WHERE seen_at IS NOT NULL
          AND datetime(seen_at) < datetime('now', '-' || ? || ' days')`,
      [olderThanDays],
      'sync_updates'
    );

    // Delete old sync sessions with no remaining updates
    this.db.executeWrite(
      `DELETE FROM sync_sessions
          WHERE id NOT IN (SELECT DISTINCT sync_session_id FROM sync_updates)
          AND datetime(created_at) < datetime('now', '-' || ? || ' days')`,
      [olderThanDays],
      'sync_sessions'
    );

    return updatesResult.changes;
  }
}
