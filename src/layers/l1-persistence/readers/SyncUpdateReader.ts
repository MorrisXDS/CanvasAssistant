/**
 * SyncUpdateReader — SQL read surface for the `sync_updates` feed (plus the
 * small task/resource lookups the debug test-data endpoint needs).
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader. Visibility
 * filtering is *not* this reader's job — the list methods take an already
 * VisibilityOracle-filtered `visibleCourseIds` set and compose the `IN (...)`
 * clause (ADR-0007 sub-decision α: list endpoints filter, point lookups and
 * debug endpoints don't). Stateless; returns raw rows / plain aggregate shapes.
 */

import type { Database } from '../Database';
import type { SyncUpdateRow, SyncUpdateRowWithCourse } from '../DatabaseRowTypes';

/** Aggregate counts backing the FAB badge (`syncUpdates:getCount`). */
export interface SyncUpdateCounts {
  informational: number;
  conflicts: number;
  actionRequired: number;
  byCourse: Record<string, number>;
  byType: Record<string, number>;
}

/** One per change_type row for the debug status endpoint. */
export interface SyncUpdateStatusStat {
  change_type: string;
  total: number;
  unseen: number;
}

/** Debug status payload (`syncUpdates:getStatus`). */
export interface SyncUpdateStatus {
  totalUnseen: number;
  byType: SyncUpdateStatusStat[];
}

/** Minimal {id, title} projection used to seed test data. */
export interface SyncSeedEntityRow {
  id: number;
  title: string;
}

export class SyncUpdateReader {
  constructor(private readonly db: Database) {}

  /**
   * Unseen (or, with `includeResolved`, all) sync updates for the given
   * visible courses, joined to course display fields, newest first. Caller
   * guarantees `visibleCourseIds` is non-empty.
   */
  getAllWithCourse(
    visibleCourseIds: readonly number[],
    includeResolved: boolean,
    limit: number
  ): SyncUpdateRowWithCourse[] {
    const placeholders = visibleCourseIds.map(() => '?').join(', ');
    const seenCondition = includeResolved
      ? ''
      : 'AND (su.seen_at IS NULL OR (su.entity_type = ? AND su.resolved_at IS NULL))';

    const params = includeResolved
      ? [...visibleCourseIds, limit]
      : [...visibleCourseIds, 'conflict', limit];

    const sql = `
          SELECT
            su.*,
            c.code as course_code,
            c.name as course_name,
            c.color as course_color
          FROM sync_updates su
          JOIN courses c ON su.course_id = c.id
          WHERE su.course_id IN (${placeholders})
          ${seenCondition}
          ORDER BY su.created_at DESC
          LIMIT ?
        `;

    return this.db.executeRead<SyncUpdateRowWithCourse>(sql, params);
  }

  /**
   * The five badge aggregations for the given visible courses. Caller
   * guarantees `visibleCourseIds` is non-empty.
   */
  getCounts(visibleCourseIds: readonly number[]): SyncUpdateCounts {
    const placeholders = visibleCourseIds.map(() => '?').join(', ');
    const ids = [...visibleCourseIds];

    // Unseen informational updates (NOT action-required, NOT conflicts)
    const informational =
      this.db.executeRead<{ count: number }>(
        `SELECT COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND seen_at IS NULL
        AND entity_type != 'conflict'
        AND (is_action_required IS NULL OR is_action_required = 0)`,
        ids
      )[0]?.count ?? 0;

    // Unresolved conflicts
    const conflicts =
      this.db.executeRead<{ count: number }>(
        `SELECT COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND entity_type = 'conflict'
        AND resolved_at IS NULL`,
        ids
      )[0]?.count ?? 0;

    // Action-required items (excluding conflicts, counted separately)
    const actionRequired =
      this.db.executeRead<{ count: number }>(
        `SELECT COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND seen_at IS NULL
        AND is_action_required = 1
        AND entity_type != 'conflict'`,
        ids
      )[0]?.count ?? 0;

    // By course
    const byCourseResult = this.db.executeRead<{ course_id: number; count: number }>(
      `SELECT course_id, COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND (seen_at IS NULL OR (entity_type = 'conflict' AND resolved_at IS NULL))
        GROUP BY course_id`,
      ids
    );
    const byCourse: Record<string, number> = {};
    for (const row of byCourseResult) {
      byCourse[String(row.course_id)] = row.count;
    }

    // By type
    const byTypeResult = this.db.executeRead<{ entity_type: string; count: number }>(
      `SELECT entity_type, COUNT(*) as count FROM sync_updates
        WHERE course_id IN (${placeholders})
        AND (seen_at IS NULL OR (entity_type = 'conflict' AND resolved_at IS NULL))
        GROUP BY entity_type`,
      ids
    );
    const byType: Record<string, number> = {};
    for (const row of byTypeResult) {
      byType[row.entity_type] = row.count;
    }

    return { informational, conflicts, actionRequired, byCourse, byType };
  }

  /**
   * An unresolved conflict update by its `external_id` (entity_type =
   * 'conflict', resolved_at IS NULL), projected to the fields `sync:resolveConflict`
   * needs to reconstruct the conflict. Null if none.
   */
  getUnresolvedConflictByExternalId(externalId: string): {
    id: number;
    entity_id: number;
    conflict_field: string;
    old_value: string | null;
    new_value: string | null;
    external_id: string | null;
  } | null {
    return (
      this.db.executeReadOne<{
        id: number;
        entity_id: number;
        conflict_field: string;
        old_value: string | null;
        new_value: string | null;
        external_id: string | null;
      }>(
        `SELECT id, entity_id, conflict_field, old_value, new_value, external_id
         FROM sync_updates
         WHERE external_id = ? AND entity_type = 'conflict' AND resolved_at IS NULL`,
        [externalId]
      ) ?? null
    );
  }

  /** A single conflict update by id (entity_type = 'conflict'), or null. */
  getConflictById(updateId: number): SyncUpdateRow | null {
    return (
      this.db.executeReadOne<SyncUpdateRow>(
        `SELECT * FROM sync_updates WHERE id = ? AND entity_type = 'conflict'`,
        [updateId]
      ) ?? null
    );
  }

  /** First task in a course (debug test-data seeding), or null. */
  getFirstTaskInCourse(courseId: number): SyncSeedEntityRow | null {
    return (
      this.db.executeReadOne<SyncSeedEntityRow>(
        'SELECT id, title FROM tasks WHERE course_id = ? LIMIT 1',
        [courseId]
      ) ?? null
    );
  }

  /** First resource in a course (debug test-data seeding), or null. */
  getFirstResourceInCourse(courseId: number): SyncSeedEntityRow | null {
    return (
      this.db.executeReadOne<SyncSeedEntityRow>(
        'SELECT id, title FROM resources WHERE course_id = ? LIMIT 1',
        [courseId]
      ) ?? null
    );
  }

  /** Debug status: per-change_type totals + grand-total unseen. */
  getStatus(): SyncUpdateStatus {
    const byType = this.db.executeRead<SyncUpdateStatusStat>(`
        SELECT
          change_type,
          COUNT(*) as total,
          SUM(CASE WHEN seen_at IS NULL THEN 1 ELSE 0 END) as unseen
        FROM sync_updates
        GROUP BY change_type
      `);

    const totalUnseen =
      this.db.executeRead<{ count: number }>(
        'SELECT COUNT(*) as count FROM sync_updates WHERE seen_at IS NULL'
      )[0]?.count ?? 0;

    return { totalUnseen, byType };
  }
}
