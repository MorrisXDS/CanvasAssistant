/**
 * VisibilityOracle — single source of truth for course visibility state.
 *
 * Per ADR-0007 (Future 2 shape): this is a pure visibility-state oracle. It
 * answers questions ("what's visible?", "is this course archived?", "what's
 * the term selection?") and emits invalidation events. It does NOT return
 * row data — `CourseReader` (and future per-table readers) own that.
 *
 * Responsibilities:
 *  1. Own the term-selection setting (read/write to `visibility_settings`).
 *  2. Compute the visible-course-ID set (the canonical visibility recipe:
 *     not hidden, not deleted, not archived, passes term filter).
 *  3. Provide the same answer for the archived set.
 *  4. Cache the visible-ID set for ~5s and emit invalidation events.
 *
 * Consumers (IPC handlers, L4 commands, L3 services if any survive) compose
 * an Oracle call (ID set) with a Reader call (rows). The two interfaces are
 * orthogonal and tested separately.
 */

import { EventEmitter } from 'events';
import { Database } from './Database';
import { TERM_END_BUFFER_DAYS } from './constants/termLinger';

/**
 * Term selection options:
 *  - 'all': Show all non-hidden courses regardless of term
 *  - 'auto': Show courses from currently active terms (end_at > now - 30 days)
 *  - number: Show courses from a specific term ID
 */
export type TermSelection = 'all' | 'auto' | number;

/**
 * Task row shape returned by the transitional `getTasksForArchivedCourse`
 * shim. Kept here only until PR-D introduces `TaskReader`.
 *
 * @deprecated Will move to `TaskReader` (PR-D of ADR-0007).
 */
export interface VisibleTaskRow {
  id: number;
  external_id: string | null;
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  weight: number | null;
  grade: number | null;
  priority_score: number;
  is_completed: number;
  completed_at: string | null;
  task_type: string | null;
  task_group_id: number | null;
  submission_status: string | null;
}

/**
 * Configuration for VisibilityOracle.
 */
export interface VisibilityOracleConfig {
  /** Days buffer for term end date calculation (default: 30) */
  termEndBufferDays?: number;
}

const DEFAULT_CONFIG: Required<VisibilityOracleConfig> = {
  // Single source of truth shared with auto-archive (see ADR-0015). No behavior
  // change here — the value is still 30 — it just stops being a magic number.
  termEndBufferDays: TERM_END_BUFFER_DAYS,
};

/**
 * VisibilityOracle - the visibility-state seam.
 *
 * Events:
 *  - 'visibility-changed': Emitted when a course's visibility changes
 *  - 'settings-changed': Emitted when term selection changes
 */
export class VisibilityOracle extends EventEmitter {
  private db: Database;
  private config: Required<VisibilityOracleConfig>;
  private cachedVisibleCourseIds: number[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache

  constructor(db: Database, config?: VisibilityOracleConfig) {
    super();
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============ Settings Management ============

  /**
   * Get the current term selection setting from the database.
   */
  getTermSelection(): TermSelection {
    const row = this.db.executeReadOne<{ value: string }>(
      `SELECT value FROM visibility_settings WHERE key = 'term_selection'`
    );
    const val = row?.value ?? 'auto';
    if (val === 'all' || val === 'auto') return val;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 'auto' : parsed;
  }

  /**
   * Set the term selection setting in the database.
   */
  setTermSelection(value: TermSelection): void {
    this.db.executeWrite(
      `INSERT OR REPLACE INTO visibility_settings (key, value, updated_at)
       VALUES ('term_selection', ?, CURRENT_TIMESTAMP)`,
      [String(value)],
      'visibility_settings'
    );
    this.invalidateCache();
    this.emit('settings-changed', { key: 'term_selection', value });
  }

  // ============ Visibility Queries (single source of truth) ============

  /**
   * Get the IDs of all currently-visible courses. A course is visible when:
   *  1. `is_hidden = 0` (not hidden by user)
   *  2. `deleted_at IS NULL` (not soft-deleted)
   *  3. `archived_at IS NULL` (not archived)
   *  4. Passes the active term-selection filter
   *
   * Cached for ~5s (per ADR-0007 sub-decision; cache is invalidated on
   * visibility/settings change events).
   */
  getVisibleCourseIds(): number[] {
    if (
      this.cachedVisibleCourseIds !== null &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.cachedVisibleCourseIds;
    }

    const termSelection = this.getTermSelection();
    let sql = `
      SELECT id FROM courses
      WHERE deleted_at IS NULL AND is_hidden = 0 AND archived_at IS NULL
    `;

    if (termSelection === 'auto') {
      // Auto: filter by currently active terms. Canvas end_at is typically
      // ~30 days after the actual course end, so we look back that far.
      sql += `
        AND enrollment_term_id IN (
          SELECT CAST(external_id AS INTEGER) FROM enrollment_terms
          WHERE datetime(end_at) > datetime('now', '-${this.config.termEndBufferDays} days')
            AND name != 'Default Term'
        )
      `;
    } else if (typeof termSelection === 'number') {
      sql += ` AND enrollment_term_id = ${termSelection}`;
    }
    // 'all' = no additional filter (just is_hidden / deleted_at / archived_at)

    const rows = this.db.executeRead<{ id: number }>(sql);
    this.cachedVisibleCourseIds = rows.map((r) => r.id);
    this.cacheTimestamp = Date.now();
    return this.cachedVisibleCourseIds;
  }

  /**
   * Predicate: is this specific course currently visible?
   */
  isCourseVisible(courseId: number): boolean {
    return this.getVisibleCourseIds().includes(courseId);
  }

  // ============ Archived state ============

  /**
   * Get the IDs of archived (non-deleted) courses. Order is not specified
   * here — for ordered archived listings, call `CourseReader.getArchivedSortedByTermEnd()`.
   */
  getArchivedCourseIds(): number[] {
    const rows = this.db.executeRead<{ id: number }>(
      `SELECT id FROM courses
       WHERE deleted_at IS NULL AND archived_at IS NOT NULL`
    );
    return rows.map((r) => r.id);
  }

  /**
   * Predicate: is this specific course archived?
   */
  isCourseArchived(courseId: number): boolean {
    const row = this.db.executeReadOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM courses WHERE id = ?`,
      [courseId]
    );
    return row?.archived_at != null;
  }

  /**
   * Get tasks for an archived course (bypasses visibility filtering).
   *
   * Archived courses are local-only sandboxes — users can view and edit
   * their data without affecting visible/active workflows.
   *
   * @deprecated Transitional shim. This is task-table data and will move to
   * `TaskReader.getByArchivedCourseId` in PR-D of ADR-0007. Kept here for
   * now because `taskDataHandlers.ts:205` still consumes it; that handler
   * migrates as part of PR-D.
   */
  getTasksForArchivedCourse(courseId: number): VisibleTaskRow[] {
    const course = this.db.executeReadOne<{ id: number; archived_at: string | null }>(
      `SELECT id, archived_at FROM courses WHERE id = ? AND deleted_at IS NULL`,
      [courseId]
    );

    if (!course || !course.archived_at) {
      return []; // Course doesn't exist or isn't archived
    }

    return this.db.executeRead<VisibleTaskRow>(
      `SELECT * FROM tasks
       WHERE course_id = ?
       ORDER BY due_at ASC NULLS LAST, priority_score DESC`,
      [courseId]
    );
  }

  // ============ Cache & Event Emission ============

  /**
   * Invalidate the cached visible-ID set. Idempotent.
   */
  invalidateCache(): void {
    this.cachedVisibleCourseIds = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Notify that a course's visibility changed. Called from
   * `UpdateCoursePreferencesCommand` / `ArchiveCourseCommand` /
   * `UnarchiveCourseCommand` when state that affects visibility mutates.
   */
  notifyVisibilityChanged(courseId?: number): void {
    this.invalidateCache();
    this.emit('visibility-changed', { courseId });
  }

  /**
   * Stop the oracle (no timers to stop, but follows the L0–L1 service
   * convention).
   */
  stop(): void {
    this.removeAllListeners();
    this.invalidateCache();
  }
}
