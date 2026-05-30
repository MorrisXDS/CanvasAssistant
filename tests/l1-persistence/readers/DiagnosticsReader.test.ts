/**
 * DiagnosticsReader tests (ADR-0007).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { DiagnosticsReader } from '../../../src/layers/l1-persistence/readers/DiagnosticsReader';

describe('DiagnosticsReader', () => {
  let db: Database;
  let reader: DiagnosticsReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new DiagnosticsReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getEntityCounts', () => {
    test('returns a numeric count for each diagnostic table', () => {
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade) VALUES ('e1', 'C', 'C', 85)`,
        []
      );

      const counts = reader.getEntityCounts();

      expect(counts.courses).toBe(1);
      expect(counts.tasks).toBe(0);
      expect(counts.calendar_events).toBe(0);
      expect(counts.imported_calendars).toBe(0);
      expect(counts.notifications).toBe(0);
      expect(counts.resources).toBe(0);
    });

    test("yields 'error' for a table that can't be read", () => {
      db.executeWrite('DROP TABLE resources', []);

      const counts = reader.getEntityCounts();

      expect(counts.resources).toBe('error');
      expect(counts.courses).toBe(0); // others still counted
    });
  });

  describe('getImportedCalendarsDetail', () => {
    test('returns id/name/event_count rows', () => {
      db.executeWrite(
        `INSERT INTO imported_calendars (name, filename, event_count) VALUES ('Cal A', 'a.ics', 3)`,
        []
      );

      const rows = reader.getImportedCalendarsDetail();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: 'Cal A', event_count: 3 });
    });
  });

  describe('getCalendarEventsByType', () => {
    test('groups counts by source_type', () => {
      db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at) VALUES ('user', 'A', '2026-01-01')`,
        []
      );
      db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at) VALUES ('user', 'B', '2026-01-02')`,
        []
      );
      db.executeWrite(
        `INSERT INTO calendar_events (source_type, title, start_at) VALUES ('canvas', 'C', '2026-01-03')`,
        []
      );

      const rows = reader.getCalendarEventsByType();
      const byType = Object.fromEntries(rows.map((r) => [r.source_type, r.count]));

      expect(byType.user).toBe(2);
      expect(byType.canvas).toBe(1);
    });
  });
});
