/**
 * Calendar Migration Utilities
 * Recomputes content hashes for existing calendars (one-time migration)
 */

import { ICSParser } from '../../layers/l2-daemon';
import type { ParsedICSEvent } from '../../layers/l2-daemon/calendar/ICSParser';
import type { Database } from '../../layers/l1-persistence';
import type { Logger } from '../../layers/l0-utilities';

/**
 * Recompute content hashes for existing calendars
 * This migrates old full-file MD5 hashes to the new content-based hash format
 */
export function recomputeCalendarHashes(database: Database, logger: Logger): void {
  try {
    const calendars = database.executeRead<{ id: number; name: string }>(
      'SELECT id, name FROM imported_calendars'
    );

    if (calendars.length === 0) return;

    const parser = new ICSParser();
    let updated = 0;

    for (const calendar of calendars) {
      // Fetch events for this calendar
      const events = database.executeRead<{
        uid: string | null;
        title: string;
        description: string | null;
        start_at: string;
        end_at: string | null;
        recurrence_rule: string | null;
        location: string | null;
      }>(
        `SELECT uid, title, description, start_at, end_at, recurrence_rule, location
         FROM calendar_events WHERE imported_calendar_id = ?`,
        [calendar.id]
      );

      if (events.length === 0) continue;

      // Convert to ParsedICSEvent format for hash generation
      const parsedEvents: ParsedICSEvent[] = events.map((e) => ({
        uid: e.uid || '',
        summary: e.title,
        description: e.description,
        dtstart: e.start_at ? new Date(e.start_at) : null,
        dtend: e.end_at ? new Date(e.end_at) : null,
        allDay: false,
        location: e.location,
        rrule: e.recurrence_rule,
        exdates: null,
        sequence: 0,
      }));

      // Generate new content hash (using default version since we don't store it)
      const newHash = parser.generateContentHash(parsedEvents, '2.0');

      // Update the hash
      database.executeWrite(
        'UPDATE imported_calendars SET file_hash = ? WHERE id = ?',
        [newHash, calendar.id],
        'imported_calendars'
      );
      updated++;
    }

    if (updated > 0) {
      logger.info(`Recomputed content hashes for ${updated} imported calendar(s)`);
    }
  } catch (error) {
    logger.warn(`Failed to recompute calendar hashes: ${error}`);
  }
}
