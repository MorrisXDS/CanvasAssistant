/**
 * CourseReader — the only SQL surface for the `courses` table.
 *
 * Per ADR-0007, IPC handlers and other consumers MUST go through this reader
 * (or another named L1 service) to read course rows. Raw `database.execute*`
 * calls against `courses` are confined to this file (plus migrations and
 * sync code, neither of which lives in IPC handlers).
 *
 * Stateless. Returns raw DB rows (snake_case). Consumers map to DTOs at
 * their boundary (see `src/lifecycle/ipc-handlers/mappers/`).
 *
 * Visibility filtering is *not* this reader's job — it returns whatever rows
 * the requested IDs resolve to. Callers compose with `VisibilityOracle` to
 * get a filtered ID set, then ask the reader for those rows. Single-id
 * getters intentionally bypass visibility (per ADR-0007 sub-decision α —
 * list endpoints filter, single-id endpoints don't).
 */

import type { Database } from '../Database';
import type { CourseRow } from '../DatabaseRowTypes';

export class CourseReader {
  constructor(private readonly db: Database) {}

  /**
   * Get one course by primary key. Returns null if it doesn't exist.
   * Bypasses visibility — caller knew the id.
   */
  getById(id: number): CourseRow | null {
    return (
      this.db.executeReadOne<CourseRow>(`SELECT * FROM courses WHERE id = ?`, [id]) ??
      null
    );
  }

  /**
   * Get courses for the given id set, ordered by name. Empty input → empty output.
   */
  getByIds(ids: readonly number[]): CourseRow[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    return this.db.executeRead<CourseRow>(
      `SELECT * FROM courses WHERE id IN (${placeholders}) ORDER BY name`,
      [...ids]
    );
  }

  /**
   * Every row in `courses`. Intended for debug/admin endpoints only —
   * production callers should compose with `VisibilityOracle` and use
   * `getByIds`. Includes archived/hidden/deleted rows.
   */
  getAll(): CourseRow[] {
    return this.db.executeRead<CourseRow>(`SELECT * FROM courses`);
  }

  /**
   * Get archived courses sorted by their enrollment term's end date (most
   * recent first), then alphabetically by name. Excludes soft-deleted rows.
   *
   * The JOIN uses `enrollment_terms.id` (numeric PK) — courses store the
   * numeric term id in `enrollment_term_id`. (Pre-rename Oracle had a
   * `CAST(et.external_id AS INTEGER)` variant of this JOIN; that disagrees
   * with the IPC handler's existing JOIN and would warrant its own ticket.)
   */
  getArchivedSortedByTermEnd(): CourseRow[] {
    return this.db.executeRead<CourseRow>(
      `SELECT c.*
       FROM courses c
       LEFT JOIN enrollment_terms et ON c.enrollment_term_id = et.id
       WHERE c.archived_at IS NOT NULL AND c.deleted_at IS NULL
       ORDER BY et.end_at DESC NULLS LAST, c.name ASC`
    );
  }
}
