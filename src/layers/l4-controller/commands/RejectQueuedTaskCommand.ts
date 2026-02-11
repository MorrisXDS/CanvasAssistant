/**
 * RejectQueuedTaskCommand - Reject a queued Canvas task
 *
 * Marks a queue entry as rejected. The task won't resurface on re-sync,
 * though its metadata will still be updated in the queue table.
 */

import { Command, CommandContext, CommandResult, RejectQueuedTaskParams } from '../types';
import type { CanvasTaskQueueRow } from '../../l1-persistence';

export class RejectQueuedTaskCommand implements Command<RejectQueuedTaskParams, void> {
  readonly name = 'RejectQueuedTask';

  validate(params: RejectQueuedTaskParams): { valid: boolean; error?: string } {
    if (!params.queueId || params.queueId <= 0) {
      return { valid: false, error: 'Invalid queue entry ID' };
    }
    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: RejectQueuedTaskParams
  ): Promise<CommandResult<void>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get the queue entry
      const queueEntry = context.db.executeReadOne<CanvasTaskQueueRow>(
        'SELECT id, status FROM canvas_task_queue WHERE id = ?',
        [params.queueId]
      );

      if (!queueEntry) {
        return { success: false, error: 'Queue entry not found' };
      }

      if (queueEntry.status !== 'pending') {
        return {
          success: false,
          error: `Cannot reject task: status is already '${queueEntry.status}'`,
        };
      }

      // Update queue entry status to rejected
      context.db.executeWrite(
        `UPDATE canvas_task_queue SET
          status = 'rejected',
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = 'user',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [params.queueId],
        'canvas_task_queue'
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to reject queued task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
