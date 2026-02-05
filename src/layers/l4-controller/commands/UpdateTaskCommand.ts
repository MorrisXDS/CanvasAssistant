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
      return { valid: false, error: 'Task not found or invalid' };
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
        // Mark title as user-modified so sync will trigger conflict if Canvas differs
        this.markFieldAsUserModified(context, params.taskId, 'title');
      }

      if (params.description !== undefined) {
        updates.push('description = ?');
        values.push(params.description?.trim() || null);
      }

      if (params.notes !== undefined) {
        updates.push('notes = ?');
        values.push(params.notes?.trim() || null);
      }

      if (params.unlockAt !== undefined) {
        updates.push('unlock_at = ?');
        values.push(params.unlockAt || null);
      }

      if (params.dueAt !== undefined) {
        updates.push('due_at = ?');
        values.push(params.dueAt || null);
        // Mark due_at as user-modified so sync will trigger conflict if Canvas differs
        this.markFieldAsUserModified(context, params.taskId, 'due_at');
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
        // Mark task_type as user-modified so sync will trigger conflict if Canvas differs
        this.markFieldAsUserModified(context, params.taskId, 'task_type');
      }

      if (params.location !== undefined) {
        updates.push('location = ?');
        values.push(params.location?.trim() || null);
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

      // Bidirectional sync: if title, description, unlock_at, due_at, or location changed, sync to calendar event
      if (
        params.title !== undefined ||
        params.description !== undefined ||
        params.unlockAt !== undefined ||
        params.dueAt !== undefined ||
        params.location !== undefined
      ) {
        const taskWithLink = context.db.executeReadOne<{
          calendar_event_id: number | null;
          title: string;
          description: string | null;
          unlock_at: string | null;
          due_at: string | null;
          location: string | null;
          course_id: number;
        }>(
          'SELECT calendar_event_id, title, description, unlock_at, due_at, location, course_id FROM tasks WHERE id = ?',
          [params.taskId]
        );

        if (taskWithLink?.calendar_event_id) {
          // Update existing calendar event
          // Sync title to calendar event
          if (params.title !== undefined) {
            context.db.executeWrite(
              `UPDATE calendar_events
               SET title = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [params.title.trim(), taskWithLink.calendar_event_id],
              'calendar_events'
            );
          }

          // Sync description to calendar event
          if (params.description !== undefined) {
            context.db.executeWrite(
              `UPDATE calendar_events
               SET description = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [params.description?.trim() || null, taskWithLink.calendar_event_id],
              'calendar_events'
            );
          }

          // Sync unlock_at to calendar event's start_at
          if (params.unlockAt !== undefined) {
            context.db.executeWrite(
              `UPDATE calendar_events
               SET start_at = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [params.unlockAt, taskWithLink.calendar_event_id],
              'calendar_events'
            );
          }

          // Sync due_at to calendar event's end_at (including clearing it)
          if (params.dueAt !== undefined) {
            context.db.executeWrite(
              `UPDATE calendar_events
               SET end_at = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [params.dueAt, taskWithLink.calendar_event_id],
              'calendar_events'
            );
          }

          // Sync location to calendar event
          if (params.location !== undefined) {
            context.db.executeWrite(
              `UPDATE calendar_events
               SET location = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [params.location?.trim() || null, taskWithLink.calendar_event_id],
              'calendar_events'
            );
          }
        } else if (taskWithLink) {
          // No calendar event exists - create one if task has dates
          // Use the new unlockAt/dueAt if provided, otherwise fall back to existing values
          const effectiveUnlockAt =
            params.unlockAt !== undefined ? params.unlockAt : taskWithLink.unlock_at;
          const effectiveDueAt =
            params.dueAt !== undefined ? params.dueAt : taskWithLink.due_at;

          // Only create calendar event if we have at least a due date
          if (effectiveDueAt) {
            const startAt = effectiveUnlockAt || '1970-01-01T00:00:00.000Z';
            const effectiveLocation =
              params.location !== undefined
                ? params.location?.trim() || null
                : taskWithLink.location;
            const eventResult = context.db.executeWrite(
              `INSERT INTO calendar_events (
                source_type, course_id, task_id, title, description,
                start_at, end_at, all_day, location
              ) VALUES ('user', ?, ?, ?, ?, ?, ?, 0, ?)`,
              [
                taskWithLink.course_id,
                params.taskId,
                params.title !== undefined ? params.title.trim() : taskWithLink.title,
                params.description !== undefined
                  ? params.description?.trim() || null
                  : taskWithLink.description,
                startAt,
                effectiveDueAt,
                effectiveLocation,
              ],
              'calendar_events'
            );

            // Link the calendar event back to the task
            const calendarEventId = eventResult.lastInsertRowid as number;
            context.db.executeWrite(
              'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
              [calendarEventId, params.taskId],
              'tasks'
            );
          }
        }
      }

      return {
        success: true,
        data: { taskId: params.taskId },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Mark a field as user-modified in field_sources
   * This ensures sync will trigger a conflict if Canvas has a different value
   */
  private markFieldAsUserModified(
    context: CommandContext,
    taskId: number,
    field: string
  ): void {
    // Get current field_sources
    const task = context.db.executeReadOne<{ field_sources: string | null }>(
      'SELECT field_sources FROM tasks WHERE id = ?',
      [taskId]
    );

    const sources: Record<string, string> = task?.field_sources
      ? JSON.parse(task.field_sources)
      : {};
    sources[field] = 'user';

    context.db.executeWrite(
      'UPDATE tasks SET field_sources = ? WHERE id = ?',
      [JSON.stringify(sources), taskId],
      'tasks'
    );

    // Also update local_modified_fields for backwards compatibility
    const taskWithModified = context.db.executeReadOne<{
      local_modified_fields: string | null;
    }>('SELECT local_modified_fields FROM tasks WHERE id = ?', [taskId]);

    const modified = new Set<string>(
      taskWithModified?.local_modified_fields
        ? JSON.parse(taskWithModified.local_modified_fields)
        : []
    );
    modified.add(field);

    context.db.executeWrite(
      'UPDATE tasks SET local_modified_fields = ? WHERE id = ?',
      [JSON.stringify(Array.from(modified)), taskId],
      'tasks'
    );
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
