/**
 * DeleteTaskCommand - Delete a task
 *
 * Removes a task from the database. Only allows deleting user-created tasks.
 * Canvas-synced tasks should not be deleted (they'll return on next sync).
 */

import { Command, CommandContext, CommandResult, DeleteTaskParams } from '../types';

export class DeleteTaskCommand implements Command<
  DeleteTaskParams,
  { deleted: boolean }
> {
  readonly name = 'DeleteTask';

  validate(params: DeleteTaskParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Task not found or invalid' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DeleteTaskParams
  ): Promise<CommandResult<{ deleted: boolean }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Check if task exists and get its source
      const task = context.db.executeReadOne<{
        id: number;
        course_id: number;
        source_type: string;
        title: string;
      }>('SELECT id, course_id, source_type, title FROM tasks WHERE id = ?', [
        params.taskId,
      ]);

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      // Warn if deleting a Canvas task (but allow it with force flag)
      if (task.source_type !== 'user' && !params.force) {
        return {
          success: false,
          error:
            'This assignment was imported from Canvas. Deleting it will only remove it temporarily—it will reappear on the next sync.',
        };
      }

      // Delete the task
      context.db.executeWrite('DELETE FROM tasks WHERE id = ?', [params.taskId], 'tasks');

      // Recalculate course grade
      this.updateCourseAssessedGrade(context, task.course_id);

      return {
        success: true,
        data: { deleted: true },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private updateCourseAssessedGrade(context: CommandContext, courseId: number): void {
    const result = context.db.executeReadOne<{
      weighted_sum: number;
      total_weight: number;
    }>(
      `SELECT
         SUM(CASE WHEN grade IS NOT NULL THEN grade * weight ELSE 0 END) as weighted_sum,
         SUM(CASE WHEN grade IS NOT NULL THEN weight ELSE 0 END) as total_weight
       FROM tasks
       WHERE course_id = ? AND is_completed = 1`,
      [courseId]
    );

    if (result && result.total_weight > 0) {
      const assessedGrade = result.weighted_sum / result.total_weight;
      context.db.executeWrite(
        'UPDATE courses SET assessed_grade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [assessedGrade, courseId],
        'courses'
      );
    }
  }
}
