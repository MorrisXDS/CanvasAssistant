/**
 * AddCalendarEventExceptionCommand — appends an exception date to a
 * recurring event's `recurrence_exception_dates` (skip one occurrence).
 *
 * Extracted from calendarEventHandlers per ADR-0007. Read-modify-write of
 * the comma-joined exception-date string, preserved verbatim.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface AddCalendarEventExceptionResult {
  success: boolean;
  error?: string;
}

export class AddCalendarEventExceptionCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(eventId: number, exceptionDate: string): AddCalendarEventExceptionResult {
    try {
      const event = this.db.executeReadOne<{
        recurrence_exception_dates: string | null;
      }>('SELECT recurrence_exception_dates FROM calendar_events WHERE id = ?', [
        eventId,
      ]);

      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      const exdates = event.recurrence_exception_dates
        ? event.recurrence_exception_dates.split(',')
        : [];
      exdates.push(exceptionDate);

      this.db.executeWrite(
        'UPDATE calendar_events SET recurrence_exception_dates = ? WHERE id = ?',
        [exdates.join(','), eventId],
        'calendar_events'
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to add event exception: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
