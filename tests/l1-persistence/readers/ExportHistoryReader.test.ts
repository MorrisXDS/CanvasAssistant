/**
 * ExportHistoryReader tests (ADR-0007).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ExportHistoryReader } from '../../../src/layers/l1-persistence/readers/ExportHistoryReader';

function seedExport(db: Database, type: string, createdAt: string): void {
  db.executeWrite(
    `INSERT INTO export_history (export_type, status, created_at) VALUES (?, 'completed', ?)`,
    [type, createdAt]
  );
}

describe('ExportHistoryReader', () => {
  let db: Database;
  let reader: ExportHistoryReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new ExportHistoryReader(db);
  });

  afterEach(() => {
    db.close();
  });

  test('returns rows newest-first', () => {
    seedExport(db, 'csv', '2026-01-01T00:00:00.000Z');
    seedExport(db, 'selective', '2026-03-01T00:00:00.000Z');
    seedExport(db, 'scheduled', '2026-02-01T00:00:00.000Z');

    const rows = reader.getRecent();

    expect(rows.map((r) => r.export_type)).toEqual(['selective', 'scheduled', 'csv']);
  });

  test('honors the limit', () => {
    seedExport(db, 'csv', '2026-01-01T00:00:00.000Z');
    seedExport(db, 'selective', '2026-02-01T00:00:00.000Z');
    seedExport(db, 'scheduled', '2026-03-01T00:00:00.000Z');

    expect(reader.getRecent(2)).toHaveLength(2);
  });

  test('returns empty when there is no history', () => {
    expect(reader.getRecent()).toEqual([]);
  });

  describe('getByType', () => {
    test('returns only the requested export_type, newest first', () => {
      seedExport(db, 'scheduled', '2026-01-01T00:00:00.000Z');
      seedExport(db, 'csv', '2026-02-01T00:00:00.000Z');
      seedExport(db, 'scheduled', '2026-03-01T00:00:00.000Z');

      const rows = reader.getByType('scheduled');

      expect(rows).toHaveLength(2);
      expect(rows[0].created_at > rows[1].created_at).toBe(true);
      expect(rows.every((r) => r.export_type === 'scheduled')).toBe(true);
    });

    test('honors the limit', () => {
      seedExport(db, 'scheduled', '2026-01-01T00:00:00.000Z');
      seedExport(db, 'scheduled', '2026-02-01T00:00:00.000Z');

      expect(reader.getByType('scheduled', 1)).toHaveLength(1);
    });
  });
});
