/**
 * ResolveSyncConflictCommand — applies a conflict resolution across
 * `sync_updates` + `sync_preferences`, extracted from syncUpdatesHandlers
 * (ADR-0007). The handler reads the conflict row first (via SyncUpdateReader)
 * and passes it in; this command performs the three writes:
 *
 *   1. Mark the conflict row resolved (resolution + remember flag + timestamps).
 *   2. If `rememberChoice` and the conflict names a field, persist the choice
 *      to `sync_preferences`.
 *   3. Mark sibling informational updates for the SAME field as seen.
 *
 * SQL preserved verbatim — note the `sync_preferences.prefer_local` column is
 * the one written here (the vestigial-but-live write path); do not "modernize"
 * it to `prefer_canvas` without a schema migration.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { SyncUpdateRow } from '../../../l1-persistence/DatabaseRowTypes';

export class ResolveSyncConflictCommand {
  constructor(private readonly db: Database) {}

  execute(
    updateId: number,
    resolution: 'local' | 'canvas',
    rememberChoice: boolean,
    conflict: SyncUpdateRow
  ): void {
    // 1. Mark conflict as resolved
    this.db.executeWrite(
      `UPDATE sync_updates
          SET
            conflict_resolution = ?,
            remember_choice = ?,
            resolved_at = CURRENT_TIMESTAMP,
            seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP)
          WHERE id = ?`,
      [resolution, rememberChoice ? 1 : 0, updateId],
      'sync_updates'
    );

    // 2. If rememberChoice, save to sync_preferences table
    if (rememberChoice && conflict.conflict_field) {
      this.db.executeWrite(
        `INSERT OR REPLACE INTO sync_preferences
            (entity, entity_id, field, prefer_local, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          conflict.entity_type,
          conflict.entity_id,
          conflict.conflict_field,
          resolution === 'local' ? 1 : 0,
        ],
        'sync_preferences'
      );
    }

    // 3. Mark informational updates for the SAME FIELD as seen
    if (conflict.entity_id && conflict.conflict_field) {
      this.db.executeWrite(
        `UPDATE sync_updates
            SET seen_at = CURRENT_TIMESTAMP
            WHERE entity_id = ?
            AND changed_field = ?
            AND entity_type != 'conflict'
            AND seen_at IS NULL`,
        [conflict.entity_id, conflict.conflict_field],
        'sync_updates'
      );
    }
  }
}
