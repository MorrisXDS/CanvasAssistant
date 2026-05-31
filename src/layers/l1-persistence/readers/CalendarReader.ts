/**
 * CalendarReader — the SQL read surface for `calendar_events` used by the
 * calendar event IPC handlers.
 *
 * Per ADR-0007, IPC handlers MUST route reads through this reader rather
 * than calling `database.execute*` directly. Writes go through the L4
 * calendar commands (Create/Update/Delete/AddException).
 *
 * Stateless. Returns raw DB rows (snake_case); the handler shapes them
 * into DTOs (and runs `RRuleExpander` / ICS generation). Visibility here
 * is calendar-level (`imported_calendars.is_visible` + `source_type`), NOT
 * the course-level VisibleDataProvider filter — this preserves the exact
 * pre-ADR behaviour of these two queries, which never filtered by visible
 * course ids.
 */

import type { Database } from '../Database';

/** Row shape for the date-range query (calendar_events + joined task/course/calendar fields). */
export interface CalendarEventRangeRow {
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
}

/** Row shape for the ICS export query. */
export interface CalendarEventExportRow {
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: number;
  location: string | null;
  uid: string | null;
  recurrence_rule: string | null;
  calendar_name: string | null;
}

export interface GetEventsForRangeOptions {
  calendarIds?: number[];
  includeHidden?: boolean;
}

export interface GetExportEventsOptions {
  calendarIds?: number[];
  includeCustom?: boolean;
}

export class CalendarReader {
  constructor(private readonly db: Database) {}

  /**
   * Raw events (with calendar/task/course join fields) for the calendar
   * view. Filters by calendar visibility unless `includeHidden`, and
   * optionally narrows to specific imported calendars while always keeping
   * user/canvas events. The caller runs recurrence expansion + sorting.
   */
  getEventsForRange(options: GetEventsForRangeOptions): CalendarEventRangeRow[] {
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
    if (!options.includeHidden) {
      sql +=
        " AND (ic.is_visible = 1 OR ce.source_type = 'user' OR ce.source_type = 'canvas')";
    }

    // Filter by specific calendars
    if (options.calendarIds && options.calendarIds.length > 0) {
      const placeholders = options.calendarIds.map(() => '?').join(',');
      sql += ` AND (ce.imported_calendar_id IN (${placeholders}) OR ce.source_type = 'user' OR ce.source_type = 'canvas')`;
      sqlParams.push(...options.calendarIds);
    }

    return this.db.executeRead<CalendarEventRangeRow>(sql, sqlParams);
  }

  /**
   * Raw events for ICS export. Optionally narrows to specific imported
   * calendars, optionally OR-ing in user events. The caller generates the
   * ICS text and writes the file.
   */
  getExportEvents(options: GetExportEventsOptions): CalendarEventExportRow[] {
    let sql = `
      SELECT ce.*, ic.name as calendar_name
      FROM calendar_events ce
      LEFT JOIN imported_calendars ic ON ce.imported_calendar_id = ic.id
      WHERE 1=1
    `;
    const sqlParams: number[] = [];

    if (options.calendarIds && options.calendarIds.length > 0) {
      const placeholders = options.calendarIds.map(() => '?').join(',');
      sql += ` AND ce.imported_calendar_id IN (${placeholders})`;
      sqlParams.push(...options.calendarIds);
    }

    if (options.includeCustom) {
      sql += " OR ce.source_type = 'user'";
    }

    return this.db.executeRead<CalendarEventExportRow>(sql, sqlParams);
  }
}
