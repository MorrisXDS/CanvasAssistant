/**
 * CalendarReader tests (ADR-0007 — calendarEventHandlers migration).
 *
 * Uses the real migration schema so the join columns (imported_calendars,
 * tasks, courses) match production exactly.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CalendarReader } from '../../../src/layers/l1-persistence/readers/CalendarReader';

describe('CalendarReader', () => {
  let db: Database;
  let reader: CalendarReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    seedCourse(db, 1, 'CS101');
    reader = new CalendarReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getEventsForRange', () => {
    test('returns user events and visible imported-calendar events; hides invisible calendars', () => {
      const visibleCal = seedImportedCalendar(db, 'Visible', 1);
      const hiddenCal = seedImportedCalendar(db, 'Hidden', 0);
      seedEvent(db, { title: 'UserEvent', sourceType: 'user' });
      seedEvent(db, {
        title: 'VisibleImported',
        sourceType: 'imported',
        importedCalendarId: visibleCal,
      });
      seedEvent(db, {
        title: 'HiddenImported',
        sourceType: 'imported',
        importedCalendarId: hiddenCal,
      });

      const titles = reader
        .getEventsForRange({})
        .map((r) => r.title)
        .sort();
      expect(titles).toEqual(['UserEvent', 'VisibleImported']);
    });

    test('includeHidden returns events from hidden calendars too', () => {
      const hiddenCal = seedImportedCalendar(db, 'Hidden', 0);
      seedEvent(db, {
        title: 'HiddenImported',
        sourceType: 'imported',
        importedCalendarId: hiddenCal,
      });

      expect(
        reader.getEventsForRange({ includeHidden: true }).map((r) => r.title)
      ).toEqual(['HiddenImported']);
      expect(reader.getEventsForRange({}).map((r) => r.title)).toEqual([]);
    });

    test('calendarIds narrows to specific imported calendars but keeps user/canvas events', () => {
      const calA = seedImportedCalendar(db, 'A', 1);
      const calB = seedImportedCalendar(db, 'B', 1);
      seedEvent(db, { title: 'FromA', sourceType: 'imported', importedCalendarId: calA });
      seedEvent(db, { title: 'FromB', sourceType: 'imported', importedCalendarId: calB });
      seedEvent(db, { title: 'UserEvent', sourceType: 'user' });

      const titles = reader
        .getEventsForRange({ calendarIds: [calA] })
        .map((r) => r.title)
        .sort();
      expect(titles).toEqual(['FromA', 'UserEvent']);
    });

    test('joins course code/name and task fields', () => {
      const taskId = seedTask(db, { courseId: 1, title: 'TaskTitle' });
      seedEvent(db, {
        title: 'Linked',
        sourceType: 'user',
        courseId: 1,
        taskId,
      });

      const row = reader.getEventsForRange({})[0];
      expect(row.course_code).toBe('CS101');
      expect(row.task_title).toBe('TaskTitle');
      expect(row.task_id).toBe(taskId);
    });
  });

  describe('getExportEvents', () => {
    test('returns all events when no filter', () => {
      seedEvent(db, { title: 'E1', sourceType: 'user' });
      seedEvent(db, { title: 'E2', sourceType: 'canvas' });
      expect(
        reader
          .getExportEvents({})
          .map((r) => r.title)
          .sort()
      ).toEqual(['E1', 'E2']);
    });

    test('calendarIds filter restricts to those imported calendars', () => {
      const calA = seedImportedCalendar(db, 'A', 1);
      const calB = seedImportedCalendar(db, 'B', 1);
      seedEvent(db, { title: 'FromA', sourceType: 'imported', importedCalendarId: calA });
      seedEvent(db, { title: 'FromB', sourceType: 'imported', importedCalendarId: calB });

      expect(reader.getExportEvents({ calendarIds: [calA] }).map((r) => r.title)).toEqual(
        ['FromA']
      );
    });

    test('includeCustom OR-s in user events alongside calendarIds', () => {
      const calA = seedImportedCalendar(db, 'A', 1);
      seedEvent(db, { title: 'FromA', sourceType: 'imported', importedCalendarId: calA });
      seedEvent(db, { title: 'UserEvent', sourceType: 'user' });

      const titles = reader
        .getExportEvents({ calendarIds: [calA], includeCustom: true })
        .map((r) => r.title)
        .sort();
      expect(titles).toEqual(['FromA', 'UserEvent']);
    });
  });
});

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

function seedImportedCalendar(db: Database, name: string, isVisible: number): number {
  const result = db.executeWrite(
    `INSERT INTO imported_calendars (name, filename, color, is_visible)
     VALUES (?, ?, ?, ?)`,
    [name, `${name}.ics`, '#6366F1', isVisible],
    'imported_calendars'
  );
  return result.lastInsertRowid as number;
}

function seedTask(db: Database, data: { courseId: number; title: string }): number {
  const result = db.executeWrite(
    `INSERT INTO tasks (external_id, course_id, title, source_type)
     VALUES (?, ?, ?, 'user')`,
    [`task_ext_${data.title}`, data.courseId, data.title],
    'tasks'
  );
  return result.lastInsertRowid as number;
}

function seedEvent(
  db: Database,
  data: {
    title: string;
    sourceType: 'user' | 'canvas' | 'imported';
    courseId?: number | null;
    importedCalendarId?: number | null;
    taskId?: number | null;
    startAt?: string;
    endAt?: string;
  }
): void {
  db.executeWrite(
    `INSERT INTO calendar_events
       (source_type, course_id, imported_calendar_id, task_id, title, start_at, end_at, all_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      data.sourceType,
      data.courseId ?? null,
      data.importedCalendarId ?? null,
      data.taskId ?? null,
      data.title,
      data.startAt ?? '2026-01-10T10:00:00.000Z',
      data.endAt ?? '2026-01-10T11:00:00.000Z',
    ],
    'calendar_events'
  );
}
