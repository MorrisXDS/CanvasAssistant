/**
 * Migration 109 regression — the dead grace-token + policy_rules leaf tables
 * (ADR-0003 leftovers, no live writer/reader) are dropped, while the parent
 * tables they FK'd (course_policies, course_task_groups — still blocked by
 * live FK columns) survive. The `down` recreates all three.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

const DROPPED = ['grace_tokens', 'grace_token_usage', 'policy_rules'];

// Parents the dropped tables FK'd — not dropped here (blocked by live FK columns).
const KEPT = ['course_task_groups'];

describe('migration 109: drop grace + policy_rules leaf tables', () => {
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

  test.each(DROPPED)('dropped: %s no longer exists', (name) => {
    expect(tableExists(name)).toBe(false);
  });

  test.each(KEPT)('kept (FK-blocked parent): %s still exists', (name) => {
    expect(tableExists(name)).toBe(true);
  });

  test('notification inserts still work (no dangling FK to a dropped table)', () => {
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'c1', 'CS', 'Intro')`,
      [],
      'courses'
    );
    expect(() =>
      db.executeWrite(
        `INSERT INTO notifications (source_type, source_id, course_id, title, message, published_at)
         VALUES ('canvas', 'a1', 1, 't', 'm', '2026-01-01')`,
        [],
        'notifications'
      )
    ).not.toThrow();
  });

  test('migration 109 is reversible (down recreates all three)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    const result = runner.rollbackTo(108);
    expect(result.errors).toEqual([]);
    for (const name of DROPPED) {
      expect(tableExists(name)).toBe(true);
    }
  });
});
