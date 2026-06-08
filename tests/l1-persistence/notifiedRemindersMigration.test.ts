/**
 * Migration 114 — notified_reminders table schema test.
 *
 * After running coreMigrations the table must exist with the correct
 * columns (dedup_key PK, task_id, due_at, notified_at) and the
 * idx_notified_reminders_due_at index must be present.
 *
 * Mirrors the style of removeCanvasTimezonePref.test.ts and
 * settingsTableConsolidation.test.ts — in-memory DB, full migration run,
 * PRAGMA introspection.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 114: notified_reminders table', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => db.close());

  test('(a) table exists after all migrations run', () => {
    const rows = db.executeRead<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notified_reminders'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('notified_reminders');
  });

  test('(b) columns match DDL — dedup_key PK, task_id, due_at, notified_at', () => {
    const cols = db.executeRead<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>('PRAGMA table_info(notified_reminders)');

    const colMap = Object.fromEntries(cols.map((c) => [c.name, c]));

    // dedup_key — TEXT, PRIMARY KEY
    expect(colMap['dedup_key']).toBeDefined();
    expect(colMap['dedup_key'].pk).toBe(1);
    expect(colMap['dedup_key'].type.toUpperCase()).toContain('TEXT');

    // task_id — INTEGER, NOT NULL
    expect(colMap['task_id']).toBeDefined();
    expect(colMap['task_id'].notnull).toBe(1);

    // due_at — TEXT, NOT NULL
    expect(colMap['due_at']).toBeDefined();
    expect(colMap['due_at'].notnull).toBe(1);

    // notified_at — TEXT, NOT NULL (has DEFAULT)
    expect(colMap['notified_at']).toBeDefined();
    expect(colMap['notified_at'].notnull).toBe(1);

    // Exactly 4 columns, no extras
    expect(cols).toHaveLength(4);
  });

  test('(c) due_at index exists', () => {
    const indexes = db.executeRead<{ name: string; tbl_name: string }>(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name='idx_notified_reminders_due_at'"
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].tbl_name).toBe('notified_reminders');
  });

  test('(d) migration 114 is included in coreMigrations with the correct version number', () => {
    const m114 = coreMigrations.find((m) => m.version === 114);
    expect(m114).toBeDefined();
    expect(m114?.description).toMatch(/notified_reminders/i);
    expect(m114?.down).toBeTruthy();
  });

  test('(e) down migration drops the table', () => {
    const m114 = coreMigrations.find((m) => m.version === 114);
    expect(m114?.down).toBeDefined();

    // Execute the down SQL directly against the already-migrated DB.
    const downSql = m114!.down as string;
    db.exec(downSql);

    const rows = db.executeRead<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notified_reminders'"
    );
    expect(rows).toHaveLength(0);
  });
});
