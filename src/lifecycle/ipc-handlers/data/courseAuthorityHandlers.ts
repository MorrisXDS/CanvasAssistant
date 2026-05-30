/**
 * Course Authority IPC Handlers
 * Handlers for course authority settings (data:getCourseAuthority, data:updateCourseAuthority)
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';
import { CourseReader } from '../../../layers/l1-persistence';
import { UpdateCourseAuthorityCommand } from '../../../layers/l4-controller';
import { createSimulationContext } from '../../../layers/l4-controller/types';

/**
 * Register course authority-related IPC handlers
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. The read
 * routes through `CourseReader.getAuthorityById`; the write through
 * `UpdateCourseAuthorityCommand` (L4).
 */
export function registerCourseAuthorityHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const courseReader = new CourseReader(database);
  const runContext = () => ({
    db: database,
    simulationContext: createSimulationContext(),
  });

  // Get course authority settings
  ipcMain.handle('data:getCourseAuthority', (_event, courseId: number) => {
    try {
      const course = courseReader.getAuthorityById(courseId);

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
    async (
      _event,
      courseId: number,
      settings: {
        latePenaltyAuthority?: 'canvas' | 'local' | 'both';
        dropLowestAuthority?: 'canvas' | 'local' | 'off';
        gradeCalcMode?: 'canvas' | 'local' | 'both';
      }
    ) => {
      try {
        const result = await new UpdateCourseAuthorityCommand().execute(runContext(), {
          courseId,
          ...settings,
        });
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true };
      } catch (error) {
        logger.error(`Failed to update course authority settings: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );
}
