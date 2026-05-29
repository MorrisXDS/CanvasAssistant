/**
 * ManuallyLinkTasksCommand - Manually link a user task to a Canvas task.
 *
 * Validates source types and that the Canvas task is not already linked,
 * carries the user task's fields into the Canvas task, soft-deletes the
 * user task, and dismisses any pending suggestions for it. Per ADR-0007
 * this is the write path the `data:manuallyLinkTasks` IPC handler routes
 * through.
 */

import { TaskReader } from '../../../l1-persistence';
import {
  Command,
  CommandContext,
  CommandResult,
  ManuallyLinkTasksParams,
} from '../../types';

export class ManuallyLinkTasksCommand implements Command<
  ManuallyLinkTasksParams,
  { canvasTaskId: number }
> {
  readonly name = 'ManuallyLinkTasks';

  async execute(
    context: CommandContext,
    params: ManuallyLinkTasksParams
  ): Promise<CommandResult<{ canvasTaskId: number }>> {
    try {
      const taskReader = new TaskReader(context.db);

      const userTask = taskReader.getById(params.userTaskId);
      const canvasTask = taskReader.getById(params.canvasTaskId);

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

      // Link the user task's fields into the Canvas task
      context.db.executeWrite(
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
          params.canvasTaskId,
        ],
        'tasks'
      );

      // Soft-delete the now-merged user task
      context.db.executeWrite(
        `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, params.canvasTaskId, params.userTaskId],
        'tasks'
      );

      // Dismiss any pending suggestions for this user task
      context.db.executeWrite(
        `UPDATE link_suggestions SET status = 'dismissed', resolved_at = ?, resolved_by = 'manual'
         WHERE user_task_id = ? AND status = 'pending'`,
        [now, params.userTaskId],
        'link_suggestions'
      );

      return { success: true, data: { canvasTaskId: params.canvasTaskId } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to manually link tasks: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
