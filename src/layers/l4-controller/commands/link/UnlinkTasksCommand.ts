/**
 * UnlinkTasksCommand - Unlink a Canvas task, restoring its user task.
 *
 * Finds the user task previously merged into the Canvas task, restores it
 * (clears soft-delete + merge pointer), and strips the link metadata from
 * the Canvas task. Per ADR-0007 this is the write path the
 * `data:unlinkTasks` IPC handler routes through.
 */

import { TaskReader } from '../../../l1-persistence';
import { Command, CommandContext, CommandResult, UnlinkTasksParams } from '../../types';

export class UnlinkTasksCommand implements Command<UnlinkTasksParams, void> {
  readonly name = 'UnlinkTasks';

  async execute(
    context: CommandContext,
    params: UnlinkTasksParams
  ): Promise<CommandResult<void>> {
    try {
      const taskReader = new TaskReader(context.db);
      const canvasTask = taskReader.getById(params.canvasTaskId);

      if (!canvasTask || !canvasTask.linked_from_user_task) {
        return { success: false, error: 'No link found' };
      }

      // Find the user task that was merged into this Canvas task
      const userTask = context.db.executeReadOne<{ id: number }>(
        `SELECT id FROM tasks WHERE external_id = ? AND merged_into_task_id = ?`,
        [canvasTask.linked_from_user_task, params.canvasTaskId]
      );

      if (userTask) {
        // Restore the user task
        context.db.executeWrite(
          `UPDATE tasks SET deleted_at = NULL, merged_into_task_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [userTask.id],
          'tasks'
        );
      }

      // Strip the link metadata from the Canvas task
      context.db.executeWrite(
        `UPDATE tasks SET
          linked_from_user_task = NULL,
          link_confidence = NULL,
          link_method = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [params.canvasTaskId],
        'tasks'
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to unlink tasks: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
