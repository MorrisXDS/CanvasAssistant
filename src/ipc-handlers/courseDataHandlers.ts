/**
 * Course Data IPC Handlers
 * Handlers for course and enrollment term data operations
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register course and enrollment term data handlers
 */
export function registerCourseDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // ============ Enrollment Terms ============

  ipcMain.handle('data:getEnrollmentTerms', () => {
    try {
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        name: string;
        start_at: string | null;
        end_at: string | null;
      }>('SELECT * FROM enrollment_terms ORDER BY start_at DESC');

      return rows.map((row) => ({
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

  ipcMain.handle('data:getCourses', () => {
    try {
      // Filter out archived and deleted courses
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        target_grade_source: 'default' | 'manual' | null;
        assessed_grade: number | null;
        current_grade: number | null;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        last_synced_at: string | null;
        enrollment_term_id: number | null;
        credits: number | null;
      }>(
        'SELECT * FROM courses WHERE archived_at IS NULL AND deleted_at IS NULL ORDER BY name'
      );

      return rows.map((row) => ({
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
        archivedAt: null, // Always null since we filter out archived courses
        archiveSource: null, // Always null since we filter out archived courses
      }));
    } catch (error) {
      logger.error(`Failed to get courses: ${error}`);
      throw error;
    }
  });

  // Get a single course by ID
  ipcMain.handle('data:getCourse', (_event, courseId: number) => {
    try {
      const row = database.executeReadOne<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        target_grade_source: 'default' | 'manual' | null;
        assessed_grade: number | null;
        current_grade: number | null;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        last_synced_at: string | null;
        enrollment_term_id: number | null;
        credits: number | null;
        archived_at: string | null;
        archive_source: string | null;
      }>('SELECT * FROM courses WHERE id = ?', [courseId]);

      if (!row) {
        return null;
      }

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
    } catch (error) {
      logger.error(`Failed to get course: ${error}`);
      throw error;
    }
  });

  // Get archived courses - sorted by term end date (primary), then alphabetically (secondary)
  ipcMain.handle('data:getArchivedCourses', () => {
    try {
      const rows = database.executeRead<{
        id: number;
        external_id: string;
        code: string;
        name: string;
        target_grade: number;
        target_grade_source: 'default' | 'manual' | null;
        assessed_grade: number | null;
        current_grade: number | null;
        color: string | null;
        nickname: string | null;
        is_hidden: number;
        last_synced_at: string | null;
        enrollment_term_id: number | null;
        credits: number | null;
        archived_at: string;
        archive_source: string | null;
        term_end_at: string | null;
      }>(
        `SELECT c.*, et.end_at as term_end_at
         FROM courses c
         LEFT JOIN enrollment_terms et ON c.enrollment_term_id = et.id
         WHERE c.archived_at IS NOT NULL AND c.deleted_at IS NULL
         ORDER BY et.end_at DESC NULLS LAST, c.name ASC`
      );

      return rows.map((row) => ({
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
      }));
    } catch (error) {
      logger.error(`Failed to get archived courses: ${error}`);
      throw error;
    }
  });
}
