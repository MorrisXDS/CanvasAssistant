/**
 * Task Link IPC Handlers
 * Handlers for link suggestions, manual linking, and unlinking
 * (data:getLinkSuggestions, data:acceptLinkSuggestion, data:rejectLinkSuggestion,
 *  data:getPendingSuggestionCount, data:getCanvasTasksForLinking,
 *  data:manuallyLinkTasks, data:unlinkTasks)
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads
 * route through `LinkSuggestionReader` / `TaskReader` (L1); writes route
 * through the L4 link commands.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';
import { LinkSuggestionReader, TaskReader } from '../../../layers/l1-persistence';
import {
  AcceptLinkSuggestionCommand,
  RejectLinkSuggestionCommand,
  ManuallyLinkTasksCommand,
  UnlinkTasksCommand,
} from '../../../layers/l4-controller';
import { createSimulationContext } from '../../../layers/l4-controller/types';

/**
 * Register task link-related IPC handlers
 */
export function registerTaskLinkHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  const suggestionReader = new LinkSuggestionReader(database);
  const taskReader = new TaskReader(database);
  const runContext = () => ({
    db: database,
    simulationContext: createSimulationContext(),
  });

  // Get pending link suggestions
  ipcMain.handle('data:getLinkSuggestions', (_event, status = 'pending') => {
    try {
      return suggestionReader.getByStatusWithTasks(status).map((row) => ({
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
  ipcMain.handle('data:acceptLinkSuggestion', async (_event, suggestionId: number) => {
    try {
      const result = await new AcceptLinkSuggestionCommand().execute(runContext(), {
        suggestionId,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true, canvasTaskId: result.data?.canvasTaskId };
    } catch (error) {
      logger.error(`Failed to accept link suggestion: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Reject a link suggestion
  ipcMain.handle('data:rejectLinkSuggestion', async (_event, suggestionId: number) => {
    try {
      const result = await new RejectLinkSuggestionCommand().execute(runContext(), {
        suggestionId,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      logger.error(`Failed to reject link suggestion: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Get count of pending suggestions (for badge)
  ipcMain.handle('data:getPendingSuggestionCount', () => {
    try {
      return suggestionReader.countByStatus('pending');
    } catch (error) {
      logger.error(`Failed to get pending suggestion count: ${error}`);
      return 0;
    }
  });

  // Get Canvas tasks available for manual linking (same course, not already linked)
  ipcMain.handle('data:getCanvasTasksForLinking', (_event, courseId: number) => {
    try {
      return taskReader.findUnlinkedCanvasTasksInCourse(courseId).map((row) => ({
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
    async (_event, userTaskId: number, canvasTaskId: number) => {
      try {
        const result = await new ManuallyLinkTasksCommand().execute(runContext(), {
          userTaskId,
          canvasTaskId,
        });
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true, canvasTaskId: result.data?.canvasTaskId };
      } catch (error) {
        logger.error(`Failed to manually link tasks: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Unlink tasks (restore user task, remove link)
  ipcMain.handle('data:unlinkTasks', async (_event, canvasTaskId: number) => {
    try {
      const result = await new UnlinkTasksCommand().execute(runContext(), {
        canvasTaskId,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      logger.error(`Failed to unlink tasks: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
