/**
 * Calendar Event IPC Handlers
 * Handlers for calendar event operations:
 * - Get events for date range (with recurring event expansion)
 * - Create custom event
 * - Update event
 * - Delete event
 * - Add exception date to recurring event
 * - Export batch to ICS
 */

import { ipcMain, dialog } from 'electron';
import path from 'path';
import type { IpcContext } from '../IpcContext';
import { RRuleExpander } from '../../layers/l2-daemon';
import type { CalendarEventRecord } from '../../layers/l2-daemon/calendar/RRuleExpander';

/**
 * Register calendar event IPC handlers
 */
export function registerCalendarEventHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();

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

      // Build query based on filters
      // Join with tasks and courses to get task details for task-linked events
      let sql = `
      SELECT ce.*,
             ic.name as calendar_name, ic.color as calendar_color, ic.is_visible,
             t.title as task_title, t.weight as task_weight, t.task_type, t.location as task_location,
             c.code as course_code, c.name as course_name
      FROM calendar_events ce
      LEFT JOIN imported_calendars ic ON ce.imported_calendar_id = ic.id
      LEFT JOIN tasks t ON ce.task_id = t.id
      LEFT JOIN courses c ON ce.course_id = c.id
      WHERE 1=1
    `;
      const sqlParams: (string | number)[] = [];

      // Filter by calendar visibility
      // Include: visible imported calendars, user events, and canvas task events
      if (!params.includeHidden) {
        sql +=
          " AND (ic.is_visible = 1 OR ce.source_type = 'user' OR ce.source_type = 'canvas')";
      }

      // Filter by specific calendars
      if (params.calendarIds && params.calendarIds.length > 0) {
        const placeholders = params.calendarIds.map(() => '?').join(',');
        sql += ` AND (ce.imported_calendar_id IN (${placeholders}) OR ce.source_type = 'user' OR ce.source_type = 'canvas')`;
        sqlParams.push(...params.calendarIds);
      }

      const rows = database.executeRead<{
        id: number;
        external_id: string | null;
        imported_calendar_id: number | null;
        source_type: string;
        course_id: number | null;
        task_id: number | null;
        title: string;
        description: string | null;
        start_at: string;
        end_at: string;
        all_day: number;
        location: string | null;
        uid: string | null;
        recurrence_rule: string | null;
        recurrence_exception_dates: string | null;
        parent_event_id: number | null;
        color: string | null;
        notes: string | null;
        reminder_minutes: number | null;
        calendar_name: string | null;
        calendar_color: string | null;
        is_visible: number | null;
        // Task-related fields (from JOIN)
        task_title: string | null;
        task_weight: number | null;
        task_type: string | null;
        task_location: string | null;
        course_code: string | null;
        course_name: string | null;
      }>(sql, sqlParams);

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
  ipcMain.handle(
    'calendar:createEvent',
    (
      _event,
      params: {
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
    ) => {
      try {
        logger.info(
          `Creating calendar event: title="${params.title}", startAt=${params.startAt}`
        );

        // Use basic columns first, then try to add optional columns
        // This handles cases where migration 70 hasn't run yet
        const result = database.executeWrite(
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
              database.executeWrite(
                `UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`,
                updateParams,
                'calendar_events'
              );
            }
          }
        } catch (updateError) {
          // Columns might not exist yet, that's OK
          logger.debug(`Optional columns not available: ${updateError}`);
        }

        logger.info(`Created calendar event with id=${eventId}`);
        return { success: true, data: { id: eventId } };
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
    ) => {
      try {
        logger.debug(
          `calendar:updateEvent called for id=${id}, updates=${JSON.stringify(updates)}`
        );

        // Get event to check if it exists and get task_id for syncing
        const event = database.executeReadOne<{
          source_type: string;
          task_id: number | null;
        }>(`SELECT source_type, task_id FROM calendar_events WHERE id = ?`, [id]);

        if (!event) {
          logger.warn(`calendar:updateEvent - Event not found for id=${id}`);
          return { success: false, error: 'Event not found' };
        }

        logger.debug(
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
          database.executeWrite(
            `UPDATE calendar_events SET ${setClauses.join(', ')} WHERE id = ?`,
            params,
            'calendar_events'
          );
        }

        // If this event is linked to a task, sync relevant fields to the task
        if (event.task_id) {
          if (updates.title !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET title = ? WHERE id = ?',
              [updates.title, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} title`);
          }
          if (updates.description !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET description = ? WHERE id = ?',
              [updates.description || null, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} description`);
          }
          // Sync startAt to task's unlock_at (start date)
          if (updates.startAt !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET unlock_at = ? WHERE id = ?',
              [updates.startAt, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} unlock_at to ${updates.startAt}`);
          }
          if (updates.endAt !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET due_at = ? WHERE id = ?',
              [updates.endAt, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} due_at to ${updates.endAt}`);
          }
          if (updates.courseId !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET course_id = ? WHERE id = ?',
              [updates.courseId, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} course_id to ${updates.courseId}`);
          }
          if (updates.taskType !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET task_type = ? WHERE id = ?',
              [updates.taskType || null, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} task_type to ${updates.taskType}`);
          }
          // Sync location to task
          if (updates.location !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET location = ? WHERE id = ?',
              [updates.location || null, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} location to ${updates.location}`);
          }
          // Sync weight to task
          if (updates.weight !== undefined) {
            database.executeWrite(
              'UPDATE tasks SET weight = ? WHERE id = ?',
              [updates.weight, event.task_id],
              'tasks'
            );
            logger.info(`Updated task ${event.task_id} weight to ${updates.weight}`);
          }
        }

        logger.info(`Successfully updated calendar event id=${id}`);
        return { success: true };
      } catch (error) {
        logger.error(`Failed to update event id=${id}: ${error}`);
        return { success: false, error: String(error) };
      }
    }
  );

  // Delete custom or user event
  ipcMain.handle('calendar:deleteEvent', async (_event, id: number) => {
    try {
      // Check event type - allow deleting user events and events linked to user tasks
      const event = database.executeReadOne<{
        source_type: string;
        task_id: number | null;
        task_source_type: string | null;
      }>(
        `SELECT ce.source_type, ce.task_id, t.source_type as task_source_type
         FROM calendar_events ce
         LEFT JOIN tasks t ON ce.task_id = t.id
         WHERE ce.id = ?`,
        [id]
      );

      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      // Allow deleting if:
      // 1. Event source_type is 'user', OR
      // 2. Event is linked to a user-created task
      const canDelete =
        event.source_type === 'user' ||
        (event.task_id && event.task_source_type === 'user');

      if (!canDelete) {
        return { success: false, error: 'Cannot delete Canvas-synced events directly' };
      }

      // If linked to a user-created task, delete the task too (cascade will delete event)
      if (event.task_id && event.source_type === 'user') {
        database.executeWrite(
          'DELETE FROM tasks WHERE id = ? AND source_type = ?',
          [event.task_id, 'user'],
          'tasks'
        );
        logger.info(`Deleted user task ${event.task_id} and associated calendar event`);
      } else {
        // Delete just the calendar event
        database.executeWrite(
          'DELETE FROM calendar_events WHERE id = ?',
          [id],
          'calendar_events'
        );
      }

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
          sql += " OR ce.source_type = 'user'";
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
