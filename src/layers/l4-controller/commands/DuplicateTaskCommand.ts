/**
 * DuplicateTaskCommand - Create a new task from an existing one (template)
 *
 * Duplicates an existing task with optional property overrides.
 * Useful for creating similar tasks quickly.
 */

import { Command, CommandContext, CommandResult, DuplicateTaskParams } from '../types';

interface TaskRecord {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  unlock_at: string | null;
  due_at: string | null;
  weight: number;
  points_possible: number | null;
  task_type: string | null;
}

export class DuplicateTaskCommand implements Command<
  DuplicateTaskParams,
  { taskId: number }
> {
  readonly name = 'DuplicateTask';

  validate(params: DuplicateTaskParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Invalid task ID' };
    }

    if (
      params.overrides?.title !== undefined &&
      params.overrides.title.trim().length === 0
    ) {
      return { valid: false, error: 'Task title cannot be empty' };
    }

    if (
      params.overrides?.weight !== undefined &&
      (params.overrides.weight < 0 || params.overrides.weight > 100)
    ) {
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
        `SELECT id, course_id, title, description, unlock_at, due_at, weight, points_possible, task_type
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
      const newDescription =
        params.overrides?.description !== undefined
          ? params.overrides.description?.trim() || null
          : originalTask.description;
      const newUnlockAt =
        params.overrides?.unlockAt !== undefined
          ? params.overrides.unlockAt || null
          : originalTask.unlock_at;
      const newDueAt =
        params.overrides?.dueAt !== undefined
          ? params.overrides.dueAt || null
          : originalTask.due_at;
      const newWeight = params.overrides?.weight ?? originalTask.weight;
      const newPointsPossible =
        params.overrides?.pointsPossible ?? originalTask.points_possible;
      const newTaskType =
        params.overrides?.taskType !== undefined
          ? params.overrides.taskType || null
          : originalTask.task_type;

      // Insert the duplicated task
      const result = context.db.executeWrite(
        `INSERT INTO tasks (
          external_id, source_type, course_id, title, description,
          unlock_at, due_at, weight, points_possible, is_completed, priority_score, task_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          externalId,
          'user', // Duplicated tasks are always user-created
          newCourseId,
          newTitle,
          newDescription,
          newUnlockAt,
          newDueAt,
          newWeight,
          newPointsPossible,
          0, // is_completed - new task starts incomplete
          50, // default priority score
          newTaskType,
        ],
        'tasks'
      );

      const taskId = result.lastInsertRowid as number;

      // Create a calendar event for the duplicated task (like CreateTask does)
      if (newDueAt) {
        try {
          // Use unlock_at as start_at; if not set, use epoch (deadline event)
          const startAt = newUnlockAt || '1970-01-01T00:00:00.000Z';
          const eventResult = context.db.executeWrite(
            `INSERT INTO calendar_events (
              source_type, course_id, task_id, title, description,
              start_at, end_at, all_day
            ) VALUES ('user', ?, ?, ?, ?, ?, ?, 0)`,
            [
              newCourseId,
              taskId,
              newTitle,
              newDescription,
              startAt,
              newDueAt,
            ],
            'calendar_events'
          );

          // Link the calendar event back to the task
          const calendarEventId = eventResult.lastInsertRowid as number;
          context.db.executeWrite(
            'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
            [calendarEventId, taskId],
            'tasks'
          );
        } catch (calendarError) {
          // Log but don't fail - task was created successfully
          console.warn('Failed to create calendar event for duplicated task:', calendarError);
        }
      }

      return {
        success: true,
        data: { taskId },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to duplicate task: ${error}`,
      };
    }
  }
}
