/**
 * MarkTaskCompleteCommand - Mark a task as complete/incomplete
 *
 * Allows users to manually mark tasks as done locally.
 * This is a local override - Canvas submission status may differ.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  MarkTaskCompleteParams,
} from '../types';

export class MarkTaskCompleteCommand
  implements Command<MarkTaskCompleteParams, { previousState: boolean; completedAt: Date | null }>
{
  readonly name = 'MarkTaskComplete';

  validate(params: MarkTaskCompleteParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Invalid task ID' };
    }

    if (typeof params.isComplete !== 'boolean') {
      return { valid: false, error: 'isComplete must be a boolean' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: MarkTaskCompleteParams
  ): Promise<CommandResult<{ previousState: boolean; completedAt: Date | null }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get current state
      const task = context.db.executeReadOne<{
        id: number;
        course_id: number;
        is_completed: boolean;
        completed_at: string | null;
      }>(
        'SELECT id, course_id, is_completed, completed_at FROM tasks WHERE id = ?',
        [params.taskId]
      );

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      const previousState = Boolean(task.is_completed);
      const completedAt = params.isComplete ? new Date() : null;

      // Update completion status
      context.db.executeWrite(
        `UPDATE tasks
         SET is_completed = ?,
             completed_at = ?,
             local_modified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          params.isComplete ? 1 : 0,
          completedAt?.toISOString() ?? null,
          params.taskId,
        ],
        'tasks'
      );

      // Recalculate course assessed grade if completion changed
      if (previousState !== params.isComplete) {
        this.updateCourseAssessedGrade(context, task.course_id);
      }

      return {
        success: true,
        data: { previousState, completedAt },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to mark task complete: ${error}`,
      };
    }
  }

  private updateCourseAssessedGrade(context: CommandContext, courseId: number): void {
    // Calculate new assessed grade from completed tasks
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
