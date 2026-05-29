/**
 * TaskTypeReader — the only SQL read surface for the `custom_task_types`
 * table (user-defined task types).
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader rather
 * than calling `database.execute*` directly. Writes go through the L4
 * commands (`CreateTaskTypeCommand` / `DeleteTaskTypeCommand`).
 *
 * Stateless. Returns raw DB rows (snake_case). Custom task types are NOT
 * course-scoped in the visibility sense — a row with `course_id IS NULL`
 * is a global type and a row with a `course_id` is scoped to that course.
 * The list endpoint optionally narrows to one course OR globals; there is
 * no archived/hidden filtering for this table.
 */

import type { Database } from '../Database';
import type { CustomTaskTypeRow } from '../DatabaseRowTypes';

export class TaskTypeReader {
  constructor(private readonly db: Database) {}

  /**
   * All custom task types, ordered by `display_name` (ASC). When
   * `courseId` is provided, returns that course's types plus globals
   * (`course_id IS NULL`); otherwise returns every row.
   */
  getAll(courseId?: number): CustomTaskTypeRow[] {
    if (courseId !== undefined) {
      return this.db.executeRead<CustomTaskTypeRow>(
        `SELECT id, name, display_name, course_id, created_at
         FROM custom_task_types
         WHERE course_id = ? OR course_id IS NULL
         ORDER BY display_name ASC`,
        [courseId]
      );
    }
    return this.db.executeRead<CustomTaskTypeRow>(
      `SELECT id, name, display_name, course_id, created_at
       FROM custom_task_types
       ORDER BY display_name ASC`
    );
  }

  /**
   * Single row by its normalized `name`, or null. Used to enforce the
   * UNIQUE(name) constraint before an insert.
   */
  getByName(name: string): CustomTaskTypeRow | null {
    return (
      this.db.executeReadOne<CustomTaskTypeRow>(
        `SELECT id, name, display_name, course_id, created_at
         FROM custom_task_types
         WHERE name = ?`,
        [name]
      ) ?? null
    );
  }

  /**
   * Single row by id, or null.
   */
  getById(id: number): CustomTaskTypeRow | null {
    return (
      this.db.executeReadOne<CustomTaskTypeRow>(
        `SELECT id, name, display_name, course_id, created_at
         FROM custom_task_types
         WHERE id = ?`,
        [id]
      ) ?? null
    );
  }
}
