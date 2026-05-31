/**
 * ImportedCalendarCommands tests (ADR-0007 — calendarCrudHandlers migration).
 *
 * - ImportICSCalendarCommand (parse + dup-detect + course-match + insert)
 * - ReimportICSCalendarCommand (replace events in place)
 * - DeleteImportedCalendarCommand
 * - UpdateImportedCalendarCommand
 * - ToggleImportedCalendarVisibilityCommand
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { createNoopLogger } from '../../../src/layers/l0-utilities/Logger';
import type { Logger } from '../../../src/layers/l0-utilities/Logger';
import {
  ImportICSCalendarCommand,
  ReimportICSCalendarCommand,
  DeleteImportedCalendarCommand,
  UpdateImportedCalendarCommand,
  ToggleImportedCalendarVisibilityCommand,
} from '../../../src/layers/l4-controller/commands/calendar';

const logger = createNoopLogger() as unknown as Logger;

/** Build a minimal valid ICS string from a list of events. */
function makeICS(events: Array<{ uid: string; summary: string }>): string {
  const body = events
    .map(
      (e) => `BEGIN:VEVENT
UID:${e.uid}
DTSTART:20260115T100000Z
DTEND:20260115T110000Z
SUMMARY:${e.summary}
END:VEVENT`
    )
    .join('\n');
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
${body}
END:VCALENDAR`;
}

function countEvents(db: Database, calendarId: number): number {
  return (
    db.executeReadOne<{ n: number }>(
      'SELECT COUNT(*) as n FROM calendar_events WHERE imported_calendar_id = ?',
      [calendarId]
    )?.n ?? 0
  );
}

function getCalendar(db: Database, id: number): Record<string, unknown> | undefined {
  return db.executeReadOne<Record<string, unknown>>(
    'SELECT * FROM imported_calendars WHERE id = ?',
    [id]
  );
}

describe('Imported Calendar Commands', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => {
    db.close();
  });

  describe('ImportICSCalendarCommand', () => {
    test('imports a new calendar with its events and auto-matches a course', () => {
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name) VALUES ('e1', 'ECE568H1', 'Security')`,
        [],
        'courses'
      );

      const result = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([
          { uid: 'u1', summary: 'ECE568H1 Lecture' },
          { uid: 'u2', summary: 'Dentist appointment' },
        ]),
        filename: 'term.ics',
        name: 'My Term',
        color: '#ff0000',
      });

      expect(result.success).toBe(true);
      const calId = result.calendar!.id;
      expect(result.calendar!.eventCount).toBe(2);
      expect(countEvents(db, calId)).toBe(2);

      const matched = db.executeReadOne<{ course_id: number | null }>(
        'SELECT course_id FROM calendar_events WHERE uid = ?',
        ['u1']
      );
      const unmatched = db.executeReadOne<{ course_id: number | null }>(
        'SELECT course_id FROM calendar_events WHERE uid = ?',
        ['u2']
      );
      expect(matched?.course_id).not.toBeNull();
      expect(unmatched?.course_id).toBeNull();

      const cal = getCalendar(db, calId)!;
      expect(cal.name).toBe('My Term');
      expect(cal.color).toBe('#ff0000');
      expect(cal.event_count).toBe(2);
    });

    test('detects a duplicate by content hash and does not re-insert', () => {
      const content = makeICS([{ uid: 'u1', summary: 'Event' }]);
      const cmd = new ImportICSCalendarCommand(db, logger);
      const first = cmd.execute({ content, filename: 'a.ics', name: 'First' });
      expect(first.success).toBe(true);

      const second = cmd.execute({ content, filename: 'b.ics', name: 'Second' });
      expect(second.success).toBe(false);
      expect(second.error).toBe('duplicate');
      expect(second.existingCalendar?.name).toBe('First');

      // Only one calendar exists
      const n = db.executeReadOne<{ n: number }>(
        'SELECT COUNT(*) as n FROM imported_calendars'
      );
      expect(n?.n).toBe(1);
    });

    test('derives a non-empty name and defaults the color when none given', () => {
      const result = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([{ uid: 'u1', summary: 'E' }]),
        filename: 'schedule.ics',
      });
      expect(result.success).toBe(true);
      // No params.name → name comes from the parser's calendarName or the
      // filename fallback; either way it must be a non-empty string.
      expect(typeof result.calendar!.name).toBe('string');
      expect(result.calendar!.name.length).toBeGreaterThan(0);
      expect(result.calendar!.color).toBe('#6366F1'); // default color
    });

    test('returns failure on a DB error', () => {
      db.close();
      const result = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([{ uid: 'u1', summary: 'E' }]),
        filename: 'a.ics',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ReimportICSCalendarCommand', () => {
    test('replaces the existing events and refreshes count', () => {
      const imp = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([
          { uid: 'u1', summary: 'Old1' },
          { uid: 'u2', summary: 'Old2' },
        ]),
        filename: 'a.ics',
      });
      const calId = imp.calendar!.id;
      expect(countEvents(db, calId)).toBe(2);

      const result = new ReimportICSCalendarCommand(db, logger).execute(
        calId,
        makeICS([{ uid: 'u3', summary: 'New1' }])
      );
      expect(result.success).toBe(true);
      expect(result.eventCount).toBe(1);
      expect(countEvents(db, calId)).toBe(1);

      const remaining = db.executeReadOne<{ uid: string }>(
        'SELECT uid FROM calendar_events WHERE imported_calendar_id = ?',
        [calId]
      );
      expect(remaining?.uid).toBe('u3');
      expect(getCalendar(db, calId)!.event_count).toBe(1);
    });
  });

  describe('DeleteImportedCalendarCommand', () => {
    test('deletes the calendar and its events', () => {
      const imp = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([{ uid: 'u1', summary: 'E' }]),
        filename: 'a.ics',
      });
      const calId = imp.calendar!.id;

      expect(new DeleteImportedCalendarCommand(db, logger).execute(calId)).toEqual({
        success: true,
      });
      expect(getCalendar(db, calId)).toBeUndefined();
      expect(countEvents(db, calId)).toBe(0);
    });
  });

  describe('UpdateImportedCalendarCommand', () => {
    test('updates only provided fields', () => {
      const imp = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([{ uid: 'u1', summary: 'E' }]),
        filename: 'a.ics',
        name: 'Before',
      });
      const calId = imp.calendar!.id;

      const result = new UpdateImportedCalendarCommand(db, logger).execute(calId, {
        name: 'After',
        isVisible: false,
      });
      expect(result).toEqual({ success: true });

      const cal = getCalendar(db, calId)!;
      expect(cal.name).toBe('After');
      expect(cal.is_visible).toBe(0);
      expect(cal.color).toBe('#6366F1'); // untouched
    });

    test('no-ops cleanly when no fields are provided', () => {
      const imp = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([{ uid: 'u1', summary: 'E' }]),
        filename: 'a.ics',
        name: 'Same',
      });
      const calId = imp.calendar!.id;
      expect(new UpdateImportedCalendarCommand(db, logger).execute(calId, {})).toEqual({
        success: true,
      });
      expect(getCalendar(db, calId)!.name).toBe('Same');
    });
  });

  describe('ToggleImportedCalendarVisibilityCommand', () => {
    test('sets is_visible to the given value', () => {
      const imp = new ImportICSCalendarCommand(db, logger).execute({
        content: makeICS([{ uid: 'u1', summary: 'E' }]),
        filename: 'a.ics',
      });
      const calId = imp.calendar!.id;

      expect(
        new ToggleImportedCalendarVisibilityCommand(db, logger).execute(calId, false)
      ).toEqual({ success: true });
      expect(getCalendar(db, calId)!.is_visible).toBe(0);

      new ToggleImportedCalendarVisibilityCommand(db, logger).execute(calId, true);
      expect(getCalendar(db, calId)!.is_visible).toBe(1);
    });
  });
});
