/**
 * NotifiedReminderReader unit tests.
 *
 * Verifies the read surface for the `notified_reminders` table:
 * `getAllKeys()` seeds the dedup Set in DueDateReminderManager.start().
 *
 * Uses a real in-memory DB so the test is DB-accurate without any mocking.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { NotifiedReminderReader } from '../../../src/layers/l1-persistence/readers/NotifiedReminderReader';

describe('NotifiedReminderReader', () => {
  let db: Database;
  let reader: NotifiedReminderReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new NotifiedReminderReader(db);
  });

  afterEach(() => db.close());

  function insertKey(dedup_key: string, task_id: number, due_at: string): void {
    db.executeWrite(
      `INSERT INTO notified_reminders (dedup_key, task_id, due_at)
       VALUES (?, ?, ?)`,
      [dedup_key, task_id, due_at],
      'notified_reminders'
    );
  }

  test('(a) returns empty array when table is empty', () => {
    expect(reader.getAllKeys()).toEqual([]);
  });

  test('(b) returns a single inserted dedup key', () => {
    insertKey('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    const keys = reader.getAllKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('1|2026-06-07T12:00:00.000Z');
  });

  test('(c) returns all keys when multiple rows exist', () => {
    insertKey('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    insertKey('2|2026-06-08T10:00:00.000Z', 2, '2026-06-08T10:00:00.000Z');
    insertKey('3|2026-06-09T08:00:00.000Z', 3, '2026-06-09T08:00:00.000Z');
    const keys = reader.getAllKeys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain('1|2026-06-07T12:00:00.000Z');
    expect(keys).toContain('2|2026-06-08T10:00:00.000Z');
    expect(keys).toContain('3|2026-06-09T08:00:00.000Z');
  });
});
