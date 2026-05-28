/**
 * CanvasFileReader — the only SQL surface for `resources` rows where
 * `type='file'` (per ADR-0007 / ADR-0008).
 *
 * Stateless. Returns raw DB rows (snake_case). Consumers map to
 * FileEntity at the `FileEntityProvider` boundary; raw rows do not
 * cross into the IPC layer.
 *
 * Visibility filtering is *not* this reader's job — single-id lookups
 * bypass visibility; list-scope filtering is composed at the provider
 * or IPC handler. See ADR-0007 sub-decision α (list endpoints filter,
 * single-id endpoints don't).
 *
 * Scope: only `type='file'` rows. The `resources` table also stores
 * folders, pages, and external URLs — those are out of scope for the
 * FileEntity unification.
 */

import type { Database } from '../Database';
import type { CanvasFileRow } from '../DatabaseRowTypes';

export class CanvasFileReader {
  constructor(private readonly db: Database) {}

  /**
   * Get one Canvas file by its Canvas-side external_id. Returns null
   * if no `resources` row matches (the blob is announcement-attachment-
   * only, or not yet synced).
   */
  getByExternalId(externalId: string): CanvasFileRow | null {
    return (
      this.db.executeReadOne<CanvasFileRow>(
        `SELECT * FROM resources WHERE external_id = ? AND type = 'file'`,
        [externalId]
      ) ?? null
    );
  }

  /**
   * Batch lookup by external_id. Returns a Map keyed by external_id so
   * callers can detect misses. Empty input → empty Map.
   */
  getByExternalIds(externalIds: readonly string[]): Map<string, CanvasFileRow> {
    const result = new Map<string, CanvasFileRow>();
    if (externalIds.length === 0) return result;
    const placeholders = externalIds.map(() => '?').join(', ');
    const rows = this.db.executeRead<CanvasFileRow>(
      `SELECT * FROM resources
       WHERE external_id IN (${placeholders}) AND type = 'file'`,
      [...externalIds]
    );
    for (const row of rows) {
      result.set(row.external_id, row);
    }
    return result;
  }

  /**
   * Get all Canvas files in the given course ids. Empty input → empty
   * array. Course-scope filtering only — the caller composes visibility
   * via `VisibilityOracle.getVisibleCourseIds()` before calling.
   */
  getByCourseIds(courseIds: readonly number[]): CanvasFileRow[] {
    if (courseIds.length === 0) return [];
    const placeholders = courseIds.map(() => '?').join(', ');
    return this.db.executeRead<CanvasFileRow>(
      `SELECT * FROM resources
       WHERE course_id IN (${placeholders}) AND type = 'file'
       ORDER BY title`,
      [...courseIds]
    );
  }
}
