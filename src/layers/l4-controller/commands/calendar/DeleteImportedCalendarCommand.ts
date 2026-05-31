/**
 * DeleteImportedCalendarCommand — deletes an imported calendar and all of
 * its events in one transaction.
 *
 * Extracted from calendarCrudHandlers (ADR-0007).
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';

export interface DeleteImportedCalendarResult {
  success: boolean;
  error?: string;
}

export class DeleteImportedCalendarCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(calendarId: number): DeleteImportedCalendarResult {
    try {
      this.db.transaction(() => {
        // Delete all events for this calendar
        this.db.executeWrite(
          'DELETE FROM calendar_events WHERE imported_calendar_id = ?',
          [calendarId],
          'calendar_events'
        );
        // Delete the calendar
        this.db.executeWrite(
          'DELETE FROM imported_calendars WHERE id = ?',
          [calendarId],
          'imported_calendars'
        );
      });
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete calendar: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
