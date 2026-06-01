/**
 * MarkConflictResolvedCommand — marks the `sync_updates` conflict row(s)
 * resolved, extracted from syncHandlers (ADR-0007). Two shapes:
 *   - `byExternalId` — single conflict resolved via `sync:resolveConflict`
 *     (also stamps resolved_at).
 *   - `byEntityField` — bulk resolution via `sync:resolveAllConflicts` (matches
 *     unseen conflict rows for an entity + field).
 *
 * SQL preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';

export class MarkConflictResolvedCommand {
  constructor(private readonly db: Database) {}

  /** Mark a single conflict (by external_id) seen + resolved. */
  byExternalId(externalId: string, resolution: 'canvas' | 'local'): void {
    this.db.executeWrite(
      `UPDATE sync_updates
       SET seen_at = datetime('now'),
           resolved_at = datetime('now'),
           conflict_resolution = ?
       WHERE external_id = ? AND entity_type = 'conflict'`,
      [resolution, externalId],
      'sync_updates'
    );
  }

  /** Mark unseen conflict rows for (entity_id, field) seen + resolved. */
  byEntityField(entityId: number, field: string, resolution: 'canvas' | 'local'): void {
    this.db.executeWrite(
      `UPDATE sync_updates
       SET seen_at = datetime('now'),
           conflict_resolution = ?
       WHERE entity_type = 'conflict'
         AND entity_id = ?
         AND conflict_field = ?
         AND seen_at IS NULL`,
      [resolution, entityId, field],
      'sync_updates'
    );
  }
}
