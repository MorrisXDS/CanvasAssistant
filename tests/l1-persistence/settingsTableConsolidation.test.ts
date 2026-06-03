/**
 * Migration 112 regression — the duplicate `app_settings` key-value table is
 * consolidated into `user_preferences` and dropped.
 *
 * Covers the three risk surfaces of the migration:
 *  - the table is gone after a full migration run, `user_preferences` survives;
 *  - the `up` data-copy moves the two backup keys into `user_preferences`;
 *  - the `down` recreates `app_settings` (verbatim v75 DDL) and restores the keys.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 112: consolidate app_settings into user_preferences', () => {
  let db: Database;
  let runner: MigrationRunner;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    runner = new MigrationRunner(db);
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

  function pref(key: string): string | undefined {
    return db.executeReadOne<{ value: string }>(
      'SELECT value FROM user_preferences WHERE key = ?',
      [key]
    )?.value;
  }

  test('app_settings table is gone after a full migration run', () => {
    expect(tableExists('app_settings')).toBe(false);
  });

  test('user_preferences table still exists', () => {
    expect(tableExists('user_preferences')).toBe(true);
  });

  test('up copies the backup keys from app_settings into user_preferences', () => {
    // Roll back 112 — its `down` recreates app_settings (empty: user_preferences
    // holds no backup keys yet) so we can seed pre-migration state.
    const back = runner.rollbackTo(111);
    expect(back.errors).toEqual([]);
    expect(tableExists('app_settings')).toBe(true);

    // Seed the two real backup keys into app_settings (production payloads).
    const schedule = JSON.stringify({ enabled: true, frequency: 'daily', time: '03:00' });
    db.executeWrite(
      `INSERT INTO app_settings (key, value) VALUES ('exportSchedule', ?)`,
      [schedule]
    );
    db.executeWrite(
      `INSERT INTO app_settings (key, value) VALUES ('backupEncryptionPassword', 'secret')`,
      []
    );

    // Re-run 112's up.
    const fwd = runner.runAll();
    expect(fwd.errors).toEqual([]);

    // The values landed in user_preferences; app_settings is dropped again.
    expect(pref('exportSchedule')).toBe(schedule);
    expect(pref('backupEncryptionPassword')).toBe('secret');
    expect(tableExists('app_settings')).toBe(false);
  });

  test('up upserts (value wins) when the key already exists in user_preferences', () => {
    const back = runner.rollbackTo(111);
    expect(back.errors).toEqual([]);

    // Pre-existing user_preferences row for the same key (with a description we
    // expect to survive — the upsert only touches `value`).
    db.executeWrite(
      `INSERT INTO user_preferences (key, value, description) VALUES ('exportSchedule', 'stale', 'keepme')`,
      []
    );
    db.executeWrite(
      `INSERT INTO app_settings (key, value) VALUES ('exportSchedule', 'fresh')`,
      []
    );

    const fwd = runner.runAll();
    expect(fwd.errors).toEqual([]);

    expect(pref('exportSchedule')).toBe('fresh');
    const row = db.executeReadOne<{ description: string | null }>(
      'SELECT description FROM user_preferences WHERE key = ?',
      ['exportSchedule']
    );
    expect(row?.description).toBe('keepme');
  });

  test('down recreates app_settings and restores the backup keys', () => {
    // From the fully-migrated state, seed the two keys into user_preferences as
    // they would exist post-consolidation.
    const schedule = JSON.stringify({ enabled: true, frequency: 'weekly', dayOfWeek: 1 });
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('exportSchedule', ?)`,
      [schedule]
    );
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('backupEncryptionPassword', 'pw')`,
      []
    );

    const back = runner.rollbackTo(111);
    expect(back.errors).toEqual([]);

    // app_settings is back with the verbatim v75 columns, and the two keys are
    // restored into it.
    expect(tableExists('app_settings')).toBe(true);
    const got = db.executeRead<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE key IN ('exportSchedule', 'backupEncryptionPassword') ORDER BY key`
    );
    expect(got).toEqual([
      { key: 'backupEncryptionPassword', value: 'pw' },
      { key: 'exportSchedule', value: schedule },
    ]);

    // down does NOT delete the keys from user_preferences (documented idempotency).
    expect(pref('exportSchedule')).toBe(schedule);
  });
});
