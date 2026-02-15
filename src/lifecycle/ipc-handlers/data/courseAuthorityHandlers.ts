/**
 * Course Authority IPC Handlers
 * Handlers for course authority settings (data:getCourseAuthority, data:updateCourseAuthority)
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';

/**
 * Register course authority-related IPC handlers
 */
export function registerCourseAuthorityHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // Get course authority settings
  ipcMain.handle('data:getCourseAuthority', (_event, courseId: number) => {
    try {
      const course = database.executeReadOne<{
        late_penalty_authority: string | null;
        drop_lowest_authority: string | null;
        grade_calc_mode: string | null;
      }>(
        'SELECT late_penalty_authority, drop_lowest_authority, grade_calc_mode FROM courses WHERE id = ?',
        [courseId]
      );

      if (!course) {
        return null;
      }

      return {
        latePenaltyAuthority: course.late_penalty_authority || 'canvas',
        dropLowestAuthority: course.drop_lowest_authority || 'canvas',
        gradeCalcMode: course.grade_calc_mode || 'canvas',
      };
    } catch (error) {
      logger.error(`Failed to get course authority settings: ${error}`);
      throw error;
    }
  });

  // Update course authority settings
  ipcMain.handle(
    'data:updateCourseAuthority',
    (
      _event,
      courseId: number,
      settings: {
        latePenaltyAuthority?: 'canvas' | 'local' | 'both';
        dropLowestAuthority?: 'canvas' | 'local' | 'off';
        gradeCalcMode?: 'canvas' | 'local' | 'both';
      }
    ) => {
      try {
        const updates: string[] = [];
        const params: (string | number)[] = [];

        if (settings.latePenaltyAuthority) {
          updates.push('late_penalty_authority = ?');
          params.push(settings.latePenaltyAuthority);
        }
        if (settings.dropLowestAuthority) {
          updates.push('drop_lowest_authority = ?');
          params.push(settings.dropLowestAuthority);
        }
        if (settings.gradeCalcMode) {
          updates.push('grade_calc_mode = ?');
          params.push(settings.gradeCalcMode);
        }

        if (updates.length > 0) {
          params.push(courseId);
          database.executeWrite(
            `UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params,
            'courses'
          );
        }

        return { success: true };
      } catch (error) {
        logger.error(`Failed to update course authority settings: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );
}
