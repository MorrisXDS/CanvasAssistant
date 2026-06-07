/**
 * DueDateReminderManager — schedule + visibility + dedup + show glue.
 *
 * Uses a real in-memory DB (settings read + TaskReader) with a stubbed
 * VisibilityOracle and an injected clock. No Electron — the show seam is a
 * plain spy. Portable (dev=Windows, CI=Linux): no platform/power assumptions.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { DueDateReminderManager } from '../../src/lifecycle/DueDateReminderManager';
import type { VisibilityOracle } from '../../src/layers/l1-persistence';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-06-07T12:00:00.000Z');

describe('DueDateReminderManager', () => {
  let db: Database;
  let showSpy: jest.Mock<boolean, [string, string]>;
  let visibleCourseIds: number[];

  const noopLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => noopLogger,
  };

  const oracle = {
    getVisibleCourseIds: () => visibleCourseIds,
  } as unknown as VisibilityOracle;

  function seedNotificationSettings(value: {
    enabled: boolean;
    dueDateReminders: boolean;
  }): void {
    db.executeWrite(
      "INSERT OR REPLACE INTO user_preferences (key, value) VALUES ('notificationSettings', ?)",
      [JSON.stringify(value)],
      'user_preferences'
    );
  }

  function seedCourse(id: number): void {
    db.executeWrite(
      'INSERT INTO courses (id, external_id, name, code) VALUES (?, ?, ?, ?)',
      [id, `ext-${id}`, `Course ${id}`, `C${id}`],
      'courses'
    );
  }

  function seedTask(opts: {
    id: number;
    courseId: number;
    title?: string;
    dueAt: string | null;
    completed?: boolean;
  }): void {
    db.executeWrite(
      `INSERT INTO tasks (id, course_id, title, due_at, due_time_known, weight, priority_score, is_completed, is_optional)
       VALUES (?, ?, ?, ?, 1, 0, 0, ?, 0)`,
      [
        opts.id,
        opts.courseId,
        opts.title ?? `Task ${opts.id}`,
        opts.dueAt,
        opts.completed ? 1 : 0,
      ],
      'tasks'
    );
  }

  function makeManager(over: Partial<{ scanIntervalMs: number }> = {}) {
    return new DueDateReminderManager({
      database: db,
      logger: noopLogger as never,
      getVisibilityOracle: () => oracle,
      showNotification: (title, body) => showSpy(title, body),
      now: () => NOW,
      ...over,
    });
  }

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    showSpy = jest.fn<boolean, [string, string]>().mockReturnValue(true);
    visibleCourseIds = [10];
    seedCourse(10);
  });

  afterEach(() => {
    db.close();
  });

  test('no-op when notifications disabled', () => {
    seedNotificationSettings({ enabled: false, dueDateReminders: true });
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });

    const shown = makeManager().scan();

    expect(shown).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
  });

  test('no-op when dueDateReminders is off (but notifications enabled)', () => {
    seedNotificationSettings({ enabled: true, dueDateReminders: false });
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });

    expect(makeManager().scan()).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
  });

  test('no settings row → no-op', () => {
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });
    expect(makeManager().scan()).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
  });

  test('fires for a visible-course task due within 24h', () => {
    seedNotificationSettings({ enabled: true, dueDateReminders: true });
    seedTask({
      id: 1,
      courseId: 10,
      title: 'Problem Set 3',
      dueAt: new Date(NOW + 2 * HOUR).toISOString(),
    });

    const shown = makeManager().scan();

    expect(shown).toHaveLength(1);
    expect(showSpy).toHaveBeenCalledTimes(1);
    const [, body] = showSpy.mock.calls[0];
    expect(body).toContain('Problem Set 3');
  });

  test('excludes tasks in hidden/archived courses (visibility filter)', () => {
    seedNotificationSettings({ enabled: true, dueDateReminders: true });
    seedCourse(20);
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });
    seedTask({ id: 2, courseId: 20, dueAt: new Date(NOW + 2 * HOUR).toISOString() });
    // Only course 10 is visible.
    visibleCourseIds = [10];

    const shown = makeManager().scan();

    expect(shown.map((c) => c.taskId)).toEqual([1]);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  test('empty visible set → zero reminders, never all tasks', () => {
    seedNotificationSettings({ enabled: true, dueDateReminders: true });
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });
    visibleCourseIds = [];

    expect(makeManager().scan()).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
  });

  test('dedups across repeated scans (same task + due date)', () => {
    seedNotificationSettings({ enabled: true, dueDateReminders: true });
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });

    const manager = makeManager();
    expect(manager.scan()).toHaveLength(1);
    // Second scan: same task, same due date → already notified.
    expect(manager.scan()).toHaveLength(0);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  test('dedups even when the show seam suppressed the notification', () => {
    seedNotificationSettings({ enabled: true, dueDateReminders: true });
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });
    showSpy.mockReturnValue(false); // suppressed (e.g. on battery)

    const manager = makeManager();
    expect(manager.scan()).toHaveLength(1);
    // Must not re-fire next scan despite being suppressed last time.
    expect(manager.scan()).toHaveLength(0);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  test('start()/stop() arm and clear the interval without throwing', () => {
    jest.useFakeTimers();
    seedNotificationSettings({ enabled: true, dueDateReminders: true });
    seedTask({ id: 1, courseId: 10, dueAt: new Date(NOW + 2 * HOUR).toISOString() });

    const manager = makeManager({ scanIntervalMs: 1000 });
    manager.start();
    jest.advanceTimersByTime(1000);
    expect(showSpy).toHaveBeenCalledTimes(1);

    manager.stop();
    jest.advanceTimersByTime(5000);
    expect(showSpy).toHaveBeenCalledTimes(1); // no further scans after stop
    jest.useRealTimers();
  });
});
