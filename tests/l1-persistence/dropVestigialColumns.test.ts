/**
 * Migration 107 regression — the vestigial scoring/value columns (ADR-0003
 * leftovers: old ROI/priority inputs + the never-read effective_grade /
 * grade_volatility) are dropped, while the live columns beside them survive.
 * The `down` re-adds them so the migration is reversible.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

const DROPPED: Array<[table: string, column: string]> = [
  ['tasks', 'pain_index'],
  ['tasks', 'penalty_severity'],
  ['tasks', 'has_safety_net'],
  ['tasks', 'days_until_cutoff'],
  ['tasks', 'effective_grade'],
  ['courses', 'grade_volatility'],
];

// Live columns sharing the same tables that must NOT be collateral damage.
const KEPT: Array<[table: string, column: string]> = [
  ['tasks', 'lock_at'], // Canvas-authoritative, synced + exported
  ['tasks', 'unlock_at'],
  ['tasks', 'grade'],
  ['courses', 'current_grade'],
];

describe('migration 107: drop vestigial columns', () => {
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

  function indexExists(name: string): boolean {
    return (
      db.executeRead<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name = ?",
        [name]
      ).length > 0
    );
  }

  test.each(DROPPED)('dropped: %s.%s no longer exists', (table, column) => {
    expect(columnExists(table, column)).toBe(false);
  });

  test.each(KEPT)('kept: %s.%s still exists', (table, column) => {
    expect(columnExists(table, column)).toBe(true);
  });

  test('the pain_index index is gone', () => {
    expect(indexExists('idx_tasks_pain_index')).toBe(false);
  });

  test('migration 107 is reversible (down re-adds columns + index)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    const result = runner.rollbackTo(106);
    expect(result.errors).toEqual([]);
    for (const [table, column] of DROPPED) {
      expect(columnExists(table, column)).toBe(true);
    }
    expect(indexExists('idx_tasks_pain_index')).toBe(true);
  });
});
