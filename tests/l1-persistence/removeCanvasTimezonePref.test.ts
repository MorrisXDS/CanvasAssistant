/**
 * Migration 113 regression — removes the dead, write-only `canvasTimezone` row
 * from `user_preferences`.
 *
 * The row was written by the `settings:syncCanvasTimezone` IPC handler (removed
 * in this PR) and never read back — its read route (`settings:getCanvasTimezone`)
 * was removed in migration 112's PR, and the live Canvas timezone is mirrored to
 * localStorage by the L5 syncSlice. The migration must delete the stale row if
 * present, leave every other preference untouched, and be idempotent when the
 * row is absent (the normal case on a fresh DB).
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';

describe('migration 113: remove dead canvasTimezone user_preferences row', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
  });

  afterEach(() => db.close());

  const migration113Up = (): ((db: Database) => void) => {
    const m = coreMigrations.find((mig) => mig.version === 113);
    if (!m || typeof m.up !== 'function') {
      throw new Error('migration 113 not found or its up is not a function');
    }
    return m.up;
  };

  const readPref = (key: string): string | undefined =>
    db.executeRead<{ value: string }>(
      'SELECT value FROM user_preferences WHERE key = ?',
      [key]
    )[0]?.value;

  test('(a) deletes a seeded canvasTimezone row, leaves other preferences intact', () => {
    db.executeWrite(
      'INSERT INTO user_preferences (key, value) VALUES (?, ?)',
      ['canvasTimezone', JSON.stringify({ timezone: 'America/Toronto' })],
      'user_preferences'
    );
    db.executeWrite(
      'INSERT INTO user_preferences (key, value) VALUES (?, ?)',
      ['syncPreferences', JSON.stringify({ interval: 30 })],
      'user_preferences'
    );

    migration113Up()(db);

    expect(readPref('canvasTimezone')).toBeUndefined();
    // An unrelated preference must survive.
    expect(readPref('syncPreferences')).toBe(JSON.stringify({ interval: 30 }));
  });

  test('(b) is idempotent — no throw and no-op when the row is absent', () => {
    // Fresh DB never wrote canvasTimezone (the writer is gone), so re-running is a no-op.
    expect(readPref('canvasTimezone')).toBeUndefined();
    expect(() => migration113Up()(db)).not.toThrow();
    expect(readPref('canvasTimezone')).toBeUndefined();
  });
});
