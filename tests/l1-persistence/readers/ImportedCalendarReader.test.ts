/**
 * ImportedCalendarReader tests (ADR-0007 — calendarCrudHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ImportedCalendarReader } from '../../../src/layers/l1-persistence/readers/ImportedCalendarReader';

describe('ImportedCalendarReader', () => {
  let db: Database;
  let reader: ImportedCalendarReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new ImportedCalendarReader(db);
  });

  afterEach(() => {
    db.close();
  });

  function seed(name: string, hash: string | null): number {
    return db.executeWrite(
      `INSERT INTO imported_calendars (name, filename, file_hash, color, event_count, is_visible)
       VALUES (?, ?, ?, '#6366F1', 3, 1)`,
      [name, `${name}.ics`, hash],
      'imported_calendars'
    ).lastInsertRowid as number;
  }

  describe('getAll', () => {
    test('returns all calendars ordered by name', () => {
      seed('Zebra', 'h1');
      seed('Alpha', 'h2');
      expect(reader.getAll().map((c) => c.name)).toEqual(['Alpha', 'Zebra']);
    });

    test('returns [] when empty', () => {
      expect(reader.getAll()).toEqual([]);
    });
  });

  describe('getByHash', () => {
    test('returns the matching calendar projection', () => {
      const id = seed('Term', 'abc123');
      const row = reader.getByHash('abc123');
      expect(row).toMatchObject({ id, name: 'Term', color: '#6366F1', event_count: 3 });
      expect(row?.imported_at).toBeTruthy();
    });

    test('returns null when no hash matches', () => {
      seed('Term', 'abc123');
      expect(reader.getByHash('nope')).toBeNull();
    });
  });
});
