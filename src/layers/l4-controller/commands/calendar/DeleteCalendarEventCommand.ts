/**
 * DeleteCalendarEventCommand — deletes a user event (or the user task it is
 * linked to, which cascades to the event).
 *
 * Extracted from calendarEventHandlers per ADR-0007. Preserves the
 * original guard: Canvas-synced events cannot be deleted directly; an event
 * is deletable only when its own `source_type` is 'user' OR it is linked to
 * a user-created task.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface DeleteCalendarEventResult {
  success: boolean;
  error?: string;
}

export class DeleteCalendarEventCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(id: number): DeleteCalendarEventResult {
    try {
      // Check event type - allow deleting user events and events linked to user tasks
      const event = this.db.executeReadOne<{
        source_type: string;
        task_id: number | null;
        task_source_type: string | null;
      }>(
        `SELECT ce.source_type, ce.task_id, t.source_type as task_source_type
         FROM calendar_events ce
         LEFT JOIN tasks t ON ce.task_id = t.id
         WHERE ce.id = ?`,
        [id]
      );

      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      // Allow deleting if:
      // 1. Event source_type is 'user', OR
      // 2. Event is linked to a user-created task
      const canDelete =
        event.source_type === 'user' ||
        (event.task_id && event.task_source_type === 'user');

      if (!canDelete) {
        return { success: false, error: 'Cannot delete Canvas-synced events directly' };
      }

      // If linked to a user-created task, delete the task too (cascade will delete event)
      if (event.task_id && event.source_type === 'user') {
        this.db.executeWrite(
          'DELETE FROM tasks WHERE id = ? AND source_type = ?',
          [event.task_id, 'user'],
          'tasks'
        );
        this.logger.info(
          `Deleted user task ${event.task_id} and associated calendar event`
        );
      } else {
        // Delete just the calendar event
        this.db.executeWrite(
          'DELETE FROM calendar_events WHERE id = ?',
          [id],
          'calendar_events'
        );
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete event: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
