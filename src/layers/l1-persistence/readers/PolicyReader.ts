/**
 * PolicyReader — the only SQL surface for the `course_policies` table.
 *
 * Per ADR-0007 / PR-H, IPC handlers MUST route through this reader. Raw
 * `database.execute*` calls against `course_policies` are confined here
 * (plus migrations and the sync code that historically populated rows;
 * see CONTEXT.md "Policy (zombie)" — no live writer remains today).
 *
 * Stateless. Returns raw DB rows (snake_case). Visibility is the
 * caller's job — list endpoints compose with
 * `VisibilityOracle.getVisibleCourseIds()` (per ADR-0007 sub-decision α).
 *
 * Note on table state: `course_policies` is a zombie table per ADR-0003
 * (L3 intelligence removed). Both reader methods will return [] in
 * production until a future system repopulates it. The reader exists
 * to close the ADR-0007 raw-SQL violation in the handler file, not
 * because the data is live.
 */

import type { Database } from '../Database';
import type { PolicyRow } from '../DatabaseRowTypes';

export class PolicyReader {
  constructor(private readonly db: Database) {}

  /**
   * Active policies for one course, ordered by `policy_type`. Excludes
   * inactive rows (`is_active = 0`).
   */
  getByCourseId(courseId: number): PolicyRow[] {
    return this.db.executeRead<PolicyRow>(
      `SELECT * FROM course_policies
       WHERE course_id = ? AND is_active = 1
       ORDER BY policy_type`,
      [courseId]
    );
  }

  /**
   * Active policies across the given course id set, ordered by
   * `course_id, policy_type`. Empty input → empty array. Caller composes
   * visibility upstream.
   */
  getByCourseIds(courseIds: readonly number[]): PolicyRow[] {
    if (courseIds.length === 0) return [];
    const placeholders = courseIds.map(() => '?').join(', ');
    return this.db.executeRead<PolicyRow>(
      `SELECT * FROM course_policies
       WHERE course_id IN (${placeholders}) AND is_active = 1
       ORDER BY course_id, policy_type`,
      [...courseIds]
    );
  }
}
