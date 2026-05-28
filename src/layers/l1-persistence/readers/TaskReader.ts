/**
 * TaskReader — the only SQL surface for the `tasks` table.
 *
 * Per ADR-0007 / ADR-0008 PR-D, IPC handlers and other consumers MUST go
 * through this reader (or another named L1 service) to read task rows.
 * Raw `database.execute*` calls against `tasks` are confined to this file
 * (plus migrations, sync code, and L4 commands, none of which live in IPC
 * handlers).
 *
 * Stateless. Returns raw DB rows (snake_case). Consumers map to DTOs at
 * their boundary.
 *
 * Visibility filtering is NOT this reader's job — single-id getters bypass
 * visibility (per ADR-0007 sub-decision α); list endpoints compose with
 * `VisibilityOracle.getVisibleCourseIds()` at the caller.
 *
 * Soft-delete: `deleted_at IS NOT NULL` rows are excluded by default. Pass
 * `{ includeDeleted: true }` to include them (used by archive/audit paths).
 */

import type { Database } from '../Database';
import type { TaskRow } from '../DatabaseRowTypes';

export class TaskReader {
  constructor(private readonly db: Database) {}

  /**
   * One task by primary key. Returns null when missing. Bypasses
   * visibility AND soft-delete — caller knew the id.
   */
  getById(id: number): TaskRow | null {
    return (
      this.db.executeReadOne<TaskRow>(`SELECT * FROM tasks WHERE id = ?`, [id]) ?? null
    );
  }

  /**
   * Tasks across a course-id set, ordered by `priority_score DESC` (the
   * default UI ordering). Defaults to non-soft-deleted rows; pass
   * `{ includeDeleted: true }` to include them.
   */
  getByCourseIds(
    courseIds: readonly number[],
    opts: { includeDeleted?: boolean } = {}
  ): TaskRow[] {
    if (courseIds.length === 0) return [];
    const placeholders = courseIds.map(() => '?').join(', ');
    const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.db.executeRead<TaskRow>(
      `SELECT * FROM tasks
       WHERE course_id IN (${placeholders}) ${deletedClause}
       ORDER BY priority_score DESC`,
      [...courseIds]
    );
  }

  /**
   * User-created tasks in one course that have not been linked to a
   * Canvas task — i.e. candidate merge targets for a QueuedTask.
   * Filters: `source_type='user'`, `external_id IS NULL`, `deleted_at IS NULL`.
   * Returns full TaskRow shape; callers run their own title-similarity
   * scoring (exact / fuzzy) over the result.
   */
  findUnlinkedUserTasksInCourse(courseId: number): TaskRow[] {
    return this.db.executeRead<TaskRow>(
      `SELECT * FROM tasks
       WHERE course_id = ?
         AND source_type = 'user'
         AND external_id IS NULL
         AND deleted_at IS NULL`,
      [courseId]
    );
  }
}
