/**
 * ImportICSCalendarCommand — parses an ICS file and imports it as a new
 * `imported_calendars` row plus its `calendar_events`, auto-matching each
 * event's title to a local course.
 *
 * Extracted from calendarCrudHandlers (ADR-0007). Parsing (L2 ICSParser),
 * duplicate detection (by content hash), course matching, and the
 * transactional insert are preserved verbatim. Returns the same shapes the
 * handler used: a `duplicate` result when the hash already exists, else the
 * created-calendar summary.
 */

import type { Database } from '../../../l1-persistence/Database';
import type { Logger } from '../../../l0-utilities/Logger';
import { CourseReader } from '../../../l1-persistence/readers/CourseReader';
import { ImportedCalendarReader } from '../../../l1-persistence/readers/ImportedCalendarReader';
import { ICSParser } from '../../../l2-daemon';
import { matchTitleToCourse } from './matchTitleToCourse';

export interface ImportICSCalendarInput {
  content: string;
  filename: string;
  name?: string;
  color?: string;
}

export interface ImportICSCalendarResult {
  success: boolean;
  error?: string;
  existingCalendar?: {
    id: number;
    name: string;
    color: string;
    eventCount: number;
    importedAt: string;
  };
  calendar?: {
    id: number;
    name: string;
    filename: string;
    eventCount: number;
    color: string;
  };
}

export class ImportICSCalendarCommand {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  execute(params: ImportICSCalendarInput): ImportICSCalendarResult {
    try {
      const parser = new ICSParser();
      const result = parser.parse(params.content);

      // Generate content hash for duplicate detection (uses core event data, ignores metadata)
      const fileHash = parser.generateContentHash(result.events, result.version);

      // Check if already imported
      const importedReader = new ImportedCalendarReader(this.db);
      const existing = importedReader.getByHash(fileHash);

      if (existing) {
        return {
          success: false,
          error: 'duplicate',
          existingCalendar: {
            id: existing.id,
            name: existing.name,
            color: existing.color,
            eventCount: existing.event_count,
            importedAt: existing.imported_at,
          },
        };
      }

      const calendarName =
        params.name || result.calendarName || params.filename.replace(/\.ics$/i, '');
      const color = params.color || '#6366F1';

      let calendarId = 0;
      let eventCount = 0;

      // Get all courses for auto-matching imported events
      const courses = new CourseReader(this.db).getForCalendarMatching();

      this.db.transaction(() => {
        // Insert calendar record
        const insertResult = this.db.executeWrite(
          `INSERT INTO imported_calendars (name, filename, file_hash, color, event_count) VALUES (?, ?, ?, ?, 0)`,
          [calendarName, params.filename, fileHash, color],
          'imported_calendars'
        );
        calendarId = insertResult.lastInsertRowid as number;

        // Insert events
        for (const event of result.events) {
          if (!event.dtstart) continue;

          // Auto-detect course from event title (e.g., "ECE568 LEC0102" -> ECE568 course)
          const matchedCourseId = matchTitleToCourse(event.summary, courses);

          this.db.executeWrite(
            `INSERT INTO calendar_events (
              imported_calendar_id, source_type, course_id, title, description,
              start_at, end_at, all_day, location, uid,
              recurrence_rule, recurrence_exception_dates
            ) VALUES (?, 'imported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              calendarId,
              matchedCourseId,
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

        // Update event count
        this.db.executeWrite(
          'UPDATE imported_calendars SET event_count = ? WHERE id = ?',
          [eventCount, calendarId],
          'imported_calendars'
        );
      });

      return {
        success: true,
        calendar: {
          id: calendarId,
          name: calendarName,
          filename: params.filename,
          eventCount,
          color,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to import ICS: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}
