/**
 * Course Data IPC Handlers
 *
 * Thin adapters between the renderer and L1 services (per ADR-0007).
 * No raw `database.execute*` here — visibility comes from `VisibilityOracle`,
 * rows come from `CourseReader`, and snake→camel translation happens via
 * the local `courseMapper`.
 *
 * Closes two visibility-bypass bugs from the pre-ADR-0007 codebase:
 *   - `data:getCourses` previously ran raw SQL filtering only
 *     `archived_at IS NULL AND deleted_at IS NULL`, missing `is_hidden = 0`
 *     AND term selection.
 *   - The renderer's `coreDataSlice.fetchCourses` re-derived term filtering
 *     in JS with different math than the Oracle's SQL. Now redundant
 *     (handler hands back the filtered list).
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';
import { CourseReader } from '../../layers/l1-persistence/readers/CourseReader';
import { EnrollmentTermReader } from '../../layers/l1-persistence/readers/EnrollmentTermReader';
import { PastTermGradesReader } from '../../layers/l1-persistence/readers/PastTermGradesReader';
import { mapCourseRowToListDto, mapCourseRowToDetailDto } from './mappers/courseMapper';

/**
 * Register course and enrollment term data handlers.
 */
export function registerCourseDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const courseReader = new CourseReader(database);
  const enrollmentTermReader = new EnrollmentTermReader(database);
  const pastTermGradesReader = new PastTermGradesReader(database);

  // ============ Enrollment Terms ============

  ipcMain.handle('data:getEnrollmentTerms', () => {
    try {
      return enrollmentTermReader.getAll().map((row) => ({
        id: row.id,
        externalId: row.external_id,
        name: row.name,
        startAt: row.start_at,
        endAt: row.end_at,
      }));
    } catch (error) {
      logger.error(`Failed to get enrollment terms: ${error}`);
      throw error;
    }
  });

  // ============ Courses ============

  /**
   * data:getCourses — visibility-filtered list of courses for the UI.
   *
   * Visibility is enforced by the Oracle (which applies all four filters:
   * `is_hidden = 0`, `deleted_at IS NULL`, `archived_at IS NULL`, term
   * selection). List endpoints filter; single-id endpoints don't (per
   * ADR-0007 sub-decision α).
   */
  ipcMain.handle('data:getCourses', () => {
    try {
      const oracle = ctx.getVisibilityOracle();
      if (!oracle) return [];

      const ids = oracle.getVisibleCourseIds();
      if (ids.length === 0) return [];

      return courseReader.getByIds(ids).map(mapCourseRowToListDto);
    } catch (error) {
      logger.error(`Failed to get courses: ${error}`);
      throw error;
    }
  });

  /**
   * data:getCourse(id) — single-course lookup. Bypasses visibility on
   * purpose: the caller has the id (e.g. an announcement deep-link landing
   * on a course that's since been hidden). The UI can render a "hidden"
   * badge based on the returned `isHidden` flag.
   */
  ipcMain.handle('data:getCourse', (_event, courseId: number) => {
    try {
      const row = courseReader.getById(courseId);
      return row ? mapCourseRowToDetailDto(row) : null;
    } catch (error) {
      logger.error(`Failed to get course: ${error}`);
      throw error;
    }
  });

  /**
   * data:getArchivedCourses — archived list for the Archived section UI.
   * Ordering (term end DESC, then name ASC) is owned by the reader.
   */
  ipcMain.handle('data:getArchivedCourses', () => {
    try {
      return courseReader.getArchivedSortedByTermEnd().map(mapCourseRowToListDto);
    } catch (error) {
      logger.error(`Failed to get archived courses: ${error}`);
      throw error;
    }
  });

  /**
   * data:getPastTermGrades — credit-weighted grade history for archived
   * courses, grouped by term (grade modal "Past terms" section). Computed
   * entirely main-side by the reader; archived tasks never cross IPC, so this
   * data stays isolated from `state.courses` / `state.tasks` (ADR-0015).
   */
  ipcMain.handle('data:getPastTermGrades', () => {
    try {
      return pastTermGradesReader.getPastTermGrades();
    } catch (error) {
      logger.error(`Failed to get past term grades: ${error}`);
      throw error;
    }
  });
}
