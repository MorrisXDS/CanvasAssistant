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
import {
  DueDateReminderManager,
  PRUNE_RETENTION_MS,
} from '../../src/lifecycle/DueDateReminderManager';
import { NotifiedReminderReader } from '../../src/layers/l1-persistence/readers/NotifiedReminderReader';
import { RecordNotifiedReminderCommand } from '../../src/layers/l4-controller/commands/notifiedReminder/RecordNotifiedReminderCommand';
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

  function makeManager(
    over: Partial<{ scanIntervalMs: number; now: () => number }> = {}
  ) {
    return new DueDateReminderManager({
      database: db,
      logger: noopLogger as never,
      getVisibilityOracle: () => oracle,
      showNotification: (title, body) => showSpy(title, body),
      now: () => NOW,
      // Wire the REAL reader/command over the same in-memory DB so every test
      // exercises the persistence path (INSERT OR IGNORE + seed on empty table
      // = no change to existing assertions; lets the restart tests work too).
      notifiedReminderReader: new NotifiedReminderReader(db),
      recordNotifiedReminderCommand: new RecordNotifiedReminderCommand(db),
      ...over,
    });
  }

  /** Read all dedup keys directly from the in-memory DB. */
  function allPersistedKeys(): string[] {
    return db
      .executeRead<{ dedup_key: string }>('SELECT dedup_key FROM notified_reminders')
      .map((r) => r.dedup_key);
  }

  /** Directly INSERT a row into notified_reminders (bypass command, for prune tests). */
  function seedPersistedKey(dedup_key: string, task_id: number, due_at: string): void {
    db.executeWrite(
      'INSERT OR IGNORE INTO notified_reminders (dedup_key, task_id, due_at) VALUES (?, ?, ?)',
      [dedup_key, task_id, due_at],
      'notified_reminders'
    );
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

  // -------------------------------------------------------------------------
  // Durable dedup persistence tests (migration 114 / ADR-0016 follow-up)
  // -------------------------------------------------------------------------

  describe('durable dedup persistence (notified_reminders)', () => {
    const DUE_AT = new Date(NOW + 2 * HOUR).toISOString();
    const DEDUP_KEY = `1|${DUE_AT}`;

    beforeEach(() => {
      seedNotificationSettings({ enabled: true, dueDateReminders: true });
      seedTask({ id: 1, courseId: 10, title: 'Problem Set 3', dueAt: DUE_AT });
    });

    test('(a) first run notifies AND persists a row in notified_reminders', () => {
      const manager = makeManager();
      const shown = manager.scan();

      expect(shown).toHaveLength(1);
      expect(showSpy).toHaveBeenCalledTimes(1);

      // The row must be in the DB, regardless of show outcome.
      const keys = allPersistedKeys();
      expect(keys).toContain(DEDUP_KEY);
    });

    test('(b) simulated restart does NOT re-notify — headline regression test', () => {
      // First run: notify + persist.
      makeManager().scan();
      expect(showSpy).toHaveBeenCalledTimes(1);

      // Restart: construct a NEW manager over the SAME db. start() seeds notified
      // from the DB, so the still-due task is already in the Set.
      const restarted = makeManager();
      restarted.start();
      restarted.stop();

      const secondShown = restarted.scan();

      expect(secondShown).toHaveLength(0);
      // showSpy count must NOT grow beyond the first run.
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('(c) due-date change re-arms — new key → new notification after restart', () => {
      // First run: notify for DUE_AT.
      makeManager().scan();
      expect(showSpy).toHaveBeenCalledTimes(1);
      expect(allPersistedKeys()).toHaveLength(1);

      // Simulate a due-date change: update the task row to a different due_at.
      const NEW_DUE_AT = new Date(NOW + 4 * HOUR).toISOString();
      db.executeWrite('UPDATE tasks SET due_at = ? WHERE id = 1', [NEW_DUE_AT], 'tasks');
      const NEW_DEDUP_KEY = `1|${NEW_DUE_AT}`;

      // Restart with the changed due_at.
      const restarted = makeManager();
      restarted.start();
      restarted.stop();
      const shown = restarted.scan();

      // The new key is not in the table → should fire again.
      expect(shown).toHaveLength(1);
      expect(showSpy).toHaveBeenCalledTimes(2);
      // Both keys should now be in the table.
      const keys = allPersistedKeys();
      expect(keys).toContain(DEDUP_KEY);
      expect(keys).toContain(NEW_DEDUP_KEY);
      expect(keys).toHaveLength(2);
    });

    test('(d) suppressed reminder is still persisted and does NOT re-fire on restart', () => {
      // Suppress the notification show.
      showSpy.mockReturnValue(false);

      const manager = makeManager();
      const shown = manager.scan();

      // Candidate is selected but show returns false.
      expect(shown).toHaveLength(1);
      expect(showSpy).toHaveBeenCalledTimes(1);

      // Row MUST be persisted even though show was suppressed.
      expect(allPersistedKeys()).toContain(DEDUP_KEY);

      // Restart: the key is seeded from the DB → task must NOT re-notify.
      const restarted = makeManager();
      restarted.start();
      restarted.stop();
      const secondShown = restarted.scan();

      expect(secondShown).toHaveLength(0);
      // showSpy count stays at 1 — no re-fire.
      expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('(e) start() prunes stale rows but keeps within-window and future-due rows', () => {
      // Use an injectable clock so the prune boundary is deterministic.
      const FIXED_NOW = NOW;

      // 8 days past due_at — beyond PRUNE_RETENTION_MS (7d) → must be pruned.
      const STALE_DUE_AT = new Date(FIXED_NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
      // Within the 24h window (2h from now) — must NOT be pruned.
      const WINDOW_DUE_AT = new Date(FIXED_NOW + 2 * HOUR).toISOString();
      // Future-due, re-armed after a date change — must NOT be pruned.
      const FUTURE_DUE_AT = new Date(FIXED_NOW + 3 * 24 * 60 * 60 * 1000).toISOString();

      seedPersistedKey(`stale|${STALE_DUE_AT}`, 99, STALE_DUE_AT);
      seedPersistedKey(`window|${WINDOW_DUE_AT}`, 1, WINDOW_DUE_AT);
      seedPersistedKey(`future|${FUTURE_DUE_AT}`, 1, FUTURE_DUE_AT);

      expect(allPersistedKeys()).toHaveLength(3);

      // start() must prune at now - PRUNE_RETENTION_MS.
      const manager = makeManager({ now: () => FIXED_NOW });
      manager.start();
      manager.stop();

      const remaining = allPersistedKeys();
      // Stale row is gone.
      expect(remaining).not.toContain(`stale|${STALE_DUE_AT}`);
      // Within-window row must survive.
      expect(remaining).toContain(`window|${WINDOW_DUE_AT}`);
      // Future-due row must survive.
      expect(remaining).toContain(`future|${FUTURE_DUE_AT}`);
      expect(remaining).toHaveLength(2);
    });

    test('(e-boundary) PRUNE_RETENTION_MS is exactly 7 days', () => {
      // Exported const — the prune test uses it as the boundary reference.
      expect(PRUNE_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
