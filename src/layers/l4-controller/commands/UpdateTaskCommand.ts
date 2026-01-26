/**
 * UpdateTaskCommand - Update task properties
 *
 * Allows editing task title, description, due date, weight, and grade.
 */

import { Command, CommandContext, CommandResult, UpdateTaskParams } from '../types';

export class UpdateTaskCommand implements Command<UpdateTaskParams, { taskId: number }> {
  readonly name = 'UpdateTask';

  validate(params: UpdateTaskParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Invalid task ID' };
    }

    if (params.title !== undefined && params.title.trim().length === 0) {
      return { valid: false, error: 'Task title cannot be empty' };
    }

    if (params.title !== undefined && params.title.length > 500) {
      return { valid: false, error: 'Task title must be 500 characters or less' };
    }

    if (params.weight !== undefined && (params.weight < 0 || params.weight > 100)) {
      return { valid: false, error: 'Weight must be between 0 and 100' };
    }

    if (
      params.grade !== undefined &&
      params.grade !== null &&
      (params.grade < 0 || params.grade > 150)
    ) {
      return { valid: false, error: 'Grade must be between 0 and 150' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: UpdateTaskParams
  ): Promise<CommandResult<{ taskId: number }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Verify task exists
      const task = context.db.executeReadOne<{ id: number; course_id: number }>(
        'SELECT id, course_id FROM tasks WHERE id = ?',
        [params.taskId]
      );

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: unknown[] = [];

      if (params.title !== undefined) {
        updates.push('title = ?');
        values.push(params.title.trim());
      }

      if (params.description !== undefined) {
        updates.push('description = ?');
        values.push(params.description?.trim() || null);
      }

      if (params.dueAt !== undefined) {
        updates.push('due_at = ?');
        values.push(params.dueAt || null);
      }

      if (params.weight !== undefined) {
        updates.push('weight = ?');
        values.push(params.weight);
      }

      if (params.grade !== undefined) {
        updates.push('grade = ?');
        values.push(params.grade);
      }

      if (params.pointsPossible !== undefined) {
        updates.push('points_possible = ?');
        values.push(params.pointsPossible);
      }

      if (params.isOptional !== undefined) {
        updates.push('is_optional = ?');
        values.push(params.isOptional ? 1 : 0);
      }

      if (params.taskType !== undefined) {
        updates.push('task_type = ?');
        values.push(params.taskType);
      }

      if (updates.length === 0) {
        return { success: true, data: { taskId: params.taskId } };
      }

      // Add timestamps
      updates.push('local_modified_at = CURRENT_TIMESTAMP');
      updates.push('updated_at = CURRENT_TIMESTAMP');

      // Add taskId for WHERE clause
      values.push(params.taskId);

      context.db.executeWrite(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        values,
        'tasks'
      );

      // Recalculate course grade if grade or weight changed
      if (params.grade !== undefined || params.weight !== undefined) {
        this.updateCourseAssessedGrade(context, task.course_id);
      }

      return {
        success: true,
        data: { taskId: params.taskId },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update task: ${error}`,
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
