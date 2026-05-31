/**
 * ReimportICSCalendarCommand — re-parses an ICS file and replaces an
 * existing imported calendar's events in place.
 *
 * Extracted from calendarCrudHandlers (ADR-0007). Unlike import, reimport
 * does NOT re-run course matching (preserved from the original). The
 * transaction deletes existing events, inserts the new ones, and refreshes
 * the calendar record's hash + event count.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';
import { ICSParser } from '../../../l2-daemon';

export interface ReimportICSCalendarResult {
  success: boolean;
  eventCount?: number;
  error?: string;
}

export class ReimportICSCalendarCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(calendarId: number, content: string): ReimportICSCalendarResult {
    try {
      const parser = new ICSParser();
      const result = parser.parse(content);

      // Update content hash (uses core event data, ignores metadata)
      const fileHash = parser.generateContentHash(result.events, result.version);

      let eventCount = 0;

      this.db.transaction(() => {
        // Delete existing events
        this.db.executeWrite(
          'DELETE FROM calendar_events WHERE imported_calendar_id = ?',
          [calendarId],
          'calendar_events'
        );

        // Insert new events
        for (const event of result.events) {
          if (!event.dtstart) continue;

          this.db.executeWrite(
            `INSERT INTO calendar_events (
              imported_calendar_id, source_type, title, description,
              start_at, end_at, all_day, location, uid,
              recurrence_rule, recurrence_exception_dates
            ) VALUES (?, 'imported', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              calendarId,
              event.summary,
              event.description || null,
              event.dtstart.toISOString(),
              event.dtend?.toISOString() || event.dtstart.toISOString(),
              event.allDay ? 1 : 0,
              event.location || null,
              event.uid,
              event.rrule || null,
              event.exdates?.join(',') || null,
            ],
            'calendar_events'
          );
          eventCount++;
        }

        // Update calendar record
        this.db.executeWrite(
          `UPDATE imported_calendars SET
            file_hash = ?, event_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [fileHash, eventCount, calendarId],
          'imported_calendars'
        );
      });

      return { success: true, eventCount };
    } catch (error) {
      this.logger.error(`Failed to reimport calendar: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
