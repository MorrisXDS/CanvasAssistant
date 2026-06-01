/**
 * CourseSyllabusReader — read surface for the `course_syllabuses` table (the
 * user's syllabus-file designation per course). Per ADR-0007.
 *
 * Single-course point lookup; visibility is composed by the caller where
 * needed. Stateless; returns raw rows.
 */

import type { Database } from '../Database';

export interface SyllabusDesignationRow {
  resource_id: number;
  source_type: string;
  last_reviewed_at: string;
  change_detected_at: string | null;
  marked_at: string;
}

export class CourseSyllabusReader {
  constructor(private readonly db: Database) {}

  /** The syllabus designation for a course, or null if none is marked. */
  getDesignationByCourse(courseId: number): SyllabusDesignationRow | null {
    return (
      this.db.executeReadOne<SyllabusDesignationRow>(
        `SELECT resource_id, source_type, last_reviewed_at, change_detected_at, marked_at
         FROM course_syllabuses
         WHERE course_id = ?`,
        [courseId]
      ) ?? null
    );
  }
}
