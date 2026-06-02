/**
 * RememberConflictPreferenceCommand — persists a "remember my choice" conflict
 * preference into `sync_preferences`, extracted from syncHandlers (ADR-0007).
 *
 * Writes the `prefer_canvas` column (the live conflict-resolution preference)
 * with `expires_at` support and the rememberForAll → NULL entity_id convention.
 * `ResolveSyncConflictCommand` now writes the same column (it previously wrote
 * the vestigial `prefer_local`, dropped in migration 108).
 */

import type { Database } from '../../../l1-persistence/Database';

export class RememberConflictPreferenceCommand {
  constructor(private readonly db: Database) {}

  execute(params: {
    entity: string;
    entityId: number | null;
    field: string;
    preferCanvas: boolean;
    expiresAt: string | null;
  }): void {
    this.db.executeWrite(
      `INSERT INTO sync_preferences (entity, entity_id, field, prefer_canvas, created_at, expires_at)
       VALUES (?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(entity, entity_id, field) DO UPDATE SET
         prefer_canvas = excluded.prefer_canvas,
         expires_at = excluded.expires_at`,
      [
        params.entity,
        params.entityId,
        params.field,
        params.preferCanvas ? 1 : 0,
        params.expiresAt,
      ],
      'sync_preferences'
    );
  }
}
