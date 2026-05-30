/**
 * UpdateCalendarEventCommand — partial update of a calendar event, plus
 * cascade-sync of relevant fields to a linked task.
 *
 * Extracted from calendarEventHandlers per ADR-0007. The task-sync block
 * is preserved verbatim: when the event has a `task_id`, individual field
 * updates are mirrored onto the `tasks` row (startAt→unlock_at,
 * endAt→due_at, etc.). Each mirror is guarded by the same
 * `updates.X !== undefined` check as the original handler.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  taskType?: string;
  allDay?: boolean;
  location?: string;
  courseId?: number | null;
  color?: string;
  notes?: string;
  reminderMinutes?: number;
  recurrenceRule?: string;
  weight?: number;
}

export interface UpdateCalendarEventResult {
  success: boolean;
  error?: string;
}

export class UpdateCalendarEventCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(id: number, updates: UpdateCalendarEventInput): UpdateCalendarEventResult {
    try {
      this.logger.debug(
        `calendar:updateEvent called for id=${id}, updates=${JSON.stringify(updates)}`
      );

      // Get event to check if it exists and get task_id for syncing
      const event = this.db.executeReadOne<{
        source_type: string;
        task_id: number | null;
      }>(`SELECT source_type, task_id FROM calendar_events WHERE id = ?`, [id]);

      if (!event) {
        this.logger.warn(`calendar:updateEvent - Event not found for id=${id}`);
        return { success: false, error: 'Event not found' };
      }

      this.logger.debug(
        `calendar:updateEvent - Found event: source_type=${event.source_type}, task_id=${event.task_id}`
      );

      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.title !== undefined) {
        setClauses.push('title = ?');
        params.push(updates.title);
      }
      if (updates.description !== undefined) {
        setClauses.push('description = ?');
        params.push(updates.description || null);
      }
      if (updates.startAt !== undefined) {
        setClauses.push('start_at = ?');
        params.push(updates.startAt);
      }
      if (updates.endAt !== undefined) {
        setClauses.push('end_at = ?');
        params.push(updates.endAt);
      }
      if (updates.allDay !== undefined) {
        setClauses.push('all_day = ?');
        params.push(updates.allDay ? 1 : 0);
      }
      if (updates.location !== undefined) {
        setClauses.push('location = ?');
        params.push(updates.location || null);
      }
      if (updates.courseId !== undefined) {
        setClauses.push('course_id = ?');
        params.push(updates.courseId);
      }
      if (updates.color !== undefined) {
        setClauses.push('color = ?');
        params.push(updates.color || null);
      }
      if (updates.notes !== undefined) {
        setClauses.push('notes = ?');
        params.push(updates.notes || null);
      }
      if (updates.reminderMinutes !== undefined) {
        setClauses.push('reminder_minutes = ?');
        params.push(updates.reminderMinutes || null);
      }
      if (updates.recurrenceRule !== undefined) {
        setClauses.push('recurrence_rule = ?');
        params.push(updates.recurrenceRule || null);
      }

      if (setClauses.length > 0) {
        params.push(id);
        this.db.executeWrite(
          `UPDATE calendar_events SET ${setClauses.join(', ')} WHERE id = ?`,
          params,
          'calendar_events'
        );
      }

      // If this event is linked to a task, sync relevant fields to the task
      if (event.task_id) {
        if (updates.title !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET title = ? WHERE id = ?',
            [updates.title, event.task_id],
            'tasks'
          );
          this.logger.info(`Updated task ${event.task_id} title`);
        }
        if (updates.description !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET description = ? WHERE id = ?',
            [updates.description || null, event.task_id],
            'tasks'
          );
          this.logger.info(`Updated task ${event.task_id} description`);
        }
        // Sync startAt to task's unlock_at (start date)
        if (updates.startAt !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET unlock_at = ? WHERE id = ?',
            [updates.startAt, event.task_id],
            'tasks'
          );
          this.logger.info(
            `Updated task ${event.task_id} unlock_at to ${updates.startAt}`
          );
        }
        if (updates.endAt !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET due_at = ? WHERE id = ?',
            [updates.endAt, event.task_id],
            'tasks'
          );
          this.logger.info(`Updated task ${event.task_id} due_at to ${updates.endAt}`);
        }
        if (updates.courseId !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET course_id = ? WHERE id = ?',
            [updates.courseId, event.task_id],
            'tasks'
          );
          this.logger.info(
            `Updated task ${event.task_id} course_id to ${updates.courseId}`
          );
        }
        if (updates.taskType !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET task_type = ? WHERE id = ?',
            [updates.taskType || null, event.task_id],
            'tasks'
          );
          this.logger.info(
            `Updated task ${event.task_id} task_type to ${updates.taskType}`
          );
        }
        // Sync location to task
        if (updates.location !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET location = ? WHERE id = ?',
            [updates.location || null, event.task_id],
            'tasks'
          );
          this.logger.info(
            `Updated task ${event.task_id} location to ${updates.location}`
          );
        }
        // Sync weight to task
        if (updates.weight !== undefined) {
          this.db.executeWrite(
            'UPDATE tasks SET weight = ? WHERE id = ?',
            [updates.weight, event.task_id],
            'tasks'
          );
          this.logger.info(`Updated task ${event.task_id} weight to ${updates.weight}`);
        }
      }

      this.logger.info(`Successfully updated calendar event id=${id}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to update event id=${id}: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
