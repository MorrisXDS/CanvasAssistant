/**
 * Migration 108 regression — the vestigial `sync_preferences.prefer_local`
 * column (the live conflict-preference path uses the runtime-added
 * `prefer_canvas` instead) is dropped, and the migration is reversible.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 108: drop sync_preferences.prefer_local', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => db.close());

  function columnExists(table: string, column: string): boolean {
    return db
      .executeRead<{ name: string }>(`PRAGMA table_info(${table})`)
      .some((c) => c.name === column);
  }

  test('prefer_local no longer exists', () => {
    expect(columnExists('sync_preferences', 'prefer_local')).toBe(false);
  });

  test('the rest of sync_preferences survives', () => {
    for (const col of ['entity', 'entity_id', 'field', 'created_at']) {
      expect(columnExists('sync_preferences', col)).toBe(true);
    }
  });

  test('migration 108 is reversible (down re-adds prefer_local)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    const result = runner.rollbackTo(107);
    expect(result.errors).toEqual([]);
    expect(columnExists('sync_preferences', 'prefer_local')).toBe(true);
  });
});
