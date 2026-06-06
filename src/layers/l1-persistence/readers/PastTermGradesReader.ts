/**
 * PastTermGradesReader — main-side reader for the grade modal's "Past terms"
 * section (per ADR-0007 + ADR-0015).
 *
 * Reads ARCHIVED courses + their tasks, groups by enrollment term, and computes
 * per-term + credit-weighted-cumulative averages ENTIRELY MAIN-SIDE. Only the
 * aggregated numbers + course display fields cross the IPC boundary — archived
 * tasks never reach the renderer, so they cannot leak into `state.tasks` /
 * Tasks page / Calendar / queue / badges (the visibility-invariant hard
 * constraint, ADR-0015 Decision 3).
 *
 * Grades are TASK-DERIVED (the same weighted formula as L5's
 * `courseGradesCache`), NOT `courses.current_grade` (which is null/unused).
 * The ~6-line formula is re-derived here because L1 cannot import L5 — pinned
 * by tests on both sides (see termGrouping.ts NOTE).
 *
 * SQL lives in this reader; the IPC handler is a thin adapter.
 */

import type { Database } from '../Database';
import { CourseReader } from './CourseReader';
import {
  groupCoursesByTerm,
  cumulativeAverage,
  type CourseWithGrade,
} from '../../../shared/grades/termGrouping';

/** Per-course IPC shape (display fields + task-derived grade + credits). */
export interface PastTermCourse {
  code: string;
  name: string;
  color: string | null;
  /** Task-derived course average (percent), or null if not assessable. */
  grade: number | null;
  /** Course credits (default 1.0). */
  credits: number;
}

/** Per-term group in the IPC response. */
export interface PastTermGroup {
  termName: string;
  termEndAt: string | null;
  courses: PastTermCourse[];
  /** Credit-weighted average within the term. */
  termAverage: number | null;
}

/** `data:getPastTermGrades` response shape (all computed main-side). */
export interface PastTermGrades {
  terms: PastTermGroup[];
  /** Credit-weighted average across ALL past-term courses (flattened). */
  cumulative: number | null;
  /** Total past-term courses (for the "N courses" subtitle). */
  courseCount: number;
}

/** Narrow task projection used for the weighted course average. */
interface ArchivedTaskGradeRow {
  weight: number | null;
  grade: number | null;
}

export class PastTermGradesReader {
  private readonly courseReader: CourseReader;

  constructor(private readonly db: Database) {
    this.courseReader = new CourseReader(db);
  }

  /**
   * Compute a single course's task-derived average from its tasks, using the
   * same weighted formula as `getCachedCourseGrades`:
   * `sum((grade/100) * weight) / sum(weight) * 100` over tasks where
   * `weight > 0 && grade !== null`. Null if no such tasks.
   */
  private computeCourseGrade(courseId: number): number | null {
    const tasks = this.db.executeRead<ArchivedTaskGradeRow>(
      `SELECT weight, grade FROM tasks WHERE course_id = ?`,
      [courseId]
    );

    let totalWeight = 0;
    let totalContribution = 0;
    for (const task of tasks) {
      if (task.weight !== null && task.weight > 0 && task.grade !== null) {
        totalWeight += task.weight;
        totalContribution += (task.grade / 100) * task.weight;
      }
    }

    return totalWeight > 0 ? (totalContribution / totalWeight) * 100 : null;
  }

  /**
   * Build the past-terms grade breakdown for all archived courses.
   */
  getPastTermGrades(): PastTermGrades {
    const archived = this.courseReader.getArchivedWithTerm();

    const coursesWithGrade: CourseWithGrade[] = archived.map((row) => ({
      code: row.code,
      name: row.name,
      color: row.color,
      grade: this.computeCourseGrade(row.id),
      credits: row.credits,
      termName: row.term_name,
      termEndAt: row.term_end_at,
    }));

    const groups = groupCoursesByTerm(coursesWithGrade);

    const terms: PastTermGroup[] = groups.map((group) => ({
      // Archived courses always have a real term in practice; fall back to a
      // readable label for the rare null-term bucket.
      termName: group.termName ?? 'Unknown term',
      termEndAt: group.termEndAt,
      courses: group.courses.map((c) => ({
        code: c.code,
        name: c.name,
        color: c.color,
        grade: c.grade,
        credits: c.credits && c.credits > 0 ? c.credits : 1.0,
      })),
      termAverage: group.termAverage,
    }));

    return {
      terms,
      cumulative: cumulativeAverage(groups),
      courseCount: coursesWithGrade.length,
    };
  }
}
