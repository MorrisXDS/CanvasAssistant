/**
 * BulkAcceptQueuedTasksCommand - Bulk accept all pending queued tasks
 *
 * Accepts all pending queue entries, optionally filtered by course.
 * Creates tasks with acceptance_method='bulk'.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  BulkAcceptQueuedTasksParams,
} from '../types';
import type { CanvasTaskQueueRow } from '../../l1-persistence';
import type { CanvasAssignment } from '../../l2-daemon/data/DataMapperTypes';
import { mapAssignment } from '../../l2-daemon/data/DataMappers';

export class BulkAcceptQueuedTasksCommand implements Command<
  BulkAcceptQueuedTasksParams,
  { acceptedCount: number; taskIds: number[] }
> {
  readonly name = 'BulkAcceptQueuedTasks';

  validate(_params: BulkAcceptQueuedTasksParams): { valid: boolean; error?: string } {
    // courseId is optional, so no validation needed
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: BulkAcceptQueuedTasksParams
  ): Promise<CommandResult<{ acceptedCount: number; taskIds: number[] }>> {
    try {
      // Get all pending queue entries (optionally filtered by course)
      let query = 'SELECT * FROM canvas_task_queue WHERE status = ?';
      const queryParams: (string | number)[] = ['pending'];

      if (params.courseId) {
        query += ' AND course_id = ?';
        queryParams.push(params.courseId);
      }

      const queueEntries = context.db.executeRead<CanvasTaskQueueRow>(query, queryParams);

      if (queueEntries.length === 0) {
        return {
          success: true,
          data: { acceptedCount: 0, taskIds: [] },
        };
      }

      const taskIds: number[] = [];
      const now = new Date().toISOString();

      // Process in a transaction
      context.db.transaction(() => {
        for (const queueEntry of queueEntries) {
          try {
            // Parse the stored Canvas data
            const canvasAssignment = JSON.parse(
              queueEntry.canvas_data
            ) as CanvasAssignment;

            // Map to local task format
            const localTask = mapAssignment(canvasAssignment, queueEntry.course_id);

            // Create the task with bulk acceptance tracking
            const result = context.db.executeWrite(
              `INSERT INTO tasks (
                external_id, source_type, course_id, title, description,
                due_at, due_time_known, unlock_at, lock_at,
                points_possible, submission_types, weight, grade,
                task_type, is_completed, submission_status, completed_at,
                entered_grade, points_deducted, late_policy_status,
                seconds_late, is_excused, is_missing,
                accepted_from_queue_id, acceptance_method, accepted_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                localTask.external_id,
                'canvas',
                queueEntry.course_id,
                localTask.title,
                localTask.description,
                localTask.due_at,
                localTask.due_time_known,
                localTask.unlock_at,
                localTask.lock_at,
                localTask.points_possible,
                localTask.submission_types,
                localTask.weight,
                localTask.grade,
                localTask.task_type,
                localTask.is_completed,
                localTask.submission_status,
                localTask.completed_at,
                localTask.entered_grade,
                localTask.points_deducted,
                localTask.late_policy_status,
                localTask.seconds_late,
                localTask.is_excused,
                localTask.is_missing,
                queueEntry.id,
                'bulk',
                now,
              ],
              'tasks'
            );

            const taskId = result.lastInsertRowid as number;
            taskIds.push(taskId);

            // Update queue entry status
            context.db.executeWrite(
              `UPDATE canvas_task_queue SET
                status = 'accepted',
                resolved_at = ?,
                resolved_by = 'bulk',
                updated_at = ?
              WHERE id = ?`,
              [now, now, queueEntry.id],
              'canvas_task_queue'
            );
          } catch {
            // Skip entries with invalid data, continue with others
          }
        }
      });

      return {
        success: true,
        data: {
          acceptedCount: taskIds.length,
          taskIds,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to bulk accept queued tasks: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
