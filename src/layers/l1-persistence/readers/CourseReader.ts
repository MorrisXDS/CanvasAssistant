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

/**
 * Archived course joined to its enrollment term. Narrow projection backing the
 * past-terms grade grouping (`PastTermGradesReader`). `term_name` / `term_end_at`
 * are null when the course has no matching term row.
 */
export interface ArchivedCourseWithTermRow {
  id: number;
  code: string;
  name: string;
  color: string | null;
  credits: number | null;
  enrollment_term_id: number | null;
  term_name: string | null;
  term_end_at: string | null;
}

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
   * JOIN affinity (fixed per ADR-0015): `courses.enrollment_term_id` stores
   * Canvas's term id, which sync writes into `enrollment_terms.external_id`
   * (TEXT) — NOT the numeric PK `et.id`. The CAST matches the proven-correct
   * join used by `VisibilityOracle` and the auto-archive query. (Previously
   * joined on `et.id`, which only happened to work when the autoincrement PK
   * coincided with the Canvas term id.)
   */
  getArchivedSortedByTermEnd(): CourseRow[] {
    return this.db.executeRead<CourseRow>(
      `SELECT c.*
       FROM courses c
       LEFT JOIN enrollment_terms et ON c.enrollment_term_id = CAST(et.external_id AS INTEGER)
       WHERE c.archived_at IS NOT NULL AND c.deleted_at IS NULL
       ORDER BY et.end_at DESC NULLS LAST, c.name ASC`
    );
  }

  /**
   * Archived courses joined to their enrollment term, projecting the fields the
   * past-terms grade grouping needs: course display fields + credits plus the
   * term name / end date. Same JOIN affinity + ordering as
   * `getArchivedSortedByTermEnd`. Excludes soft-deleted rows.
   */
  getArchivedWithTerm(): ArchivedCourseWithTermRow[] {
    return this.db.executeRead<ArchivedCourseWithTermRow>(
      `SELECT c.id, c.code, c.name, c.color, c.credits, c.enrollment_term_id,
              et.name AS term_name, et.end_at AS term_end_at
       FROM courses c
       LEFT JOIN enrollment_terms et ON c.enrollment_term_id = CAST(et.external_id AS INTEGER)
       WHERE c.archived_at IS NOT NULL AND c.deleted_at IS NULL
       ORDER BY et.end_at DESC NULLS LAST, c.name ASC`
    );
  }

  /**
   * Non-archived courses that have a code, projected to the fields the
   * imported-calendar title matcher needs. Used by the ICS import flow to
   * auto-detect which course an imported event belongs to.
   */
  getForCalendarMatching(): Array<{
    id: number;
    code: string;
    name: string;
    nickname: string | null;
  }> {
    return this.db.executeRead<{
      id: number;
      code: string;
      name: string;
      nickname: string | null;
    }>(
      'SELECT id, code, name, nickname FROM courses WHERE code IS NOT NULL AND archived_at IS NULL'
    );
  }

  /**
   * Per-course settings (auto-assign due date + allow-guessed-override),
   * or null if the course doesn't exist. Narrow projection used by the
   * `course:getSettings` IPC endpoint.
   */
  getSettingsById(id: number): {
    auto_assign_due_date: number | null;
    allow_guessed_override: number | null;
  } | null {
    return (
      this.db.executeReadOne<{
        auto_assign_due_date: number | null;
        allow_guessed_override: number | null;
      }>(
        `SELECT auto_assign_due_date, allow_guessed_override FROM courses WHERE id = ?`,
        [id]
      ) ?? null
    );
  }

  /**
   * Syllabus body + stored hash for a course identified by its Canvas
   * `external_id`, or null. Used by `html:downloadDependencies` to compute a
   * content hash for change-detection on a syllabus HTML source.
   */
  getSyllabusHashSourceByExternalId(externalId: string): {
    syllabus_body: string | null;
    syllabus_hash: string | null;
  } | null {
    return (
      this.db.executeReadOne<{
        syllabus_body: string | null;
        syllabus_hash: string | null;
      }>(`SELECT syllabus_body, syllabus_hash FROM courses WHERE external_id = ?`, [
        externalId,
      ]) ?? null
    );
  }

  /**
   * Per-course grade-authority settings (which source wins for late penalty,
   * drop-lowest, and grade calc), or null if the course doesn't exist.
   * Narrow projection used by the `data:getCourseAuthority` IPC endpoint.
   */
  getAuthorityById(id: number): {
    late_penalty_authority: string | null;
    drop_lowest_authority: string | null;
    grade_calc_mode: string | null;
  } | null {
    return (
      this.db.executeReadOne<{
        late_penalty_authority: string | null;
        drop_lowest_authority: string | null;
        grade_calc_mode: string | null;
      }>(
        `SELECT late_penalty_authority, drop_lowest_authority, grade_calc_mode FROM courses WHERE id = ?`,
        [id]
      ) ?? null
    );
  }
}
