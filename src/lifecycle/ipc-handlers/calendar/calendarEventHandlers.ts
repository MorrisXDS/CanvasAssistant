/**
 * Calendar Event IPC Handlers
 * Handlers for calendar event operations:
 * - Get events for date range (with recurring event expansion)
 * - Create custom event
 * - Update event
 * - Delete event
 * - Add exception date to recurring event
 * - Export batch to ICS
 *
 * Per ADR-0007, this file holds no raw `database.execute*` calls. Reads
 * route through `CalendarReader` (L1); writes route through the calendar
 * commands (L4). Handlers are thin adapters: shape IPC args, delegate, and
 * keep the existing recurrence-expansion / ICS-generation / file IO here.
 */

import { ipcMain, dialog } from 'electron';
import path from 'path';
import type { IpcContext } from '../IpcContext';
import { RRuleExpander } from '../../../layers/l2-daemon';
import type { CalendarEventRecord } from '../../../layers/l2-daemon/calendar/RRuleExpander';
import { CalendarReader } from '../../../layers/l1-persistence';
import {
  CreateCalendarEventCommand,
  UpdateCalendarEventCommand,
  DeleteCalendarEventCommand,
  AddCalendarEventExceptionCommand,
} from '../../../layers/l4-controller/commands/calendar';
import type {
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from '../../../layers/l4-controller/commands/calendar';

/**
 * Register calendar event IPC handlers
 */
export function registerCalendarEventHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

  const calendarReader = new CalendarReader(database);
  const createEventCommand = new CreateCalendarEventCommand(database, logger);
  const updateEventCommand = new UpdateCalendarEventCommand(database, logger);
  const deleteEventCommand = new DeleteCalendarEventCommand(database, logger);
  const addExceptionCommand = new AddCalendarEventExceptionCommand(database, logger);

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
        timezone?: string; // IANA timezone for DST-aware recurrence expansion
      }
    ) => {
      const startDate = new Date(params.startDate);
      const endDate = new Date(params.endDate);
      const timezone = params.timezone; // e.g., "America/Toronto"

      const rows = calendarReader.getEventsForRange({
        calendarIds: params.calendarIds,
        includeHidden: params.includeHidden,
      });

      const events: Array<{
        id: number;
        externalId: string | null;
        sourceType: string;
        courseId: number | null;
        importedCalendarId: number | null;
        taskId: number | null;
        title: string;
        description: string | null;
        startAt: string;
        endAt: string;
        allDay: boolean;
        location: string | null;
        uid: string | null;
        recurrenceRule: string | null;
        recurrenceExceptionDates: string | null;
        parentEventId: number | null;
        eventColor: string | null;
        notes: string | null;
        reminderMinutes: number | null;
        isRecurrenceInstance: boolean;
        recurrenceDate?: string;
        originalEventId?: number;
        color: string;
        calendarName: string | null;
        // Task-related fields
        taskTitle?: string;
        taskWeight?: number;
        taskType?: string;
        taskLocation?: string;
        courseCode?: string;
        courseName?: string;
      }> = [];

      const expander = new RRuleExpander();

      for (const row of rows) {
        // Convert row to CalendarEventRecord for RRuleExpander
        const eventRecord: CalendarEventRecord = {
          id: row.id,
          externalId: row.external_id,
          sourceType: row.source_type as 'canvas' | 'user' | 'imported',
          courseId: row.course_id,
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
          parentEventId: row.parent_event_id,
          calendarName: row.calendar_name,
          color: row.color || row.calendar_color || undefined,
        };

        // Get task_id, notes, reminder, and task details from the row for inclusion in the result
        const taskId = row.task_id;
        const eventColor = row.color;
        const notes = row.notes;
        const reminderMinutes = row.reminder_minutes;
        const taskTitle = row.task_title;
        const taskWeight = row.task_weight;
        const taskType = row.task_type;
        const taskLocation = row.task_location;
        const courseCode = row.course_code;
        const courseName = row.course_name;

        // Use RRuleExpander to handle both recurring and non-recurring events
        // Pass timezone for DST-aware expansion of recurring events
        const expandedEvents = expander.expand(eventRecord, startDate, endDate, timezone);

        for (const expanded of expandedEvents) {
          events.push({
            id: expanded.id,
            externalId: expanded.externalId,
            sourceType: expanded.sourceType,
            courseId: expanded.courseId,
            importedCalendarId: expanded.importedCalendarId,
            taskId: taskId,
            title: expanded.title,
            description: expanded.description,
            startAt: expanded.startAt,
            endAt: expanded.endAt || expanded.startAt,
            allDay: expanded.allDay,
            location: expanded.location,
            uid: expanded.uid,
            recurrenceRule: expanded.recurrenceRule,
            recurrenceExceptionDates: expanded.recurrenceExceptionDates,
            parentEventId: expanded.parentEventId,
            eventColor: eventColor,
            notes: notes,
            reminderMinutes: reminderMinutes,
            isRecurrenceInstance: expanded.isRecurrenceInstance,
            recurrenceDate: expanded.recurrenceDate,
            originalEventId: expanded.originalEventId,
            color: expanded.color || row.calendar_color || '#6366F1',
            calendarName: expanded.calendarName ?? null,
            // Task-related fields (populated when event is linked to a task)
            taskTitle: taskTitle ?? undefined,
            taskWeight: taskWeight ?? undefined,
            taskType: taskType ?? undefined,
            taskLocation: taskLocation ?? undefined,
            courseCode: courseCode ?? undefined,
            courseName: courseName ?? undefined,
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
  ipcMain.handle('calendar:createEvent', (_event, params: CreateCalendarEventInput) => {
    return createEventCommand.execute(params);
  });

  // Update custom event
  ipcMain.handle(
    'calendar:updateEvent',
    (_event, id: number, updates: UpdateCalendarEventInput) => {
      return updateEventCommand.execute(id, updates);
    }
  );

  // Delete custom or user event
  ipcMain.handle('calendar:deleteEvent', async (_event, id: number) => {
    return deleteEventCommand.execute(id);
  });

  // Add exception date to recurring event (skip one occurrence)
  ipcMain.handle(
    'calendar:addEventException',
    (_event, eventId: number, exceptionDate: string) => {
      return addExceptionCommand.execute(eventId, exceptionDate);
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

        const events = calendarReader.getExportEvents({
          calendarIds: params.calendarIds,
          includeCustom: params.includeCustom,
        });

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
            `DTSTAMP:${new Date()
              .toISOString()
              .replace(/[-:]/g, '')
              .replace(/\.\d{3}/, '')}`
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
              `DTSTART:${new Date(event.start_at)
                .toISOString()
                .replace(/[-:]/g, '')
                .replace(/\.\d{3}/, '')}`
            );
            lines.push(
              `DTEND:${new Date(event.end_at)
                .toISOString()
                .replace(/[-:]/g, '')
                .replace(/\.\d{3}/, '')}`
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
