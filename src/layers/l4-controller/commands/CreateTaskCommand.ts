/**
 * CreateTaskCommand - Create a new user task
 *
 * Creates a user-defined task (not from Canvas) for a course.
 */

import { Command, CommandContext, CommandResult, CreateTaskParams } from '../types';

export class CreateTaskCommand implements Command<CreateTaskParams, { taskId: number }> {
  readonly name = 'CreateTask';

  validate(params: CreateTaskParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Course not found or invalid' };
    }

    if (!params.title || params.title.trim().length === 0) {
      return { valid: false, error: 'Task title is required' };
    }

    if (params.title.length > 500) {
      return { valid: false, error: 'Task title must be 500 characters or less' };
    }

    if (params.weight !== undefined && (params.weight < 0 || params.weight > 100)) {
      return { valid: false, error: 'Weight must be between 0 and 100' };
    }

    if (params.pointsPossible !== undefined && params.pointsPossible < 0) {
      return { valid: false, error: 'Points possible must be non-negative' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: CreateTaskParams
  ): Promise<CommandResult<{ taskId: number }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Verify course exists
      const course = context.db.executeReadOne<{ id: number }>(
        'SELECT id FROM courses WHERE id = ?',
        [params.courseId]
      );

      if (!course) {
        return { success: false, error: 'Course not found' };
      }

      // Generate a unique external_id for user-created tasks
      const externalId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Insert the new task
      const result = context.db.executeWrite(
        `INSERT INTO tasks (
          external_id, source_type, course_id, title, description,
          due_at, weight, points_possible, is_completed, priority_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          externalId,
          'user',
          params.courseId,
          params.title.trim(),
          params.description?.trim() || null,
          params.dueAt || null,
          params.weight ?? 0,
          params.pointsPossible ?? null,
          0, // is_completed
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
        error: `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
