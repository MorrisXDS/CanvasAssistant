/**
 * EnrollmentTermReader tests (ADR-0007 — courseDataHandlers enrollment-terms read).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { EnrollmentTermReader } from '../../../src/layers/l1-persistence/readers/EnrollmentTermReader';

describe('EnrollmentTermReader', () => {
  let db: Database;
  let reader: EnrollmentTermReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new EnrollmentTermReader(db);
  });

  afterEach(() => {
    db.close();
  });

  test('returns all terms, most-recent start first', () => {
    db.executeWrite(
      `INSERT INTO enrollment_terms (external_id, name, start_at, end_at) VALUES
         ('t1', 'Fall 2025', '2025-09-01', '2025-12-20'),
         ('t2', 'Winter 2026', '2026-01-05', '2026-04-20')`,
      [],
      'enrollment_terms'
    );
    const rows = reader.getAll();
    expect(rows.map((r) => r.external_id)).toEqual(['t2', 't1']); // newest start first
    expect(rows[0]).toMatchObject({
      external_id: 't2',
      name: 'Winter 2026',
      start_at: '2026-01-05',
      end_at: '2026-04-20',
    });
  });

  test('returns an empty array when there are no terms', () => {
    expect(reader.getAll()).toEqual([]);
  });
});
