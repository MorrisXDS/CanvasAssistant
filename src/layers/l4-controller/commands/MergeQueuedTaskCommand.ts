/**
 * MergeQueuedTaskCommand - Merge a queued Canvas task with a user task
 *
 * Combines a Canvas queue entry with an existing user-created task,
 * allowing the user to keep specific fields from their original task
 * (e.g., notes, personal due date, custom title).
 */

import { Command, CommandContext, CommandResult, MergeQueuedTaskParams } from '../types';
import type { CanvasTaskQueueRow, TaskRow } from '../../l1-persistence';
import type { CanvasAssignment } from '../../l2-daemon/data/DataMapperTypes';
import { mapAssignment } from '../../l2-daemon/data/DataMappers';

export class MergeQueuedTaskCommand implements Command<
  MergeQueuedTaskParams,
  { taskId: number }
> {
  readonly name = 'MergeQueuedTask';

  validate(params: MergeQueuedTaskParams): { valid: boolean; error?: string } {
    if (!params.queueId || params.queueId <= 0) {
      return { valid: false, error: 'Invalid queue entry ID' };
    }
    if (!params.userTaskId || params.userTaskId <= 0) {
      return { valid: false, error: 'Invalid user task ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: MergeQueuedTaskParams
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
          error: `Cannot merge task: queue status is '${queueEntry.status}'`,
        };
      }

      // Get the user task
      const userTask = context.db.executeReadOne<TaskRow>(
        'SELECT * FROM tasks WHERE id = ?',
        [params.userTaskId]
      );

      if (!userTask) {
        return { success: false, error: 'User task not found' };
      }

      if (userTask.source_type !== 'user') {
        return {
          success: false,
          error: 'Can only merge with user-created tasks',
        };
      }

      if (userTask.course_id !== queueEntry.course_id) {
        return {
          success: false,
          error: 'Queue entry and user task must be from the same course',
        };
      }

      // Parse the stored Canvas data
      let canvasAssignment: CanvasAssignment;
      try {
        canvasAssignment = JSON.parse(queueEntry.canvas_data) as CanvasAssignment;
      } catch {
        return { success: false, error: 'Invalid Canvas data in queue entry' };
      }

      // Map Canvas data to local format
      const canvasTask = mapAssignment(canvasAssignment, queueEntry.course_id);

      // Determine what to keep from user task
      const keepFromUser = params.keepFromUser ?? {};
      const keepNotes = keepFromUser.notes ?? true; // Default: keep notes
      const keepDueAt = keepFromUser.dueAt ?? false; // Default: use Canvas due date
      const keepTitle = keepFromUser.title ?? false; // Default: use Canvas title
      const keepDescription = keepFromUser.description ?? false; // Default: use Canvas description
      const keepTaskType = keepFromUser.taskType ?? false; // Default: use Canvas task_type
      // For start_at: user's start_at vs Canvas's unlock_at
      // Default: keep user's if they had one, otherwise use Canvas unlock_at
      const keepStartAt = keepFromUser.startAt ?? userTask.start_at != null;

      // Build field_sources and local_modified_fields for conflict tracking
      // field_sources tracks where each field value came from ('canvas' | 'user')
      // local_modified_fields tracks which fields the user chose to keep from their version
      const fieldSources: Record<string, string> = {};
      const localModifiedFields: string[] = [];

      // Track conflict-enabled fields based on user choices
      if (keepTitle) {
        fieldSources['title'] = 'user';
        localModifiedFields.push('title');
      } else {
        fieldSources['title'] = 'canvas';
      }

      if (keepDescription) {
        fieldSources['description'] = 'user';
        localModifiedFields.push('description');
      } else {
        fieldSources['description'] = 'canvas';
      }

      if (keepDueAt) {
        fieldSources['due_at'] = 'user';
        localModifiedFields.push('due_at');
      } else {
        fieldSources['due_at'] = 'canvas';
      }

      // Track task_type source
      if (keepTaskType) {
        fieldSources['task_type'] = 'user';
        localModifiedFields.push('task_type');
      } else {
        fieldSources['task_type'] = 'canvas';
      }

      // Track start_at source (user's start_at vs Canvas's unlock_at)
      if (keepStartAt && userTask.start_at) {
        fieldSources['start_at'] = 'user';
        localModifiedFields.push('start_at');
      } else if (canvasTask.unlock_at) {
        fieldSources['start_at'] = 'canvas';
      }

      // Serialize tracking fields
      const fieldSourcesJson = JSON.stringify(fieldSources);
      const localModifiedFieldsJson =
        localModifiedFields.length > 0 ? JSON.stringify(localModifiedFields) : null;

      // Build the merged task data
      const mergedData = {
        // Canvas fields (authoritative)
        external_id: canvasTask.external_id,
        source_type: 'canvas',
        description: keepDescription ? userTask.description : canvasTask.description,
        unlock_at: canvasTask.unlock_at,
        lock_at: canvasTask.lock_at,
        points_possible: canvasTask.points_possible,
        submission_types: canvasTask.submission_types,
        grade: canvasTask.grade,
        task_type: keepTaskType ? userTask.task_type : canvasTask.task_type,
        submission_status: canvasTask.submission_status,
        is_completed: canvasTask.is_completed,
        completed_at: canvasTask.completed_at,
        entered_grade: canvasTask.entered_grade,
        points_deducted: canvasTask.points_deducted,
        late_policy_status: canvasTask.late_policy_status,
        seconds_late: canvasTask.seconds_late,
        is_excused: canvasTask.is_excused,
        is_missing: canvasTask.is_missing,
        // Configurable fields (user choice)
        title: keepTitle ? userTask.title : canvasTask.title,
        due_at: keepDueAt ? userTask.due_at : canvasTask.due_at,
        due_time_known: keepDueAt ? userTask.due_time_known : canvasTask.due_time_known,
        // User-only fields (always preserved)
        notes: keepNotes ? userTask.notes : null,
        // Preserve user's weight and location if they had set them
        weight: userTask.weight || canvasTask.weight,
        location: userTask.location,
        // start_at: user's start_at OR Canvas's unlock_at (as start date)
        start_at: keepStartAt ? userTask.start_at : canvasTask.unlock_at,
        // Acceptance tracking
        accepted_from_queue_id: params.queueId,
        acceptance_method: 'manual',
        accepted_at: new Date().toISOString(),
        // Field source tracking for sync conflict detection
        field_sources: fieldSourcesJson,
        local_modified_fields: localModifiedFieldsJson,
      };

      // Update the user task with merged data
      context.db.executeWrite(
        `UPDATE tasks SET
          external_id = ?,
          source_type = ?,
          title = ?,
          description = ?,
          due_at = ?,
          due_time_known = ?,
          start_at = ?,
          unlock_at = ?,
          lock_at = ?,
          points_possible = ?,
          submission_types = ?,
          weight = ?,
          grade = ?,
          task_type = ?,
          submission_status = ?,
          is_completed = ?,
          completed_at = ?,
          entered_grade = ?,
          points_deducted = ?,
          late_policy_status = ?,
          seconds_late = ?,
          is_excused = ?,
          is_missing = ?,
          notes = ?,
          location = ?,
          accepted_from_queue_id = ?,
          acceptance_method = ?,
          accepted_at = ?,
          field_sources = ?,
          local_modified_fields = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          mergedData.external_id,
          mergedData.source_type,
          mergedData.title,
          mergedData.description,
          mergedData.due_at,
          mergedData.due_time_known,
          mergedData.start_at,
          mergedData.unlock_at,
          mergedData.lock_at,
          mergedData.points_possible,
          mergedData.submission_types,
          mergedData.weight,
          mergedData.grade,
          mergedData.task_type,
          mergedData.submission_status,
          mergedData.is_completed,
          mergedData.completed_at,
          mergedData.entered_grade,
          mergedData.points_deducted,
          mergedData.late_policy_status,
          mergedData.seconds_late,
          mergedData.is_excused,
          mergedData.is_missing,
          mergedData.notes,
          mergedData.location,
          mergedData.accepted_from_queue_id,
          mergedData.acceptance_method,
          mergedData.accepted_at,
          mergedData.field_sources,
          mergedData.local_modified_fields,
          params.userTaskId,
        ],
        'tasks'
      );

      // Update or create calendar event
      if (mergedData.due_at) {
        if (userTask.calendar_event_id) {
          // Update existing calendar event
          context.db.executeWrite(
            `UPDATE calendar_events SET
              title = ?,
              description = ?,
              start_at = ?,
              end_at = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
              mergedData.title,
              mergedData.description,
              mergedData.start_at || mergedData.unlock_at || '1970-01-01T00:00:00.000Z',
              mergedData.due_at,
              userTask.calendar_event_id,
            ],
            'calendar_events'
          );
        } else {
          // Create new calendar event (user task had none)
          try {
            const calendarStartAt =
              mergedData.start_at || mergedData.unlock_at || '1970-01-01T00:00:00.000Z';

            const eventResult = context.db.executeWrite(
              `INSERT INTO calendar_events (
                source_type, course_id, task_id, title, description,
                start_at, end_at, all_day
              ) VALUES ('canvas', ?, ?, ?, ?, ?, ?, 0)`,
              [
                queueEntry.course_id,
                params.userTaskId,
                mergedData.title,
                mergedData.description,
                calendarStartAt,
                mergedData.due_at,
              ],
              'calendar_events'
            );

            // Link calendar event to task
            const calendarEventId = eventResult.lastInsertRowid as number;
            context.db.executeWrite(
              'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
              [calendarEventId, params.userTaskId],
              'tasks'
            );
          } catch {
            // Ignore calendar event creation failure - merge was successful
          }
        }
      }

      // Update queue entry status
      context.db.executeWrite(
        `UPDATE canvas_task_queue SET
          status = 'merged',
          matched_user_task_id = ?,
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = 'user',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [params.userTaskId, params.queueId],
        'canvas_task_queue'
      );

      return {
        success: true,
        data: { taskId: params.userTaskId },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to merge queued task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
