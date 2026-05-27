/**
 * courseMapper — translates raw `CourseRow`s from `CourseReader` into the
 * camelCase DTOs that the IPC contract publishes.
 *
 * Per ADR-0007: readers return rows in the table's vocabulary (snake_case);
 * IPC handlers translate to the UI vocabulary at the boundary. This file is
 * the boundary for the `courses` table.
 *
 * Pure functions, no side effects, trivially testable.
 */

import type { CourseRow } from '../../../layers/l1-persistence';

/**
 * Shape returned by `data:getCourses` / `data:getArchivedCourses`. Matches
 * `Course` in `src/shared/ipc-contract.ts`.
 */
export interface CourseListDto {
  id: number;
  externalId: string;
  code: string;
  name: string;
  targetGrade: number;
  targetGradeSource: 'default' | 'manual';
  assessedGrade: number | null;
  currentGrade: number | null;
  color: string | null;
  nickname: string | null;
  isHidden: boolean;
  lastSyncedAt: string | null;
  enrollmentTermId: number | null;
  credits: number;
  archivedAt: string | null;
  archiveSource: 'manual' | 'auto' | null;
}

/**
 * Shape returned by `data:getCourse`. Matches `CourseDetail` in
 * `src/shared/ipc-contract.ts`, plus the not-yet-schema'd
 * `syllabusPromptDismissedAt` field the renderer reads off the response.
 */
export interface CourseDetailDto extends CourseListDto {
  totalWeight: number;
  syllabusBody: string | null;
  gradeCurveAdjustment: number;
  /** Not yet in the Zod schema; preserved here so the renderer keeps working. */
  syllabusPromptDismissedAt: string | null;
}

export function mapCourseRowToListDto(row: CourseRow): CourseListDto {
  return {
    id: row.id,
    externalId: row.external_id,
    code: row.code,
    name: row.name,
    targetGrade: row.target_grade,
    targetGradeSource: row.target_grade_source ?? 'default',
    assessedGrade: row.assessed_grade,
    currentGrade: row.current_grade,
    color: row.color,
    nickname: row.nickname,
    isHidden: Boolean(row.is_hidden),
    lastSyncedAt: row.last_synced_at,
    enrollmentTermId: row.enrollment_term_id,
    credits: row.credits ?? 1.0,
    archivedAt: row.archived_at,
    archiveSource: row.archive_source,
  };
}

export function mapCourseRowToDetailDto(row: CourseRow): CourseDetailDto {
  return {
    ...mapCourseRowToListDto(row),
    totalWeight: row.total_weight ?? 0,
    syllabusBody: row.syllabus_body,
    gradeCurveAdjustment: row.grade_curve_adjustment ?? 0,
    syllabusPromptDismissedAt: row.syllabus_prompt_dismissed_at,
  };
}
