/**
 * Database Repair Utilities
 *
 * Handles post-import repairs and data integrity checks.
 * Run after database initialization to ensure consistency.
 */

import type { Database } from './Database';
import type { Logger } from '../l0-utilities/Logger';

export interface RepairResult {
  calendarEventsCreated: number;
  calendarEventsLinked: number;
  orphanedEventsRemoved: number;
  errors: string[];
}

/**
 * Create missing calendar events for tasks that have due dates but no linked event.
 * This repairs data after importing a backup that may not have calendar events.
 */
export function repairMissingCalendarEvents(
  database: Database,
  logger: Logger
): RepairResult {
  const result: RepairResult = {
    calendarEventsCreated: 0,
    calendarEventsLinked: 0,
    orphanedEventsRemoved: 0,
    errors: [],
  };

  try {
    // Find tasks with due dates that don't have calendar events
    const tasksWithoutEvents = database.executeRead<{
      id: number;
      course_id: number;
      title: string;
      description: string | null;
      due_at: string;
    }>(
      `SELECT t.id, t.course_id, t.title, t.description, t.due_at
       FROM tasks t
       LEFT JOIN calendar_events ce ON ce.task_id = t.id
       WHERE t.due_at IS NOT NULL
         AND t.deleted_at IS NULL
         AND ce.id IS NULL`
    );

    if (tasksWithoutEvents.length === 0) {
      logger.info('[DatabaseRepair] No tasks missing calendar events');
      return result;
    }

    logger.info(
      `[DatabaseRepair] Found ${tasksWithoutEvents.length} tasks without calendar events`
    );

    database.transaction(() => {
      for (const task of tasksWithoutEvents) {
        try {
          // Use epoch (1970-01-01) for start time to indicate "deadline only"
          const epochStart = '1970-01-01T00:00:00.000Z';
          const uid = `task-${task.id}-${Date.now()}`;

          const insertResult = database.executeWrite(
            `INSERT INTO calendar_events (
               source_type, course_id, task_id, title, description,
               start_at, end_at, all_day, uid, created_at, updated_at
             ) VALUES ('user', ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              task.course_id,
              task.id,
              task.title,
              task.description,
              epochStart,
              task.due_at,
              uid,
            ],
            'calendar_events'
          );

          const eventId = insertResult.lastInsertRowid as number;

          // Link task to the new calendar event
          database.executeWrite(
            'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
            [eventId, task.id],
            'tasks'
          );

          result.calendarEventsCreated++;
        } catch (error) {
          const msg = `Failed to create calendar event for task ${task.id}: ${error}`;
          result.errors.push(msg);
          logger.warn(`[DatabaseRepair] ${msg}`);
        }
      }
    });

    // Also link any existing orphaned calendar events to their tasks
    const orphanedEvents = database.executeRead<{
      event_id: number;
      task_id: number;
    }>(
      `SELECT ce.id as event_id, ce.task_id
       FROM calendar_events ce
       JOIN tasks t ON ce.task_id = t.id
       WHERE t.calendar_event_id IS NULL
         AND ce.task_id IS NOT NULL`
    );

    if (orphanedEvents.length > 0) {
      database.transaction(() => {
        for (const { event_id, task_id } of orphanedEvents) {
          database.executeWrite(
            'UPDATE tasks SET calendar_event_id = ? WHERE id = ?',
            [event_id, task_id],
            'tasks'
          );
          result.calendarEventsLinked++;
        }
      });
    }

    logger.info(
      `[DatabaseRepair] Created ${result.calendarEventsCreated} calendar events, linked ${result.calendarEventsLinked}`
    );
  } catch (error) {
    const msg = `Calendar event repair failed: ${error}`;
    result.errors.push(msg);
    logger.error(`[DatabaseRepair] ${msg}`);
  }

  return result;
}

/**
 * Verify imported calendars have their events intact.
 * Returns count of calendars and any issues found.
 */
export function verifyImportedCalendars(
  database: Database,
  logger: Logger
): { calendars: number; events: number; issues: string[] } {
  const issues: string[] = [];

  try {
    // Count imported calendars
    const calendarCount = database.executeReadOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM imported_calendars'
    );

    // Count events linked to imported calendars
    const eventCount = database.executeReadOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM calendar_events WHERE imported_calendar_id IS NOT NULL'
    );

    // Find calendars with mismatched event counts
    const mismatched = database.executeRead<{
      id: number;
      name: string;
      stored_count: number;
      actual_count: number;
    }>(
      `SELECT ic.id, ic.name, ic.event_count as stored_count,
              COUNT(ce.id) as actual_count
       FROM imported_calendars ic
       LEFT JOIN calendar_events ce ON ce.imported_calendar_id = ic.id
       GROUP BY ic.id
       HAVING stored_count != actual_count`
    );

    // Fix mismatched counts
    if (mismatched.length > 0) {
      database.transaction(() => {
        for (const cal of mismatched) {
          database.executeWrite(
            'UPDATE imported_calendars SET event_count = ? WHERE id = ?',
            [cal.actual_count, cal.id],
            'imported_calendars'
          );
          issues.push(
            `Fixed event count for "${cal.name}": ${cal.stored_count} -> ${cal.actual_count}`
          );
        }
      });
    }

    // Find calendars with zero events (might indicate import issue)
    const emptyCalendars = database.executeRead<{ id: number; name: string }>(
      `SELECT ic.id, ic.name
       FROM imported_calendars ic
       LEFT JOIN calendar_events ce ON ce.imported_calendar_id = ic.id
       WHERE ce.id IS NULL`
    );

    for (const cal of emptyCalendars) {
      issues.push(`Calendar "${cal.name}" has no events (may need re-import)`);
    }

    logger.info(
      `[DatabaseRepair] Verified ${calendarCount?.count || 0} imported calendars with ${eventCount?.count || 0} events`
    );
    if (issues.length > 0) {
      logger.info(`[DatabaseRepair] Issues found: ${issues.join('; ')}`);
    }

    return {
      calendars: calendarCount?.count || 0,
      events: eventCount?.count || 0,
      issues,
    };
  } catch (error) {
    const msg = `Imported calendar verification failed: ${error}`;
    issues.push(msg);
    logger.error(`[DatabaseRepair] ${msg}`);
    return { calendars: 0, events: 0, issues };
  }
}

/**
 * Run all repair checks after database initialization.
 * Safe to run on every startup - only repairs if needed.
 */
export function runPostImportRepairs(
  database: Database,
  logger: Logger
): {
  calendarRepair: RepairResult;
  calendarVerification: ReturnType<typeof verifyImportedCalendars>;
} {
  logger.info('[DatabaseRepair] Running post-import repairs...');

  const calendarRepair = repairMissingCalendarEvents(database, logger);
  const calendarVerification = verifyImportedCalendars(database, logger);

  logger.info('[DatabaseRepair] Post-import repairs completed');

  return { calendarRepair, calendarVerification };
}
