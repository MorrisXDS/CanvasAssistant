/**
 * AcceptQueuedTaskCommand - Accept a queued Canvas task
 *
 * Takes a task from the queue and creates it as an active task.
 * The task will then receive grade/status updates from Canvas syncs.
 *
 * When user edits are provided, we:
 * 1. Apply user values to the task
 * 2. Set field_sources to 'user' for edited fields (enables sync conflict detection)
 * 3. Set local_modified_fields to track which fields the user changed
 */

import { Command, CommandContext, CommandResult, AcceptQueuedTaskParams } from '../types';
import type { CanvasTaskQueueRow } from '../../l1-persistence/DatabaseRowTypes';
import type { CanvasAssignment } from '../../l2-daemon/DataMapperTypes';
import { mapAssignment } from '../../l2-daemon/DataMappers';

export class AcceptQueuedTaskCommand implements Command<
  AcceptQueuedTaskParams,
  { taskId: number }
> {
  readonly name = 'AcceptQueuedTask';

  validate(params: AcceptQueuedTaskParams): { valid: boolean; error?: string } {
    if (!params.queueId || params.queueId <= 0) {
      return { valid: false, error: 'Invalid queue entry ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: AcceptQueuedTaskParams
  ): Promise<CommandResult<{ taskId: number }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get the queue entry
      const queueEntry = context.db.executeReadOne<CanvasTaskQueueRow>(
        'SELECT * FROM canvas_task_queue WHERE id = ?',
        [params.queueId]
      );

      if (!queueEntry) {
        return { success: false, error: 'Queue entry not found' };
      }

      if (queueEntry.status !== 'pending') {
        return {
          success: false,
          error: `Cannot accept task: status is '${queueEntry.status}'`,
        };
      }

      // Parse the stored Canvas data
      let canvasAssignment: CanvasAssignment;
      try {
        canvasAssignment = JSON.parse(queueEntry.canvas_data) as CanvasAssignment;
      } catch {
        return { success: false, error: 'Invalid Canvas data in queue entry' };
      }

      // Map to local task format
      const localTask = mapAssignment(canvasAssignment, queueEntry.course_id);

      // Build field_sources and local_modified_fields for user edits
      // field_sources tracks where each field value came from ('canvas' | 'user')
      // local_modified_fields tracks which fields the user has explicitly changed
      const fieldSources: Record<string, string> = {};
      const localModifiedFields: string[] = [];

      // Apply user edits if provided, tracking which fields were modified
      const finalTitle = params.edits?.title ?? localTask.title;
      if (params.edits?.title !== undefined) {
        fieldSources['title'] = 'user';
        localModifiedFields.push('title');
      }

      // Description is read-only from Canvas, not editable
      const finalDescription = localTask.description;

      const finalDueAt =
        params.edits?.dueAt !== undefined ? params.edits.dueAt : localTask.due_at;
      if (params.edits?.dueAt !== undefined) {
        fieldSources['due_at'] = 'user';
        localModifiedFields.push('due_at');
      }

      const finalTaskType =
        params.edits?.taskType !== undefined
          ? params.edits.taskType
          : localTask.task_type;
      if (params.edits?.taskType !== undefined) {
        fieldSources['task_type'] = 'user';
        localModifiedFields.push('task_type');
      }

      // Local-only fields (startAt, weight, location, notes) - these don't trigger conflicts
      // because they're never synced from Canvas
      const finalStartAt = params.edits?.startAt ?? null;
      const finalWeight = params.edits?.weight ?? localTask.weight;
      const finalLocation = params.edits?.location ?? null;
      const finalNotes = params.edits?.notes ?? null;

      // Serialize tracking fields
      const fieldSourcesJson =
        Object.keys(fieldSources).length > 0 ? JSON.stringify(fieldSources) : null;
      const localModifiedFieldsJson =
        localModifiedFields.length > 0 ? JSON.stringify(localModifiedFields) : null;

      // Create the task with acceptance tracking and all edit fields
      const result = context.db.executeWrite(
        `INSERT INTO tasks (
          external_id, source_type, course_id, title, description,
          due_at, due_time_known, start_at, unlock_at, lock_at,
          points_possible, submission_types, weight, grade,
          task_type, location, notes, is_completed, submission_status, completed_at,
          entered_grade, points_deducted, late_policy_status,
          seconds_late, is_excused, is_missing,
          field_sources, local_modified_fields,
          accepted_from_queue_id, acceptance_method, accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localTask.external_id,
          'canvas',
          queueEntry.course_id,
          finalTitle,
          finalDescription,
          finalDueAt,
          localTask.due_time_known,
          finalStartAt,
          localTask.unlock_at,
          localTask.lock_at,
          localTask.points_possible,
          localTask.submission_types,
          finalWeight,
          localTask.grade,
          finalTaskType,
          finalLocation,
          finalNotes,
          localTask.is_completed,
          localTask.submission_status,
          localTask.completed_at,
          localTask.entered_grade,
          localTask.points_deducted,
          localTask.late_policy_status,
          localTask.seconds_late,
          localTask.is_excused,
          localTask.is_missing,
          fieldSourcesJson,
          localModifiedFieldsJson,
          params.queueId,
          'manual',
          new Date().toISOString(),
        ],
        'tasks'
      );

      const taskId = result.lastInsertRowid as number;

      // Create calendar event if task has a due date
      if (finalDueAt) {
        try {
          // Use start_at or unlock_at for calendar event start
          // If neither set, use epoch (indicates a deadline event)
          const calendarStartAt =
            finalStartAt || localTask.unlock_at || '1970-01-01T00:00:00.000Z';

          const eventResult = context.db.executeWrite(
            `INSERT INTO calendar_events (
              source_type, course_id, task_id, title, description,
              start_at, end_at, all_day
            ) VALUES ('canvas', ?, ?, ?, ?, ?, ?, 0)`,
            [
              queueEntry.course_id,
              taskId,
              finalTitle,
              finalDescription,
              calendarStartAt,
              finalDueAt,
            ],
            'calendar_events'
          );

          // Link calendar event to task
          const calendarEventId = eventResult.lastInsertRowid as number;
          context.db.executeWrite(
            'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
            [calendarEventId, taskId],
            'tasks'
          );
        } catch {
          // Ignore calendar event creation failure - task was created successfully
        }
      }

      // Update queue entry status
      context.db.executeWrite(
        `UPDATE canvas_task_queue SET
          status = 'accepted',
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = 'user',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [params.queueId],
        'canvas_task_queue'
      );

      return {
        success: true,
        data: { taskId },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to accept queued task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
