/**
 * Migration 105 regression — the dead/zombie tables (ADR-0003 intelligence +
 * grade + field leftovers) are dropped, and the live tables they sat next to
 * survive.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

const DROPPED = [
  'recommendations',
  'user_insights',
  'workload_snapshots',
  'user_behavior_patterns',
  'adaptive_weight_adjustments',
  'effort_estimations',
  'task_completion_events',
  'grade_replacements',
  'weight_transfers',
  'field_notification_suppressions',
  'field_modifications',
];

// Live tables that share neighbourhoods with the dropped ones and must remain.
const KEPT = [
  'canvas_assignment_groups', // the live task-grouping table
  // course_task_groups is dead too, but `tasks.task_group_id` /
  // `course_policies.target_group_id` still FK to it — deferred to a PR that
  // drops those columns first. Must NOT be dropped by migration 105.
  'course_task_groups',
  'course_policies',
  'grade_history',
  'sync_preferences',
  'message_display_history',
];

describe('migration 105: drop zombie tables', () => {
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

  test.each(KEPT)('kept: %s still exists', (name) => {
    expect(tableExists(name)).toBe(true);
  });

  test('migration 105 is reversible (down recreates the dropped tables)', () => {
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    // Roll back just migration 105.
    const result = runner.rollbackTo(104);
    expect(result.errors).toEqual([]);
    for (const name of DROPPED) {
      expect(tableExists(name)).toBe(true);
    }
  });
});
