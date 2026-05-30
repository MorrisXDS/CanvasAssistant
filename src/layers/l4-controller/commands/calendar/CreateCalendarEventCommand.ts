/**
 * CreateCalendarEventCommand — inserts a user-created calendar event.
 *
 * Extracted from calendarEventHandlers per ADR-0007 (writes route through
 * L4). Preserves the original two-step write exactly: a base INSERT with
 * the always-present columns, then a best-effort UPDATE for the optional
 * columns (color / notes / reminder_minutes) wrapped in its own try/catch
 * so a pre-migration-70 schema (missing those columns) still succeeds.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  courseId?: number;
  color?: string;
  notes?: string;
  reminderMinutes?: number;
  recurrenceRule?: string;
}

export interface CreateCalendarEventResult {
  success: boolean;
  data?: { id: number };
  error?: string;
}

export class CreateCalendarEventCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(params: CreateCalendarEventInput): CreateCalendarEventResult {
    try {
      this.logger.info(
        `Creating calendar event: title="${params.title}", startAt=${params.startAt}`
      );

      // Use basic columns first, then try to add optional columns
      // This handles cases where migration 70 hasn't run yet
      const result = this.db.executeWrite(
        `INSERT INTO calendar_events (
          source_type, course_id, title, description, start_at, end_at,
          all_day, location, recurrence_rule
        ) VALUES ('user', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.courseId || null,
          params.title,
          params.description || null,
          params.startAt,
          params.endAt || null,
          params.allDay ? 1 : 0,
          params.location || null,
          params.recurrenceRule || null,
        ],
        'calendar_events'
      );

      const eventId = result.lastInsertRowid as number;

      // Try to update optional fields if the columns exist (migration 70+)
      try {
        if (params.color || params.notes || params.reminderMinutes) {
          const updates: string[] = [];
          const updateParams: (string | number | null)[] = [];

          if (params.color) {
            updates.push('color = ?');
            updateParams.push(params.color);
          }
          if (params.notes) {
            updates.push('notes = ?');
            updateParams.push(params.notes);
          }
          if (params.reminderMinutes) {
            updates.push('reminder_minutes = ?');
            updateParams.push(params.reminderMinutes);
          }

          if (updates.length > 0) {
            updateParams.push(eventId);
            this.db.executeWrite(
              `UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`,
              updateParams,
              'calendar_events'
            );
          }
        }
      } catch (updateError) {
        // Columns might not exist yet, that's OK
        this.logger.debug(`Optional columns not available: ${updateError}`);
      }

      this.logger.info(`Created calendar event with id=${eventId}`);
      return { success: true, data: { id: eventId } };
    } catch (error) {
      this.logger.error(`Failed to create event: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
