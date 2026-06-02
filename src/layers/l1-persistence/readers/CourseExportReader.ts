/**
 * CourseExportReader — gathers the full-fidelity course-export bundle (per
 * ADR-0007). Backs `data:exportCourseData`.
 *
 * This is a backup/export read: it returns whole rows (snake_case) for the
 * selected courses and their related entities. The handler shapes the DTO
 * (camelCase courses, local_path-stripped resources) at its boundary.
 *
 * Visibility is intentionally NOT applied — export is an explicit user action
 * over a chosen course-id set (or all courses). The numeric id sets are
 * coerced to integers before interpolation so the export filter can never
 * carry injected SQL.
 */

import type { Database } from '../Database';

/** Full course row needed by the export's camelCase mapping. */
export interface CourseExportRow {
  id: number;
  external_id: string;
  code: string;
  name: string;
  nickname: string | null;
  color: string | null;
  enrollment_term_id: number | null;
  target_grade: number | null;
  target_grade_source: string | null;
  is_hidden: number;
  current_grade: number | null;
  assessed_grade: number | null;
  total_weight: number | null;
  syllabus_body: string | null;
  field_sources: string | null;
  allow_guessed_override: number | null;
  auto_assign_due_date: number | null;
}

export interface CourseExportBundle {
  courses: CourseExportRow[];
  tasks: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  pages: Record<string, unknown>[];
  policies: Record<string, unknown>[];
  resources: Record<string, unknown>[];
  syllabuses: Record<string, unknown>[];
}

const EMPTY_BUNDLE: CourseExportBundle = {
  courses: [],
  tasks: [],
  notifications: [],
  pages: [],
  policies: [],
  resources: [],
  syllabuses: [],
};

/** Coerce to a comma list of integers (defends the interpolated `IN (...)`). */
function intList(values: readonly unknown[]): string {
  return values
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n))
    .join(',');
}

export class CourseExportReader {
  constructor(private readonly db: Database) {}

  /**
   * Gather the export bundle for the given course ids (or all courses when
   * omitted/empty). Returns an all-empty bundle when no courses match — the
   * caller surfaces the "no courses" error and the empty case also avoids an
   * invalid `IN ()` on the related-entity queries.
   */
  gather(courseIds?: readonly number[]): CourseExportBundle {
    const courseFilter =
      courseIds && courseIds.length > 0 ? ` WHERE id IN (${intList(courseIds)})` : '';

    const courses = this.db.executeRead<CourseExportRow>(
      `SELECT * FROM courses${courseFilter}`
    );

    if (courses.length === 0) {
      return { ...EMPTY_BUNDLE };
    }

    const ids = intList(courses.map((c) => c.id));

    const tasks = this.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE course_id IN (${ids})`
    );
    const notifications = this.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM notifications WHERE course_id IN (${ids})`
    );
    const pages = this.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM course_pages WHERE course_id IN (${ids})`
    );
    const policies = this.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM course_policies WHERE course_id IN (${ids})`
    );
    const resources = this.db.executeRead<Record<string, unknown>>(
      `SELECT id, external_id, course_id, folder_path, type, title, url, size_bytes, mime_type FROM resources WHERE course_id IN (${ids})`
    );
    const syllabuses = this.db.executeRead<Record<string, unknown>>(
      `SELECT * FROM course_syllabuses WHERE course_id IN (${ids})`
    );

    return {
      courses,
      tasks,
      notifications,
      pages,
      policies,
      resources,
      syllabuses,
    };
  }
}
