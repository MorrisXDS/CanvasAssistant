/**
 * MarkSyncUpdatesSeenCommand — marks `sync_updates` rows as seen, extracted
 * from syncUpdatesHandlers (ADR-0007). Three write shapes:
 *   - `byIds`    — a specific set of update ids
 *   - `all`      — all unseen updates for the visible courses, with optional
 *                  course / entity-type / conflict / action-required filters
 *   - `byEntity` — every unseen update referencing one (entityType, entityId)
 *
 * Each returns the number of rows marked (`executeWrite().changes`, identical
 * to the `SELECT changes()` the handler previously issued). SQL preserved
 * verbatim, including the dynamic-WHERE assembly in `all`.
 */

import type { Database } from '../../../l1-persistence/Database';

export interface MarkAllSeenFilters {
  courseId?: number;
  entityType?: string;
  excludeConflicts?: boolean;
  excludeActionRequired?: boolean;
}

export class MarkSyncUpdatesSeenCommand {
  constructor(private readonly db: Database) {}

  /** Mark the given update ids seen (skips already-seen). Returns rows marked. */
  byIds(ids: number[]): number {
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db.executeWrite(
      `UPDATE sync_updates
        SET seen_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders}) AND seen_at IS NULL`,
      ids,
      'sync_updates'
    );
    return result.changes;
  }

  /**
   * Mark all unseen updates for the (non-empty) visible courses seen, honoring
   * optional filters. Returns rows marked. The `excludeActionRequired` default
   * is "exclude unless explicitly set to false" — preserved verbatim.
   */
  all(visibleCourseIds: readonly number[], filters: MarkAllSeenFilters = {}): number {
    const conditions: string[] = ['seen_at IS NULL'];
    const values: (number | string)[] = [];

    const placeholders = visibleCourseIds.map(() => '?').join(', ');
    conditions.push(`course_id IN (${placeholders})`);
    values.push(...visibleCourseIds);

    if (filters.courseId !== undefined) {
      conditions.push('course_id = ?');
      values.push(filters.courseId);
    }

    if (filters.entityType) {
      conditions.push('entity_type = ?');
      values.push(filters.entityType);
    }

    if (filters.excludeConflicts) {
      conditions.push("entity_type != 'conflict'");
    }

    // Default to excluding action-required when marking informational as read
    if (filters.excludeActionRequired !== false) {
      conditions.push('(is_action_required IS NULL OR is_action_required = 0)');
    }

    const result = this.db.executeWrite(
      `UPDATE sync_updates
          SET seen_at = CURRENT_TIMESTAMP
          WHERE ${conditions.join(' AND ')}`,
      values,
      'sync_updates'
    );
    return result.changes;
  }

  /** Mark every unseen update for (entityType, entityId) seen. Returns rows marked. */
  byEntity(entityType: string, entityId: number): number {
    const result = this.db.executeWrite(
      `UPDATE sync_updates
          SET seen_at = CURRENT_TIMESTAMP
          WHERE entity_type = ? AND entity_id = ? AND seen_at IS NULL`,
      [entityType, entityId],
      'sync_updates'
    );
    return result.changes;
  }
}
