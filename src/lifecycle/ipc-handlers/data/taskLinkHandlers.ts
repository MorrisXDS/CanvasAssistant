/**
 * Task Link IPC Handlers
 * Handlers for link suggestions, manual linking, and unlinking
 * (data:getLinkSuggestions, data:acceptLinkSuggestion, data:rejectLinkSuggestion,
 *  data:getPendingSuggestionCount, data:getCanvasTasksForLinking,
 *  data:manuallyLinkTasks, data:unlinkTasks)
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';

/**
 * Register task link-related IPC handlers
 */
export function registerTaskLinkHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // Get pending link suggestions
  ipcMain.handle('data:getLinkSuggestions', (_event, status = 'pending') => {
    try {
      const rows = database.executeRead<{
        id: number;
        user_task_id: number;
        canvas_task_id: number;
        confidence: number;
        status: string;
        created_at: string;
        user_task_title: string;
        canvas_task_title: string;
        course_id: number;
        course_name: string;
      }>(
        `SELECT
          ls.id,
          ls.user_task_id,
          ls.canvas_task_id,
          ls.confidence,
          ls.status,
          ls.created_at,
          ut.title as user_task_title,
          ut.course_id,
          ct.title as canvas_task_title,
          c.name as course_name
        FROM link_suggestions ls
        JOIN tasks ut ON ls.user_task_id = ut.id
        JOIN tasks ct ON ls.canvas_task_id = ct.id
        JOIN courses c ON ut.course_id = c.id
        WHERE ls.status = ?
        ORDER BY ls.confidence DESC, ls.created_at DESC`,
        [status]
      );

      return rows.map((row) => ({
        id: row.id,
        userTaskId: row.user_task_id,
        canvasTaskId: row.canvas_task_id,
        confidence: row.confidence,
        status: row.status,
        createdAt: row.created_at,
        userTaskTitle: row.user_task_title,
        canvasTaskTitle: row.canvas_task_title,
        courseId: row.course_id,
        courseName: row.course_name,
      }));
    } catch (error) {
      logger.error(`Failed to get link suggestions: ${error}`);
      throw error;
    }
  });

  // Accept a link suggestion
  ipcMain.handle('data:acceptLinkSuggestion', (_event, suggestionId: number) => {
    try {
      const suggestion = database.executeReadOne<{
        id: number;
        user_task_id: number;
        canvas_task_id: number;
        confidence: number;
      }>('SELECT * FROM link_suggestions WHERE id = ?', [suggestionId]);

      if (!suggestion) {
        return { success: false, error: 'Suggestion not found' };
      }

      const userTask = database.executeReadOne<{
        id: number;
        external_id: string;
        weight: number | null;
        notes: string | null;
        user_expected_grade: number | null;
      }>(
        'SELECT id, external_id, weight, notes, user_expected_grade FROM tasks WHERE id = ?',
        [suggestion.user_task_id]
      );

      if (!userTask) {
        return { success: false, error: 'User task not found' };
      }

      const now = new Date().toISOString();

      // Perform the link
      database.executeWrite(
        `UPDATE tasks SET
          linked_from_user_task = ?,
          link_confidence = ?,
          link_method = 'suggested',
          weight = COALESCE(?, weight),
          notes = COALESCE(?, notes),
          user_expected_grade = COALESCE(?, user_expected_grade),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          userTask.external_id,
          suggestion.confidence,
          userTask.weight,
          userTask.notes,
          userTask.user_expected_grade,
          suggestion.canvas_task_id,
        ],
        'tasks'
      );

      // Soft-delete user task
      database.executeWrite(
        `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, suggestion.canvas_task_id, userTask.id],
        'tasks'
      );

      // Mark suggestion as accepted
      database.executeWrite(
        `UPDATE link_suggestions SET status = 'accepted', resolved_at = ?, resolved_by = 'user' WHERE id = ?`,
        [now, suggestionId],
        'link_suggestions'
      );

      return { success: true, canvasTaskId: suggestion.canvas_task_id };
    } catch (error) {
      logger.error(`Failed to accept link suggestion: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Reject a link suggestion
  ipcMain.handle('data:rejectLinkSuggestion', (_event, suggestionId: number) => {
    try {
      const now = new Date().toISOString();

      database.executeWrite(
        `UPDATE link_suggestions SET status = 'rejected', resolved_at = ?, resolved_by = 'user' WHERE id = ?`,
        [now, suggestionId],
        'link_suggestions'
      );

      return { success: true };
    } catch (error) {
      logger.error(`Failed to reject link suggestion: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Get count of pending suggestions (for badge)
  ipcMain.handle('data:getPendingSuggestionCount', () => {
    try {
      const result = database.executeReadOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM link_suggestions WHERE status = 'pending'`
      );
      return result?.count || 0;
    } catch (error) {
      logger.error(`Failed to get pending suggestion count: ${error}`);
      return 0;
    }
  });

  // Get Canvas tasks available for manual linking (same course, not already linked)
  ipcMain.handle('data:getCanvasTasksForLinking', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        title: string;
        due_at: string | null;
        grade: number | null;
        task_type: string | null;
      }>(
        `SELECT id, title, due_at, grade, task_type
         FROM tasks
         WHERE course_id = ?
           AND source_type = 'canvas'
           AND deleted_at IS NULL
           AND linked_from_user_task IS NULL
         ORDER BY due_at DESC`,
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        dueAt: row.due_at,
        grade: row.grade,
        taskType: row.task_type,
      }));
    } catch (error) {
      logger.error(`Failed to get Canvas tasks for linking: ${error}`);
      throw error;
    }
  });

  // Manually link a user task to a Canvas task
  ipcMain.handle(
    'data:manuallyLinkTasks',
    (_event, userTaskId: number, canvasTaskId: number) => {
      try {
        const userTask = database.executeReadOne<{
          id: number;
          source_type: string;
          external_id: string;
          weight: number | null;
          notes: string | null;
          user_expected_grade: number | null;
        }>('SELECT * FROM tasks WHERE id = ?', [userTaskId]);

        const canvasTask = database.executeReadOne<{
          id: number;
          source_type: string;
          linked_from_user_task: string | null;
        }>('SELECT id, source_type, linked_from_user_task FROM tasks WHERE id = ?', [
          canvasTaskId,
        ]);

        if (!userTask || !canvasTask) {
          return { success: false, error: 'Task not found' };
        }

        if (userTask.source_type !== 'user') {
          return { success: false, error: 'Can only link user-created tasks' };
        }

        if (canvasTask.source_type !== 'canvas') {
          return { success: false, error: 'Target must be a Canvas task' };
        }

        if (canvasTask.linked_from_user_task) {
          return {
            success: false,
            error: 'Canvas task is already linked to another user task',
          };
        }

        const now = new Date().toISOString();

        // Perform the link
        database.executeWrite(
          `UPDATE tasks SET
            linked_from_user_task = ?,
            link_confidence = 1.0,
            link_method = 'manual',
            weight = COALESCE(?, weight),
            notes = COALESCE(?, notes),
            user_expected_grade = COALESCE(?, user_expected_grade),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            userTask.external_id,
            userTask.weight,
            userTask.notes,
            userTask.user_expected_grade,
            canvasTaskId,
          ],
          'tasks'
        );

        // Soft-delete user task
        database.executeWrite(
          `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [now, canvasTaskId, userTaskId],
          'tasks'
        );

        // Dismiss any pending suggestions for this user task
        database.executeWrite(
          `UPDATE link_suggestions SET status = 'dismissed', resolved_at = ?, resolved_by = 'manual'
           WHERE user_task_id = ? AND status = 'pending'`,
          [now, userTaskId],
          'link_suggestions'
        );

        return { success: true, canvasTaskId };
      } catch (error) {
        logger.error(`Failed to manually link tasks: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Unlink tasks (restore user task, remove link)
  ipcMain.handle('data:unlinkTasks', (_event, canvasTaskId: number) => {
    try {
      const canvasTask = database.executeReadOne<{
        id: number;
        linked_from_user_task: string | null;
      }>('SELECT id, linked_from_user_task FROM tasks WHERE id = ?', [canvasTaskId]);

      if (!canvasTask || !canvasTask.linked_from_user_task) {
        return { success: false, error: 'No link found' };
      }

      // Find the user task
      const userTask = database.executeReadOne<{ id: number }>(
        `SELECT id FROM tasks WHERE external_id = ? AND merged_into_task_id = ?`,
        [canvasTask.linked_from_user_task, canvasTaskId]
      );

      if (userTask) {
        // Restore user task
        database.executeWrite(
          `UPDATE tasks SET deleted_at = NULL, merged_into_task_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [userTask.id],
          'tasks'
        );
      }

      // Remove link from Canvas task
      database.executeWrite(
        `UPDATE tasks SET
          linked_from_user_task = NULL,
          link_confidence = NULL,
          link_method = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [canvasTaskId],
        'tasks'
      );

      return { success: true };
    } catch (error) {
      logger.error(`Failed to unlink tasks: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
