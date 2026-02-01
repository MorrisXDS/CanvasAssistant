/**
 * Calendar IPC Handlers
 * Handlers for imported calendar operations:
 * - ICS import/export
 * - Calendar CRUD
 * - Event management
 * - Recurring events
 */

import { ipcMain, dialog } from 'electron';
import crypto from 'crypto';
import path from 'path';
import type { IpcContext } from './IpcContext';
import { ICSParser, RRuleExpander } from '../layers/l2-daemon';
import type { CalendarEventRecord } from '../layers/l2-daemon/RRuleExpander';

/**
 * Register all calendar-related IPC handlers
 */
export function registerCalendarHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  // ============ Imported Calendar Handlers ============

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

        // Generate file hash for duplicate detection
        const fileHash = crypto.createHash('md5').update(params.content).digest('hex');

        // Check if already imported
        const existing = database.executeReadOne<{ id: number }>(
          'SELECT id FROM imported_calendars WHERE file_hash = ?',
          [fileHash]
        );

        if (existing) {
          return { success: false, error: 'This calendar has already been imported' };
        }

        const calendarName =
          params.name || result.calendarName || params.filename.replace(/\.ics$/i, '');
        const color = params.color || '#6366F1';

        let calendarId: number = 0;
        let eventCount = 0;

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

        // Update file hash
        const fileHash = crypto.createHash('md5').update(content).digest('hex');

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

  // Get events for date range (including recurring event expansion)
  ipcMain.handle(
    'calendar:getEventsForRange',
    (
      _event,
      params: {
        startDate: string;
        endDate: string;
        calendarIds?: number[];
        includeHidden?: boolean;
      }
    ) => {
      const startDate = new Date(params.startDate);
      const endDate = new Date(params.endDate);

      // Build query based on filters
      let sql = `
      SELECT ce.*, ic.name as calendar_name, ic.color as calendar_color, ic.is_visible
      FROM calendar_events ce
      LEFT JOIN imported_calendars ic ON ce.imported_calendar_id = ic.id
      WHERE 1=1
    `;
      const sqlParams: (string | number)[] = [];

      // Filter by calendar visibility
      if (!params.includeHidden) {
        sql += " AND (ic.is_visible = 1 OR ce.source_type = 'custom')";
      }

      // Filter by specific calendars
      if (params.calendarIds && params.calendarIds.length > 0) {
        const placeholders = params.calendarIds.map(() => '?').join(',');
        sql +=
          ` AND (ce.imported_calendar_id IN (${placeholders}) OR ce.source_type = 'custom')`;
        sqlParams.push(...params.calendarIds);
      }

      const rows = database.executeRead<{
        id: number;
        imported_calendar_id: number | null;
        source_type: string;
        title: string;
        description: string | null;
        start_at: string;
        end_at: string;
        all_day: number;
        location: string | null;
        uid: string | null;
        recurrence_rule: string | null;
        recurrence_exception_dates: string | null;
        color: string | null;
        calendar_name: string | null;
        calendar_color: string | null;
        is_visible: number | null;
      }>(sql, sqlParams);

      const events: Array<{
        id: number;
        calendarId: number | null;
        sourceType: string;
        title: string;
        description: string | null;
        startAt: string;
        endAt: string;
        allDay: boolean;
        location: string | null;
        uid: string | null;
        color: string | null;
        calendarName: string | null;
        isRecurring: boolean;
        originalEventId?: number;
      }> = [];

      const expander = new RRuleExpander();

      for (const row of rows) {
        // Convert row to CalendarEventRecord for RRuleExpander
        const eventRecord: CalendarEventRecord = {
          id: row.id,
          externalId: null,
          sourceType: row.source_type as 'canvas' | 'user' | 'imported',
          courseId: null,
          importedCalendarId: row.imported_calendar_id,
          title: row.title,
          description: row.description,
          startAt: row.start_at,
          endAt: row.end_at,
          allDay: Boolean(row.all_day),
          location: row.location,
          uid: row.uid,
          recurrenceRule: row.recurrence_rule,
          recurrenceExceptionDates: row.recurrence_exception_dates,
          parentEventId: null,
          calendarName: row.calendar_name,
          color: row.color || row.calendar_color || undefined,
        };

        // Use RRuleExpander to handle both recurring and non-recurring events
        const expandedEvents = expander.expand(eventRecord, startDate, endDate);

        for (const expanded of expandedEvents) {
          events.push({
            id: expanded.id,
            calendarId: expanded.importedCalendarId,
            sourceType: expanded.sourceType,
            title: expanded.title,
            description: expanded.description,
            startAt: expanded.startAt,
            endAt: expanded.endAt || expanded.startAt,
            allDay: expanded.allDay,
            location: expanded.location,
            uid: expanded.uid,
            color: expanded.color || row.calendar_color,
            calendarName: expanded.calendarName ?? null,
            isRecurring: expanded.isRecurrenceInstance,
            originalEventId: expanded.originalEventId,
          });
        }
      }

      // Sort by start time
      events.sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );

      return events;
    }
  );

  // Create custom event
  ipcMain.handle(
    'calendar:createEvent',
    (
      _event,
      params: {
        title: string;
        description?: string;
        startAt: string;
        endAt: string;
        allDay?: boolean;
        location?: string;
        color?: string;
        recurrenceRule?: string;
      }
    ) => {
      try {
        const result = database.executeWrite(
          `INSERT INTO calendar_events (
          source_type, title, description, start_at, end_at,
          all_day, location, color, recurrence_rule
        ) VALUES ('custom', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            params.title,
            params.description || null,
            params.startAt,
            params.endAt,
            params.allDay ? 1 : 0,
            params.location || null,
            params.color || null,
            params.recurrenceRule || null,
          ],
          'calendar_events'
        );

        return { success: true, id: result.lastInsertRowid as number };
      } catch (error) {
        logger.error(`Failed to create event: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Update custom event
  ipcMain.handle(
    'calendar:updateEvent',
    (
      _event,
      id: number,
      updates: {
        title?: string;
        description?: string;
        startAt?: string;
        endAt?: string;
        allDay?: boolean;
        location?: string;
        color?: string;
        recurrenceRule?: string;
      }
    ) => {
      try {
        // First check if this is a custom event (only custom events can be edited)
        const event = database.executeReadOne<{ source_type: string }>(
          'SELECT source_type FROM calendar_events WHERE id = ?',
          [id]
        );

        if (!event) {
          return { success: false, error: 'Event not found' };
        }

        if (event.source_type !== 'custom') {
          return { success: false, error: 'Cannot edit imported events' };
        }

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
        if (updates.color !== undefined) {
          setClauses.push('color = ?');
          params.push(updates.color || null);
        }
        if (updates.recurrenceRule !== undefined) {
          setClauses.push('recurrence_rule = ?');
          params.push(updates.recurrenceRule || null);
        }

        if (setClauses.length > 0) {
          params.push(id);
          database.executeWrite(
            `UPDATE calendar_events SET ${setClauses.join(', ')} WHERE id = ?`,
            params,
            'calendar_events'
          );
        }

        return { success: true };
      } catch (error) {
        logger.error(`Failed to update event: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete custom event
  ipcMain.handle('calendar:deleteEvent', async (_event, id: number) => {
    try {
      // First check if this is a custom event
      const event = database.executeReadOne<{ source_type: string }>(
        'SELECT source_type FROM calendar_events WHERE id = ?',
        [id]
      );

      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      if (event.source_type !== 'custom') {
        return { success: false, error: 'Cannot delete imported events directly' };
      }

      database.executeWrite(
        'DELETE FROM calendar_events WHERE id = ?',
        [id],
        'calendar_events'
      );

      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete event: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Add exception date to recurring event (skip one occurrence)
  ipcMain.handle(
    'calendar:addEventException',
    (_event, eventId: number, exceptionDate: string) => {
      try {
        const event = database.executeReadOne<{
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

        database.executeWrite(
          'UPDATE calendar_events SET recurrence_exception_dates = ? WHERE id = ?',
          [exdates.join(','), eventId],
          'calendar_events'
        );

        return { success: true };
      } catch (error) {
        logger.error(`Failed to add event exception: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Export calendars to ICS
  ipcMain.handle(
    'calendar:exportBatch',
    async (_event, params: { calendarIds?: number[]; includeCustom?: boolean }) => {
      try {
        const mainWindow = ctx.getMainWindow();
        // Show save dialog
        const result = await dialog.showSaveDialog(mainWindow!, {
          defaultPath: path.join(
            require('os').homedir(),
            'Downloads',
            `calendar-export-${new Date().toISOString().split('T')[0]}.ics`
          ),
          filters: [{ name: 'iCalendar', extensions: ['ics'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }

        // Build query
        let sql = `
        SELECT ce.*, ic.name as calendar_name
        FROM calendar_events ce
        LEFT JOIN imported_calendars ic ON ce.imported_calendar_id = ic.id
        WHERE 1=1
      `;
        const sqlParams: number[] = [];

        if (params.calendarIds && params.calendarIds.length > 0) {
          const placeholders = params.calendarIds.map(() => '?').join(',');
          sql += ` AND ce.imported_calendar_id IN (${placeholders})`;
          sqlParams.push(...params.calendarIds);
        }

        if (params.includeCustom) {
          sql += " OR ce.source_type = 'custom'";
        }

        const events = database.executeRead<{
          title: string;
          description: string | null;
          start_at: string;
          end_at: string;
          all_day: number;
          location: string | null;
          uid: string | null;
          recurrence_rule: string | null;
          calendar_name: string | null;
        }>(sql, sqlParams);

        // Generate ICS content
        const lines: string[] = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Canvas Assistant//Calendar Export//EN',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
        ];

        for (const event of events) {
          lines.push('BEGIN:VEVENT');
          lines.push(
            `UID:${event.uid || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@canvasassistant`}`
          );
          lines.push(
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
          );

          if (event.all_day) {
            lines.push(
              `DTSTART;VALUE=DATE:${new Date(event.start_at).toISOString().split('T')[0].replace(/-/g, '')}`
            );
            lines.push(
              `DTEND;VALUE=DATE:${new Date(event.end_at).toISOString().split('T')[0].replace(/-/g, '')}`
            );
          } else {
            lines.push(
              `DTSTART:${new Date(event.start_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
            );
            lines.push(
              `DTEND:${new Date(event.end_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
            );
          }

          lines.push(`SUMMARY:${event.title.replace(/\n/g, '\\n')}`);
          if (event.description) {
            lines.push(`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`);
          }
          if (event.location) {
            lines.push(`LOCATION:${event.location.replace(/\n/g, '\\n')}`);
          }
          if (event.recurrence_rule) {
            lines.push(`RRULE:${event.recurrence_rule}`);
          }

          lines.push('END:VEVENT');
        }

        lines.push('END:VCALENDAR');

        // Write file
        const fs = require('fs');
        fs.writeFileSync(result.filePath, lines.join('\r\n'), 'utf-8');

        return { success: true, path: result.filePath, eventCount: events.length };
      } catch (error) {
        logger.error(`Failed to export calendars: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );
}
