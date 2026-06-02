/**
 * Migration 110 regression — `course_policies` (an ADR-0003 zombie, never
 * INSERTed) is dropped. It required rebuilding `notifications` to remove the
 * only live inbound FK (`linked_policy_id`) first — the first real use of the
 * ADR-0009 `disableForeignKeys` capability on a table that has its own children.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 110: drop course_policies (FK-off notifications rebuild)', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => db.close());

  const tableExists = (name: string): boolean =>
    db.executeRead<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      [name]
    ).length > 0;

  const columnExists = (table: string, column: string): boolean =>
    db
      .executeRead<{ name: string }>(`PRAGMA table_info(${table})`)
      .some((c) => c.name === column);

  test('course_policies is dropped', () => {
    expect(tableExists('course_policies')).toBe(false);
  });

  test('notifications survives, minus linked_policy_id', () => {
    expect(tableExists('notifications')).toBe(true);
    expect(columnExists('notifications', 'linked_policy_id')).toBe(false);
    // CHECK-constrained + core columns preserved.
    expect(columnExists('notifications', 'source_type')).toBe(true);
    expect(columnExists('notifications', 'message_html_original')).toBe(true);
  });

  test('notification rows + their children survive the rebuild and inserts still work', () => {
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'c1', 'CS', 'Intro')`,
      [],
      'courses'
    );
    // Insert works (no dangling FK to a dropped table) and the CHECK is intact.
    expect(() =>
      db.executeWrite(
        `INSERT INTO notifications (id, source_type, source_id, course_id, title, message, published_at)
         VALUES (1, 'canvas', 'a1', 1, 't', 'm', '2026-01-01')`,
        [],
        'notifications'
      )
    ).not.toThrow();
    // A child FK to notifications still resolves.
    expect(() =>
      db.executeWrite(
        `INSERT INTO notification_attachments
           (notification_id, course_id, external_id, display_name, filename, url)
         VALUES (1, 1, 'att1', 'f.pdf', 'f.pdf', 'https://x/att1')`,
        [],
        'notification_attachments'
      )
    ).not.toThrow();
    expect(db.executeRead('PRAGMA foreign_key_check')).toHaveLength(0);
  });

  test('migration 110 is reversible (down recreates both tables)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    const result = runner.rollbackTo(109);
    expect(result.errors).toEqual([]);
    expect(tableExists('course_policies')).toBe(true);
    expect(columnExists('notifications', 'linked_policy_id')).toBe(true);
  });
});
