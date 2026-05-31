/**
 * CalendarCommands tests (ADR-0007 — calendarEventHandlers migration).
 *
 * - CreateCalendarEventCommand
 * - UpdateCalendarEventCommand (incl. task cascade-sync)
 * - DeleteCalendarEventCommand
 * - AddCalendarEventExceptionCommand
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { createNoopLogger } from '../../../src/layers/l0-utilities/Logger';
import type { Logger } from '../../../src/layers/l0-utilities/Logger';
import {
  CreateCalendarEventCommand,
  UpdateCalendarEventCommand,
  DeleteCalendarEventCommand,
  AddCalendarEventExceptionCommand,
} from '../../../src/layers/l4-controller/commands/calendar';

const logger = createNoopLogger() as unknown as Logger;

function seedCourse(db: Database, id: number): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, target_grade) VALUES (?, ?, ?, ?, 85)`,
    [id, `ext_${id}`, `C${id}`, `Course ${id}`]
  );
}

function seedUserTask(db: Database, id: number, courseId: number): void {
  db.executeWrite(
    `INSERT INTO tasks (id, external_id, course_id, title, source_type)
     VALUES (?, ?, ?, 'Task', 'user')`,
    [id, `task_ext_${id}`, courseId],
    'tasks'
  );
}

function getEvent(db: Database, id: number): Record<string, unknown> | undefined {
  return db.executeReadOne<Record<string, unknown>>(
    'SELECT * FROM calendar_events WHERE id = ?',
    [id]
  );
}

function getTask(db: Database, id: number): Record<string, unknown> | undefined {
  return db.executeReadOne<Record<string, unknown>>('SELECT * FROM tasks WHERE id = ?', [
    id,
  ]);
}

describe('Calendar Commands', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    seedCourse(db, 1);
  });

  afterEach(() => {
    db.close();
  });

  describe('CreateCalendarEventCommand', () => {
    test('inserts a user event with basic + optional columns', () => {
      const result = new CreateCalendarEventCommand(db, logger).execute({
        title: 'Study',
        startAt: '2026-01-10T10:00:00.000Z',
        endAt: '2026-01-10T11:00:00.000Z',
        allDay: true,
        location: 'Library',
        courseId: 1,
        color: '#ff0000',
        notes: 'bring laptop',
        reminderMinutes: 30,
        recurrenceRule: 'FREQ=WEEKLY',
      });

      expect(result.success).toBe(true);
      const id = result.data!.id;
      const row = getEvent(db, id)!;
      expect(row.source_type).toBe('user');
      expect(row.title).toBe('Study');
      expect(row.all_day).toBe(1);
      expect(row.color).toBe('#ff0000');
      expect(row.notes).toBe('bring laptop');
      expect(row.reminder_minutes).toBe(30);
    });

    test('inserts with only required fields (no optional update)', () => {
      const result = new CreateCalendarEventCommand(db, logger).execute({
        title: 'Minimal',
        startAt: '2026-01-10T10:00:00.000Z',
      });
      expect(result.success).toBe(true);
      const row = getEvent(db, result.data!.id)!;
      expect(row.title).toBe('Minimal');
      expect(row.color).toBeNull();
    });

    test('returns failure when the write throws', () => {
      db.close();
      const result = new CreateCalendarEventCommand(db, logger).execute({
        title: 'X',
        startAt: '2026-01-10T10:00:00.000Z',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('UpdateCalendarEventCommand', () => {
    function insertUserEvent(taskId?: number): number {
      const r = db.executeWrite(
        `INSERT INTO calendar_events (source_type, course_id, task_id, title, start_at)
         VALUES ('user', 1, ?, 'Orig', '2026-01-10T10:00:00.000Z')`,
        [taskId ?? null],
        'calendar_events'
      );
      return r.lastInsertRowid as number;
    }

    test('updates only provided fields', () => {
      const id = insertUserEvent();
      const result = new UpdateCalendarEventCommand(db, logger).execute(id, {
        title: 'New',
        allDay: true,
      });
      expect(result.success).toBe(true);
      const row = getEvent(db, id)!;
      expect(row.title).toBe('New');
      expect(row.all_day).toBe(1);
      expect(row.start_at).toBe('2026-01-10T10:00:00.000Z'); // untouched
    });

    test('returns "Event not found" for a missing id', () => {
      expect(
        new UpdateCalendarEventCommand(db, logger).execute(999, { title: 'x' })
      ).toEqual({
        success: false,
        error: 'Event not found',
      });
    });

    test('cascade-syncs fields to a linked task', () => {
      seedUserTask(db, 50, 1);
      const id = insertUserEvent(50);

      const result = new UpdateCalendarEventCommand(db, logger).execute(id, {
        title: 'Synced',
        description: 'desc',
        startAt: '2026-02-01T09:00:00.000Z',
        endAt: '2026-02-01T10:00:00.000Z',
        courseId: 1,
        taskType: 'exam',
        location: 'Room 5',
        weight: 25,
      });
      expect(result.success).toBe(true);

      const task = getTask(db, 50)!;
      expect(task.title).toBe('Synced');
      expect(task.description).toBe('desc');
      expect(task.unlock_at).toBe('2026-02-01T09:00:00.000Z'); // startAt -> unlock_at
      expect(task.due_at).toBe('2026-02-01T10:00:00.000Z'); // endAt -> due_at
      expect(task.task_type).toBe('exam');
      expect(task.location).toBe('Room 5');
      expect(task.weight).toBe(25);
    });

    test('does not touch tasks when event has no task_id', () => {
      seedUserTask(db, 51, 1);
      const id = insertUserEvent(); // no task link
      new UpdateCalendarEventCommand(db, logger).execute(id, { title: 'X' });
      const task = getTask(db, 51)!;
      expect(task.title).toBe('Task'); // unchanged
    });
  });

  describe('DeleteCalendarEventCommand', () => {
    test('deletes a standalone user event', () => {
      const r = db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at)
         VALUES ('user', 'Gone', '2026-01-10T10:00:00.000Z')`,
        [],
        'calendar_events'
      );
      const id = r.lastInsertRowid as number;
      expect(new DeleteCalendarEventCommand(db, logger).execute(id)).toEqual({
        success: true,
      });
      expect(getEvent(db, id)).toBeUndefined();
    });

    test('refuses to delete a canvas event', () => {
      const r = db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at)
         VALUES ('canvas', 'CanvasEvt', '2026-01-10T10:00:00.000Z')`,
        [],
        'calendar_events'
      );
      const id = r.lastInsertRowid as number;
      expect(new DeleteCalendarEventCommand(db, logger).execute(id)).toEqual({
        success: false,
        error: 'Cannot delete Canvas-synced events directly',
      });
      expect(getEvent(db, id)).not.toBeNull();
    });

    test('deletes the linked user task (cascade removes the event)', () => {
      seedUserTask(db, 60, 1);
      const r = db.executeWrite(
        `INSERT INTO calendar_events (source_type, task_id, title, start_at)
         VALUES ('user', 60, 'Linked', '2026-01-10T10:00:00.000Z')`,
        [],
        'calendar_events'
      );
      const id = r.lastInsertRowid as number;

      expect(new DeleteCalendarEventCommand(db, logger).execute(id)).toEqual({
        success: true,
      });
      expect(getTask(db, 60)).toBeUndefined();
    });

    test('returns "Event not found" for a missing id', () => {
      expect(new DeleteCalendarEventCommand(db, logger).execute(999)).toEqual({
        success: false,
        error: 'Event not found',
      });
    });
  });

  describe('AddCalendarEventExceptionCommand', () => {
    test('appends an exception date to an empty list', () => {
      const r = db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at, recurrence_rule)
         VALUES ('user', 'Rec', '2026-01-10T10:00:00.000Z', 'FREQ=WEEKLY')`,
        [],
        'calendar_events'
      );
      const id = r.lastInsertRowid as number;

      expect(
        new AddCalendarEventExceptionCommand(db, logger).execute(id, '2026-01-17')
      ).toEqual({ success: true });
      expect(getEvent(db, id)!.recurrence_exception_dates).toBe('2026-01-17');
    });

    test('appends to an existing comma-joined list', () => {
      const r = db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at, recurrence_exception_dates)
         VALUES ('user', 'Rec', '2026-01-10T10:00:00.000Z', '2026-01-17')`,
        [],
        'calendar_events'
      );
      const id = r.lastInsertRowid as number;
      new AddCalendarEventExceptionCommand(db, logger).execute(id, '2026-01-24');
      expect(getEvent(db, id)!.recurrence_exception_dates).toBe('2026-01-17,2026-01-24');
    });

    test('returns "Event not found" for a missing id', () => {
      expect(
        new AddCalendarEventExceptionCommand(db, logger).execute(999, '2026-01-17')
      ).toEqual({ success: false, error: 'Event not found' });
    });
  });
});
