/**
 * Migration 111 regression — finishes the ADR-0003 schema-zombie cleanup by
 * dropping the three now-unwritten, unread policy columns left on `notifications`
 * by v110: `is_policy_related`, `policy_keywords`, `priority_level`. This is a
 * second FK-off (`disableForeignKeys`, ADR-0009) rebuild of `notifications` — a
 * table with its own children (notification_attachments). The live REAL column
 * `priority_score` is explicitly KEPT (only the unrelated `priority_level` TEXT
 * enum dies); the course FK / UNIQUE constraint / the two indexes are preserved.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 111: drop dead notification policy columns (FK-off rebuild)', () => {
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

  const indexExists = (name: string): boolean =>
    db.executeRead<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name = ?",
      [name]
    ).length > 0;

  const SURVIVING_COLUMNS = [
    'id',
    'source_type',
    'source_id',
    'course_id',
    'title',
    'message',
    'message_html',
    'priority_score',
    'published_at',
    'dismissed_at',
    'created_at',
    'url',
    'message_html_original',
  ];

  test('(a) the 3 dead policy columns are dropped', () => {
    expect(tableExists('notifications')).toBe(true);
    expect(columnExists('notifications', 'priority_level')).toBe(false);
    expect(columnExists('notifications', 'is_policy_related')).toBe(false);
    expect(columnExists('notifications', 'policy_keywords')).toBe(false);
  });

  test('(b) all 13 surviving columns are present incl. priority_score', () => {
    for (const col of SURVIVING_COLUMNS) {
      expect(columnExists('notifications', col)).toBe(true);
    }
    // The exact column set is the 13 survivors — nothing extra, nothing missing.
    const cols = db
      .executeRead<{ name: string }>(`PRAGMA table_info(notifications)`)
      .map((c) => c.name)
      .sort();
    expect(cols).toEqual([...SURVIVING_COLUMNS].sort());
    // The KEEP/DROP twins differ by one word — guard against confusion.
    expect(columnExists('notifications', 'priority_score')).toBe(true);
    expect(columnExists('notifications', 'priority_level')).toBe(false);
  });

  test('(c) a pre-existing notification row survives the rebuild with values intact', () => {
    // Roll back to v110 (3 dead cols still present), seed a row carrying values
    // in the to-be-dropped columns AND the survivors, then re-run 111 and assert
    // the surviving values are intact.
    const downRunner = new MigrationRunner(db);
    downRunner.loadMigrations(coreMigrations);
    expect(downRunner.rollbackTo(110).errors).toEqual([]);
    expect(columnExists('notifications', 'priority_level')).toBe(true);

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'c1', 'CS', 'Intro')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO notifications
         (id, source_type, source_id, course_id, title, message, message_html,
          priority_level, priority_score, published_at, url, message_html_original,
          is_policy_related, policy_keywords)
       VALUES (7, 'canvas', 'ann-7', 1, 'Title 7', 'Body 7', '<p>Body 7</p>',
          'high', 4.5, '2026-01-02', 'https://x/7', '<p>orig 7</p>', 1, 'late,grade')`,
      [],
      'notifications'
    );

    // Re-apply 111 (forward).
    const upRunner = new MigrationRunner(db);
    upRunner.loadMigrations(coreMigrations);
    expect(upRunner.runAll().errors).toEqual([]);

    const row = db.executeRead<{
      id: number;
      source_type: string;
      source_id: string;
      course_id: number;
      title: string;
      message: string;
      message_html: string;
      priority_score: number;
      published_at: string;
      url: string;
      message_html_original: string;
    }>(`SELECT * FROM notifications WHERE id = 7`)[0];

    expect(row).toMatchObject({
      id: 7,
      source_type: 'canvas',
      source_id: 'ann-7',
      course_id: 1,
      title: 'Title 7',
      message: 'Body 7',
      message_html: '<p>Body 7</p>',
      priority_score: 4.5,
      published_at: '2026-01-02',
      url: 'https://x/7',
      message_html_original: '<p>orig 7</p>',
    });
    // The dropped columns are no longer queryable.
    expect(columnExists('notifications', 'priority_level')).toBe(false);
    expect(columnExists('notifications', 'is_policy_related')).toBe(false);
    expect(columnExists('notifications', 'policy_keywords')).toBe(false);
  });

  test('(d) FK CASCADE, UNIQUE constraint and both indexes are intact', () => {
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'c1', 'CS', 'Intro')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO notifications (id, source_type, source_id, course_id, title, message, published_at)
       VALUES (1, 'canvas', 'a1', 1, 't', 'm', '2026-01-01')`,
      [],
      'notifications'
    );

    // UNIQUE(source_type, source_id) still enforced — duplicate throws.
    expect(() =>
      db.executeWrite(
        `INSERT INTO notifications (id, source_type, source_id, course_id, title, message, published_at)
         VALUES (2, 'canvas', 'a1', 1, 't2', 'm2', '2026-01-01')`,
        [],
        'notifications'
      )
    ).toThrow();

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

    // FK course_id -> courses ON DELETE CASCADE: deleting the course removes the
    // notification (and the unique-violating row was never inserted, so id=1).
    db.executeWrite(`DELETE FROM courses WHERE id = 1`, [], 'courses');
    expect(
      db.executeRead<{ c: number }>(
        `SELECT COUNT(*) AS c FROM notifications WHERE course_id = 1`
      )[0].c
    ).toBe(0);

    // Indexes recreated after the rename.
    expect(indexExists('idx_notifications_course')).toBe(true);
    expect(indexExists('idx_notifications_dismissed')).toBe(true);
  });

  test('(e) migration 111 is reversible (down re-adds the 3 columns)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    const result = runner.rollbackTo(110);
    expect(result.errors).toEqual([]);

    expect(columnExists('notifications', 'priority_level')).toBe(true);
    expect(columnExists('notifications', 'is_policy_related')).toBe(true);
    expect(columnExists('notifications', 'policy_keywords')).toBe(true);
    // priority_score (the keep) is still present after the down.
    expect(columnExists('notifications', 'priority_score')).toBe(true);
    // linked_policy_id was already gone as of v110 and is NOT re-added by 111's down.
    expect(columnExists('notifications', 'linked_policy_id')).toBe(false);
  });
});
