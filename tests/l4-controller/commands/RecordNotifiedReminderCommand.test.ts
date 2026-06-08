/**
 * RecordNotifiedReminderCommand unit tests.
 *
 * Tests the two write operations on `notified_reminders`:
 *   - `record()` — INSERT OR IGNORE (idempotent, duplicate key = one row)
 *   - `pruneOlderThan()` — DELETE WHERE due_at < cutoff (boundary: < not <=)
 *
 * Uses a real in-memory DB with full coreMigrations so the schema is exact.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { RecordNotifiedReminderCommand } from '../../../src/layers/l4-controller/commands/notifiedReminder/RecordNotifiedReminderCommand';

describe('RecordNotifiedReminderCommand', () => {
  let db: Database;
  let cmd: RecordNotifiedReminderCommand;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    cmd = new RecordNotifiedReminderCommand(db);
  });

  afterEach(() => db.close());

  function rowCount(): number {
    return (
      db.executeRead<{ n: number }>('SELECT COUNT(*) AS n FROM notified_reminders')[0]
        ?.n ?? 0
    );
  }

  function getRow(
    dedup_key: string
  ): { dedup_key: string; task_id: number; due_at: string } | null {
    return (
      db.executeRead<{ dedup_key: string; task_id: number; due_at: string }>(
        'SELECT dedup_key, task_id, due_at FROM notified_reminders WHERE dedup_key = ?',
        [dedup_key]
      )[0] ?? null
    );
  }

  // --- record() ---

  test('(a) record() inserts a row', () => {
    cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    expect(rowCount()).toBe(1);
    const row = getRow('1|2026-06-07T12:00:00.000Z');
    expect(row).not.toBeNull();
    expect(row!.task_id).toBe(1);
    expect(row!.due_at).toBe('2026-06-07T12:00:00.000Z');
  });

  test('(b) record() is idempotent — calling twice with same key keeps exactly one row', () => {
    cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    expect(rowCount()).toBe(1);
  });

  test('(c) record() does not throw on duplicate key (INSERT OR IGNORE)', () => {
    expect(() => {
      cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
      cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    }).not.toThrow();
  });

  test('(d) record() allows different keys for the same task (different due dates)', () => {
    cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    cmd.record('1|2026-06-08T10:00:00.000Z', 1, '2026-06-08T10:00:00.000Z');
    expect(rowCount()).toBe(2);
  });

  // --- pruneOlderThan() ---

  test('(e) pruneOlderThan() deletes rows whose due_at is strictly before the cutoff', () => {
    const cutoff = '2026-06-01T00:00:00.000Z';
    // Before cutoff → should be pruned
    cmd.record('1|2026-05-31T23:59:59.999Z', 1, '2026-05-31T23:59:59.999Z');
    cmd.record('2|2026-05-01T00:00:00.000Z', 2, '2026-05-01T00:00:00.000Z');
    // AT cutoff → NOT pruned (< not <=)
    cmd.record('3|2026-06-01T00:00:00.000Z', 3, '2026-06-01T00:00:00.000Z');
    // After cutoff → NOT pruned
    cmd.record('4|2026-06-07T12:00:00.000Z', 4, '2026-06-07T12:00:00.000Z');

    const deleted = cmd.pruneOlderThan(cutoff);

    expect(deleted).toBe(2);
    expect(rowCount()).toBe(2);
    // AT cutoff row must survive
    expect(getRow('3|2026-06-01T00:00:00.000Z')).not.toBeNull();
    // After cutoff row must survive
    expect(getRow('4|2026-06-07T12:00:00.000Z')).not.toBeNull();
    // Before cutoff rows must be gone
    expect(getRow('1|2026-05-31T23:59:59.999Z')).toBeNull();
    expect(getRow('2|2026-05-01T00:00:00.000Z')).toBeNull();
  });

  test('(f) pruneOlderThan() returns 0 and does not throw when no rows match', () => {
    const cutoff = '2026-01-01T00:00:00.000Z';
    cmd.record('1|2026-06-07T12:00:00.000Z', 1, '2026-06-07T12:00:00.000Z');
    const deleted = cmd.pruneOlderThan(cutoff);
    expect(deleted).toBe(0);
    expect(rowCount()).toBe(1);
  });

  test('(g) pruneOlderThan() on empty table returns 0', () => {
    const deleted = cmd.pruneOlderThan('2026-06-07T12:00:00.000Z');
    expect(deleted).toBe(0);
  });

  test('(h) prune compares due_at (ISO-UTC lexical == chronological)', () => {
    // Two dates in the same day — lexical sort must match chronological order.
    const cutoff = '2026-06-07T06:00:00.000Z';
    cmd.record('1|2026-06-07T05:59:59.999Z', 1, '2026-06-07T05:59:59.999Z'); // before → pruned
    cmd.record('2|2026-06-07T06:00:00.000Z', 2, '2026-06-07T06:00:00.000Z'); // AT → kept
    cmd.record('3|2026-06-07T12:00:00.000Z', 3, '2026-06-07T12:00:00.000Z'); // after → kept

    const deleted = cmd.pruneOlderThan(cutoff);

    expect(deleted).toBe(1);
    expect(getRow('1|2026-06-07T05:59:59.999Z')).toBeNull();
    expect(getRow('2|2026-06-07T06:00:00.000Z')).not.toBeNull();
    expect(getRow('3|2026-06-07T12:00:00.000Z')).not.toBeNull();
  });
});
