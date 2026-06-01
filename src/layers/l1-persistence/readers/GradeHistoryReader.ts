/**
 * GradeHistoryReader — read surface for the `grade_history` table (per ADR-0007).
 * Backs `data:getGradeHistory`. Stateless; returns raw rows.
 */

import type { Database } from '../Database';

export interface GradeHistoryRow {
  recorded_at: string;
  grade: number;
}

export class GradeHistoryReader {
  constructor(private readonly db: Database) {}

  /** A course's grade history, oldest first. */
  getByCourse(courseId: number): GradeHistoryRow[] {
    return this.db.executeRead<GradeHistoryRow>(
      `SELECT recorded_at, grade FROM grade_history
       WHERE course_id = ?
       ORDER BY recorded_at ASC`,
      [courseId]
    );
  }
}
