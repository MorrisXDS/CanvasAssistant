/**
 * UserPreferencesReader tests (ADR-0007).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { UserPreferencesReader } from '../../../src/layers/l1-persistence/readers/UserPreferencesReader';

describe('UserPreferencesReader', () => {
  let db: Database;
  let reader: UserPreferencesReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new UserPreferencesReader(db);
  });

  afterEach(() => {
    db.close();
  });

  test('returns the stored value string for a key', () => {
    db.executeWrite(
      `INSERT INTO user_preferences (key, value) VALUES ('k', '{"a":1}')`,
      []
    );

    expect(reader.get('k')).toBe('{"a":1}');
  });

  test('returns null when the key is absent', () => {
    expect(reader.get('missing')).toBeNull();
  });
});
