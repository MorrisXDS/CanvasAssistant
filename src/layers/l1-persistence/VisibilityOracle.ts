/**
 * VisibilityOracle - Single Source of Truth for Course Visibility
 *
 * This service centralizes all visibility rules to ensure consistent filtering
 * across L3 orchestrators, L5 store, and IPC handlers.
 *
 * Responsibilities:
 * 1. Store visibility settings in the database (not localStorage)
 * 2. Provide visibility-filtered queries for courses and tasks
 * 3. Emit events when visibility changes for cache invalidation
 * 4. Be the ONLY place that defines what "visible" means
 *
 * Usage:
 * - L3 orchestrators MUST use this instead of raw SQL
 * - L5 store reads term selection via IPC from this service
 * - UpdateCoursePreferencesCommand notifies this service of visibility changes
 */

import { EventEmitter } from 'events';
import { Database } from './Database';

/**
 * Term selection options:
 * - 'all': Show all non-hidden courses regardless of term
 * - 'auto': Show courses from currently active terms (end_at > now - 30 days)
 * - number: Show courses from specific term ID
 */
export type TermSelection = 'all' | 'auto' | number;

/**
 * Course row from database
 */
export interface VisibleCourseRow {
  id: number;
  external_id: string;
  code: string;
  name: string;
  current_grade: number | null;
  assessed_grade: number | null;
  target_grade: number;
  total_weight: number;
  color: string | null;
  nickname: string | null;
  is_hidden: number;
  enrollment_term_id: number | null;
  deleted_at: string | null;
  archived_at: string | null;
}

/**
 * Task row from database
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
 * Configuration for VisibilityOracle
 */
export interface VisibilityOracleConfig {
  /** Days buffer for term end date calculation (default: 30) */
  termEndBufferDays?: number;
}

const DEFAULT_CONFIG: Required<VisibilityOracleConfig> = {
  termEndBufferDays: 30,
};

/**
 * VisibilityOracle - Centralized visibility rules
 *
 * Events:
 * - 'visibility-changed': Emitted when a course's visibility changes
 * - 'settings-changed': Emitted when term selection changes
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
   * Get the current term selection setting from database
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
   * Set the term selection setting in database
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

  // ============ Visibility Queries (Single Source of Truth) ============

  /**
   * Get IDs of all visible courses based on:
   * 1. is_hidden = 0 (not hidden by user)
   * 2. deleted_at IS NULL (not soft-deleted)
   * 3. archived_at IS NULL (not archived)
   * 4. Term selection (all, auto, or specific term)
   */
  getVisibleCourseIds(): number[] {
    // Check cache
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
      // Auto: filter by currently active terms
      // Canvas end_at is usually ~30 days after actual course end
      sql += `
        AND enrollment_term_id IN (
          SELECT CAST(external_id AS INTEGER) FROM enrollment_terms
          WHERE datetime(end_at) > datetime('now', '-${this.config.termEndBufferDays} days')
            AND name != 'Default Term'
        )
      `;
    } else if (typeof termSelection === 'number') {
      // Specific term selected
      sql += ` AND enrollment_term_id = ${termSelection}`;
    }
    // 'all' = no additional filter (just is_hidden and deleted_at)

    const rows = this.db.executeRead<{ id: number }>(sql);
    this.cachedVisibleCourseIds = rows.map((r) => r.id);
    this.cacheTimestamp = Date.now();
    return this.cachedVisibleCourseIds;
  }

  /**
   * Get all visible courses (full rows)
   */
  getVisibleCourses(): VisibleCourseRow[] {
    const visibleIds = this.getVisibleCourseIds();
    if (visibleIds.length === 0) return [];

    return this.db.executeRead<VisibleCourseRow>(`
      SELECT * FROM courses
      WHERE id IN (${visibleIds.join(',')})
      ORDER BY name
    `);
  }

  /**
   * Get all tasks for visible courses
   */
  getVisibleTasks(): VisibleTaskRow[] {
    const visibleIds = this.getVisibleCourseIds();
    if (visibleIds.length === 0) return [];

    return this.db.executeRead<VisibleTaskRow>(`
      SELECT * FROM tasks
      WHERE course_id IN (${visibleIds.join(',')})
    `);
  }

  /**
   * Get incomplete tasks for visible courses
   */
  getVisibleIncompleteTasks(): VisibleTaskRow[] {
    const visibleIds = this.getVisibleCourseIds();
    if (visibleIds.length === 0) return [];

    return this.db.executeRead<VisibleTaskRow>(`
      SELECT * FROM tasks
      WHERE course_id IN (${visibleIds.join(',')})
        AND is_completed = 0
      ORDER BY due_at ASC
    `);
  }

  /**
   * Check if a specific course is visible
   */
  isCourseVisible(courseId: number): boolean {
    const visibleIds = this.getVisibleCourseIds();
    return visibleIds.includes(courseId);
  }

  // ============ Archived Courses ============

  /**
   * Get all archived courses (archived_at IS NOT NULL)
   * Sorted by term end date (primary), then alphabetically by code (secondary)
   */
  getArchivedCourses(): VisibleCourseRow[] {
    return this.db.executeRead<VisibleCourseRow>(`
      SELECT c.* FROM courses c
      LEFT JOIN enrollment_terms et ON c.enrollment_term_id = CAST(et.external_id AS INTEGER)
      WHERE c.deleted_at IS NULL AND c.archived_at IS NOT NULL
      ORDER BY et.end_at DESC NULLS LAST, c.code ASC
    `);
  }

  /**
   * Get IDs of archived courses
   */
  getArchivedCourseIds(): number[] {
    const rows = this.db.executeRead<{ id: number }>(`
      SELECT id FROM courses
      WHERE deleted_at IS NULL AND archived_at IS NOT NULL
    `);
    return rows.map((r) => r.id);
  }

  /**
   * Check if a specific course is archived
   */
  isCourseArchived(courseId: number): boolean {
    const row = this.db.executeReadOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM courses WHERE id = ?`,
      [courseId]
    );
    return row?.archived_at != null;
  }

  /**
   * Get tasks for an archived course (bypasses visibility filtering)
   *
   * Archived courses are local-only sandboxes - users can view and edit
   * their data without affecting visible/active course workflows.
   *
   * @param courseId - The archived course ID
   * @returns Tasks for the course, or empty array if course doesn't exist or isn't archived
   */
  getTasksForArchivedCourse(courseId: number): VisibleTaskRow[] {
    // Verify course exists and is archived
    const course = this.db.executeReadOne<{ id: number; archived_at: string | null }>(
      `SELECT id, archived_at FROM courses WHERE id = ? AND deleted_at IS NULL`,
      [courseId]
    );

    if (!course || !course.archived_at) {
      return []; // Course doesn't exist or isn't archived
    }

    return this.db.executeRead<VisibleTaskRow>(
      `
      SELECT * FROM tasks
      WHERE course_id = ?
      ORDER BY due_at ASC NULLS LAST, priority_score DESC
    `,
      [courseId]
    );
  }

  // ============ Event Emission ============

  /**
   * Invalidate the cache and optionally emit visibility changed event
   */
  invalidateCache(): void {
    this.cachedVisibleCourseIds = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Notify that a course's visibility has changed
   * Call this from UpdateCoursePreferencesCommand when isHidden changes
   */
  notifyVisibilityChanged(courseId?: number): void {
    this.invalidateCache();
    this.emit('visibility-changed', { courseId });
  }

  /**
   * Stop the provider (no timers to stop, but follows convention)
   */
  stop(): void {
    this.removeAllListeners();
    this.invalidateCache();
  }
}
