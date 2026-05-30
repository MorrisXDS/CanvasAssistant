/**
 * AppSettingsReader tests (ADR-0007).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { AppSettingsReader } from '../../../src/layers/l1-persistence/readers/AppSettingsReader';

describe('AppSettingsReader', () => {
  let db: Database;
  let reader: AppSettingsReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new AppSettingsReader(db);
  });

  afterEach(() => {
    db.close();
  });

  test('returns the stored value string for a key', () => {
    db.executeWrite(`INSERT INTO app_settings (key, value) VALUES ('k', 'v')`, []);
    expect(reader.get('k')).toBe('v');
  });

  test('returns null when the key is absent', () => {
    expect(reader.get('missing')).toBeNull();
  });
});
