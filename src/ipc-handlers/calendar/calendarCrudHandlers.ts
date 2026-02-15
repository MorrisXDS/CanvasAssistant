/**
 * Calendar CRUD IPC Handlers
 * Handlers for imported calendar operations:
 * - Get all calendars
 * - Parse ICS preview
 * - Import ICS
 * - Delete calendar
 * - Update calendar settings
 * - Toggle visibility
 * - Re-import calendar
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';
import { ICSParser } from '../../layers/l2-daemon';

/**
 * Register calendar CRUD IPC handlers
 */
export function registerCalendarCrudHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // Get all imported calendars
  ipcMain.handle('calendar:getImportedCalendars', () => {
    const rows = database.executeRead<{
      id: number;
      name: string;
      filename: string;
      file_hash: string | null;
      color: string;
      event_count: number;
      is_visible: number;
      imported_at: string;
      updated_at: string;
    }>('SELECT * FROM imported_calendars ORDER BY name');

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      filename: row.filename,
      fileHash: row.file_hash,
      color: row.color,
      eventCount: row.event_count,
      isVisible: Boolean(row.is_visible),
      importedAt: row.imported_at,
      updatedAt: row.updated_at,
    }));
  });

  // Parse ICS for preview (without importing)
  ipcMain.handle(
    'calendar:parseICSPreview',
    (_event, content: string, filename: string) => {
      const parser = new ICSParser();
      return parser.createPreview(content, filename);
    }
  );

  // Import ICS calendar
  ipcMain.handle(
    'calendar:importICS',
    async (
      _event,
      params: {
        content: string;
        filename: string;
        name?: string;
        color?: string;
      }
    ) => {
      try {
        const parser = new ICSParser();
        const result = parser.parse(params.content);

        // Generate content hash for duplicate detection (uses core event data, ignores metadata)
        const fileHash = parser.generateContentHash(result.events, result.version);

        // Check if already imported
        const existing = database.executeReadOne<{
          id: number;
          name: string;
          color: string;
          event_count: number;
          imported_at: string;
        }>(
          'SELECT id, name, color, event_count, imported_at FROM imported_calendars WHERE file_hash = ?',
          [fileHash]
        );

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

        let calendarId: number = 0;
        let eventCount = 0;

        // Get all courses for auto-matching imported events
        const courses = database.executeRead<{
          id: number;
          code: string;
          name: string;
          nickname: string | null;
        }>(
          'SELECT id, code, name, nickname FROM courses WHERE code IS NOT NULL AND archived_at IS NULL'
        );

        // Helper to match event title to a course using prioritized criteria (if-else chain)
        // Priority: full code > section type match > code without section > short code > nickname > name keywords
        const matchTitleToCourse = (title: string): number | null => {
          if (!title || courses.length === 0) return null;
          const titleUpper = title.toUpperCase();

          // Extract section type from title (PRA, LEC, TUT)
          const titleSectionMatch = titleUpper.match(/\b(PRA|LEC|TUT)\d*/);
          const titleSectionType = titleSectionMatch ? titleSectionMatch[1] : null;

          // Pass 1: Try full course code with section (e.g., "ECE568H1 S LEC0102")
          for (const course of courses) {
            if (course.code) {
              const codeUpper = course.code.toUpperCase();
              if (titleUpper.includes(codeUpper)) {
                return course.id;
              }
            }
          }

          // Pass 2: If title has section type (PRA/LEC/TUT), prefer courses with same section type
          if (titleSectionType) {
            for (const course of courses) {
              if (course.code) {
                const codeUpper = course.code.toUpperCase();
                // Check if course code contains the same section type
                if (codeUpper.includes(titleSectionType)) {
                  // Also verify the base course code matches
                  const shortCodeMatch = codeUpper.match(/^([A-Z]{2,4}\d{2,4})/);
                  if (shortCodeMatch && titleUpper.includes(shortCodeMatch[1])) {
                    return course.id;
                  }
                }
              }
            }
          }

          // Pass 3: Try code without section (e.g., "ECE568H1" from "ECE568H1 S")
          for (const course of courses) {
            if (course.code) {
              const codeUpper = course.code.toUpperCase();
              const codeWithoutSection = codeUpper.split(/\s+/)[0];
              if (
                codeWithoutSection !== codeUpper &&
                titleUpper.includes(codeWithoutSection)
              ) {
                return course.id;
              }
            }
          }

          // Pass 4: Try short code without term indicator (e.g., "ECE568" from "ECE568H1")
          for (const course of courses) {
            if (course.code) {
              const codeUpper = course.code.toUpperCase();
              const shortCodeMatch = codeUpper.match(/^([A-Z]{2,4}\d{2,4})/);
              if (shortCodeMatch && titleUpper.includes(shortCodeMatch[1])) {
                return course.id;
              }
            }
          }

          // Pass 5: Try nickname (user-set)
          for (const course of courses) {
            if (course.nickname) {
              const nicknameUpper = course.nickname.toUpperCase();
              if (nicknameUpper.length >= 3 && titleUpper.includes(nicknameUpper)) {
                return course.id;
              }
            }
          }

          // Pass 6: Try significant words from course name (least specific)
          const commonWords = new Set([
            'AND',
            'THE',
            'FOR',
            'WITH',
            'INTO',
            'FROM',
            'COURSE',
            'INTRODUCTION',
            'INTRO',
            'ADVANCED',
            'TOPICS',
            'SELECTED',
          ]);
          for (const course of courses) {
            if (course.name) {
              const nameWords = course.name
                .toUpperCase()
                .split(/\s+/)
                .filter((w) => w.length >= 4 && !commonWords.has(w));

              for (const word of nameWords) {
                if (titleUpper.includes(word)) {
                  return course.id;
                }
              }
            }
          }

          return null;
        };

        database.transaction(() => {
          // Insert calendar record
          const insertResult = database.executeWrite(
            `INSERT INTO imported_calendars (name, filename, file_hash, color, event_count) VALUES (?, ?, ?, ?, 0)`,
            [calendarName, params.filename, fileHash, color],
            'imported_calendars'
          );
          calendarId = insertResult.lastInsertRowid as number;

          // Insert events
          for (const event of result.events) {
            if (!event.dtstart) continue;

            // Auto-detect course from event title (e.g., "ECE568 LEC0102" -> ECE568 course)
            const matchedCourseId = matchTitleToCourse(event.summary);

            database.executeWrite(
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
          database.executeWrite(
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
        logger.error(`Failed to import ICS: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete imported calendar
  ipcMain.handle('calendar:deleteCalendar', async (_event, calendarId: number) => {
    try {
      database.transaction(() => {
        // Delete all events for this calendar
        database.executeWrite(
          'DELETE FROM calendar_events WHERE imported_calendar_id = ?',
          [calendarId],
          'calendar_events'
        );
        // Delete the calendar
        database.executeWrite(
          'DELETE FROM imported_calendars WHERE id = ?',
          [calendarId],
          'imported_calendars'
        );
      });
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete calendar: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Update calendar settings (name, color, visibility)
  ipcMain.handle(
    'calendar:updateCalendar',
    (
      _event,
      calendarId: number,
      updates: { name?: string; color?: string; isVisible?: boolean }
    ) => {
      try {
        const setClauses: string[] = [];
        const params: (string | number)[] = [];

        if (updates.name !== undefined) {
          setClauses.push('name = ?');
          params.push(updates.name);
        }
        if (updates.color !== undefined) {
          setClauses.push('color = ?');
          params.push(updates.color);
        }
        if (updates.isVisible !== undefined) {
          setClauses.push('is_visible = ?');
          params.push(updates.isVisible ? 1 : 0);
        }

        if (setClauses.length > 0) {
          setClauses.push('updated_at = CURRENT_TIMESTAMP');
          params.push(calendarId);
          database.executeWrite(
            `UPDATE imported_calendars SET ${setClauses.join(', ')} WHERE id = ?`,
            params,
            'imported_calendars'
          );
        }

        return { success: true };
      } catch (error) {
        logger.error(`Failed to update calendar: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Toggle calendar visibility
  ipcMain.handle(
    'calendar:toggleVisibility',
    (_event, calendarId: number, isVisible: boolean) => {
      try {
        database.executeWrite(
          'UPDATE imported_calendars SET is_visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [isVisible ? 1 : 0, calendarId],
          'imported_calendars'
        );
        return { success: true };
      } catch (error) {
        logger.error(`Failed to toggle calendar visibility: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Re-import calendar (update from file)
  ipcMain.handle(
    'calendar:reimport',
    async (_event, calendarId: number, content: string) => {
      try {
        const parser = new ICSParser();
        const result = parser.parse(content);

        // Update content hash (uses core event data, ignores metadata)
        const fileHash = parser.generateContentHash(result.events, result.version);

        let eventCount = 0;

        database.transaction(() => {
          // Delete existing events
          database.executeWrite(
            'DELETE FROM calendar_events WHERE imported_calendar_id = ?',
            [calendarId],
            'calendar_events'
          );

          // Insert new events
          for (const event of result.events) {
            if (!event.dtstart) continue;

            database.executeWrite(
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
          database.executeWrite(
            `UPDATE imported_calendars SET
            file_hash = ?, event_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [fileHash, eventCount, calendarId],
            'imported_calendars'
          );
        });

        return { success: true, eventCount };
      } catch (error) {
        logger.error(`Failed to reimport calendar: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );
}
