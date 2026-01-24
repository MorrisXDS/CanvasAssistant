/**
 * DuplicateTaskCommand - Create a new task from an existing one (template)
 *
 * Duplicates an existing task with optional property overrides.
 * Useful for creating similar tasks quickly.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  DuplicateTaskParams,
} from '../types';

interface TaskRecord {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  weight: number;
  points_possible: number | null;
}

export class DuplicateTaskCommand
  implements Command<DuplicateTaskParams, { taskId: number }>
{
  readonly name = 'DuplicateTask';

  validate(params: DuplicateTaskParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Invalid task ID' };
    }

    if (params.overrides?.title !== undefined && params.overrides.title.trim().length === 0) {
      return { valid: false, error: 'Task title cannot be empty' };
    }

    if (params.overrides?.weight !== undefined && (params.overrides.weight < 0 || params.overrides.weight > 100)) {
      return { valid: false, error: 'Weight must be between 0 and 100' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: DuplicateTaskParams
  ): Promise<CommandResult<{ taskId: number }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get the original task
      const originalTask = context.db.executeReadOne<TaskRecord>(
        `SELECT id, course_id, title, description, due_at, weight, points_possible
         FROM tasks WHERE id = ?`,
        [params.taskId]
      );

      if (!originalTask) {
        return { success: false, error: 'Original task not found' };
      }

      // Generate a unique external_id for the duplicate
      const externalId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Apply overrides
      const newTitle = params.overrides?.title?.trim() || `${originalTask.title} (Copy)`;
      const newCourseId = params.overrides?.courseId ?? originalTask.course_id;
      const newDescription = params.overrides?.description !== undefined
        ? params.overrides.description?.trim() || null
        : originalTask.description;
      const newDueAt = params.overrides?.dueAt !== undefined
        ? params.overrides.dueAt || null
        : originalTask.due_at;
      const newWeight = params.overrides?.weight ?? originalTask.weight;
      const newPointsPossible = params.overrides?.pointsPossible ?? originalTask.points_possible;

      // Insert the duplicated task
      const result = context.db.executeWrite(
        `INSERT INTO tasks (
          external_id, source_type, course_id, title, description,
          due_at, weight, points_possible, is_completed, priority_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          externalId,
          'user', // Duplicated tasks are always user-created
          newCourseId,
          newTitle,
          newDescription,
          newDueAt,
          newWeight,
          newPointsPossible,
          0, // is_completed - new task starts incomplete
          50, // default priority score
        ],
        'tasks'
      );

      return {
        success: true,
        data: { taskId: result.lastInsertRowid },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to duplicate task: ${error}`,
      };
    }
  }
}
