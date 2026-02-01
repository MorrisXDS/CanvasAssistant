/**
 * Task Data IPC Handlers
 * Handlers for task data operations
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register task data handlers
 */
export function registerTaskDataHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibleDataProvider = ctx.getVisibleDataProvider;

  ipcMain.handle(
    'data:getTasks',
    (_event, options?: { courseIds?: number[] } | number) => {
      try {
        // Use VisibleDataProvider as single source of truth for visibility
        // This ensures consistent filtering across all services
        let sql: string;
        let params: number[] = [];

        if (typeof options === 'number') {
          // Legacy: single courseId - verify it's visible first
          if (getVisibleDataProvider() && !getVisibleDataProvider()!.isCourseVisible(options)) {
            return []; // Course not visible, return empty
          }
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id = ?
                 ORDER BY t.priority_score DESC`;
          params = [options];
        } else if (
          options?.courseIds &&
          Array.isArray(options.courseIds) &&
          options.courseIds.length > 0
        ) {
          // Filter provided courseIds to only visible ones
          const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
          const visibleSet = new Set(visibleIds);
          const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

          if (filteredCourseIds.length === 0) return [];

          const placeholders = filteredCourseIds.map(() => '?').join(', ');
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id IN (${placeholders})
                 ORDER BY t.priority_score DESC`;
          params = filteredCourseIds;
        } else {
          // No filter - return tasks from all visible courses
          const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];
          if (visibleIds.length === 0) return [];

          const placeholders = visibleIds.map(() => '?').join(', ');
          sql = `SELECT t.* FROM tasks t
                 WHERE t.course_id IN (${placeholders})
                 ORDER BY t.priority_score DESC`;
          params = visibleIds;
        }

        const rows = database.executeRead<{
          id: number;
          external_id: string;
          course_id: number;
          title: string;
          description: string | null;
          due_at: string | null;
          due_time_known: number;
          weight: number;
          grade: number | null;
          points_possible: number | null;
          priority_score: number;
          is_completed: number;
          completed_at: string | null;
          submission_status: string | null;
          task_type: string | null;
          is_optional: number;
        }>(sql, params);

        return rows.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          courseId: row.course_id,
          title: row.title,
          description: row.description,
          dueAt: row.due_at,
          dueTimeKnown: Boolean(row.due_time_known ?? 1), // Default to true for backward compat
          weight: row.weight,
          grade: row.grade,
          pointsPossible: row.points_possible,
          priorityScore: row.priority_score,
          isCompleted: Boolean(row.is_completed),
          completedAt: row.completed_at,
          submissionStatus: row.submission_status,
          taskType: row.task_type,
          isOptional: Boolean(row.is_optional),
        }));
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        throw error;
      }
    }
  );

  // Get tasks for an archived course (bypasses visibility filtering)
  // Archived courses are local-only sandboxes - users can view/edit without affecting active workflows
  ipcMain.handle('data:getTasksForArchivedCourse', (_event, courseId: number) => {
    try {
      // Verify the course is actually archived
      const course = database.executeReadOne<{ archived_at: string | null }>(
        'SELECT archived_at FROM courses WHERE id = ?',
        [courseId]
      );

      if (!course?.archived_at) {
        logger.error(
          `Attempted to get tasks for non-archived course ${courseId} via archived endpoint`
        );
        return [];
      }

      const rows = database.executeRead<{
        id: number;
        external_id: string;
        course_id: number;
        title: string;
        description: string | null;
        due_at: string | null;
        due_time_known: number;
        weight: number;
        grade: number | null;
        points_possible: number | null;
        priority_score: number;
        is_completed: number;
        completed_at: string | null;
        submission_status: string | null;
        task_type: string | null;
        is_optional: number;
      }>(
        `SELECT * FROM tasks WHERE course_id = ? ORDER BY priority_score DESC`,
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        courseId: row.course_id,
        title: row.title,
        description: row.description,
        dueAt: row.due_at,
        dueTimeKnown: Boolean(row.due_time_known ?? 1),
        weight: row.weight,
        grade: row.grade,
        pointsPossible: row.points_possible,
        priorityScore: row.priority_score,
        isCompleted: Boolean(row.is_completed),
        completedAt: row.completed_at,
        submissionStatus: row.submission_status,
        taskType: row.task_type,
        isOptional: Boolean(row.is_optional),
      }));
    } catch (error) {
      logger.error(`Failed to get tasks for archived course: ${error}`);
      throw error;
    }
  });
}
