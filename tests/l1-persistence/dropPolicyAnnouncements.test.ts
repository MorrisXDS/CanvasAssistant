/**
 * Migration 106 regression — `policy_announcements` (an ADR-0003 orphan: written
 * every sync, read by nothing since the intelligence layer was removed) is
 * dropped, and the live notification/course tables it sat beside survive. The
 * `down` recreates it so the migration is reversible.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 106: drop policy_announcements', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => db.close());

  function tableExists(name: string): boolean {
    return (
      db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        [name]
      ).length > 0
    );
  }

  test('policy_announcements no longer exists after migration', () => {
    expect(tableExists('policy_announcements')).toBe(false);
  });

  test('neighbouring live tables survive', () => {
    expect(tableExists('notifications')).toBe(true);
    expect(tableExists('courses')).toBe(true);
  });

  test('migration 106 is reversible (down recreates the table + indexes)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    const result = runner.rollbackTo(105);
    expect(result.errors).toEqual([]);
    expect(tableExists('policy_announcements')).toBe(true);

    const indexes = db.executeRead<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='policy_announcements'"
    );
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_policy_announcements_notification');
    expect(names).toContain('idx_policy_announcements_course');
  });
});
