/**
 * CourseReader tests
 *
 * Covers the new reader surface (PR-B of ADR-0007). Reader returns raw rows;
 * visibility filtering is the Oracle's job and is tested separately.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CourseReader } from '../../../src/layers/l1-persistence/readers/CourseReader';

describe('CourseReader', () => {
  let db: Database;
  let reader: CourseReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    reader = new CourseReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getById', () => {
    test('returns the row when it exists', () => {
      seedCourse(db, { id: 1, code: 'CS101', name: 'Intro' });

      const row = reader.getById(1);

      expect(row).not.toBeNull();
      expect(row?.id).toBe(1);
      expect(row?.code).toBe('CS101');
      expect(row?.name).toBe('Intro');
    });

    test('returns null when the id does not exist', () => {
      expect(reader.getById(999)).toBeNull();
    });

    test('bypasses visibility — returns hidden courses', () => {
      seedCourse(db, { id: 1, is_hidden: 1 });

      const row = reader.getById(1);

      expect(row).not.toBeNull();
      expect(row?.is_hidden).toBe(1);
    });

    test('bypasses visibility — returns archived courses', () => {
      seedCourse(db, { id: 1, archived_at: '2024-12-01' });

      const row = reader.getById(1);

      expect(row).not.toBeNull();
      expect(row?.archived_at).toBe('2024-12-01');
    });

    test('bypasses visibility — returns soft-deleted courses', () => {
      // Soft-deleted rows are still in the table; the reader returns them
      // when their id is asked for. Visibility filtering at the Oracle
      // excludes these from listings, but a direct getById deliberately
      // surfaces the row. (deleted_at isn't on the CourseRow type, so we
      // verify via raw count rather than typed field.)
      seedCourse(db, { id: 1, deleted_at: '2024-01-01' });

      const row = reader.getById(1);

      expect(row).not.toBeNull();
      expect(row?.id).toBe(1);
    });
  });

  describe('getByIds', () => {
    test('returns rows for the given ids, ordered by name', () => {
      seedCourse(db, { id: 1, name: 'Calculus' });
      seedCourse(db, { id: 2, name: 'Algebra' });
      seedCourse(db, { id: 3, name: 'Biology' });

      const rows = reader.getByIds([1, 2, 3]);

      expect(rows.map((r) => r.name)).toEqual(['Algebra', 'Biology', 'Calculus']);
    });

    test('returns empty array for empty input', () => {
      seedCourse(db, { id: 1 });

      expect(reader.getByIds([])).toEqual([]);
    });

    test('ignores ids that do not exist', () => {
      seedCourse(db, { id: 1, name: 'A' });
      seedCourse(db, { id: 2, name: 'B' });

      const rows = reader.getByIds([1, 2, 999, 1000]);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
    });

    test('returns hidden / archived rows when their ids are given', () => {
      seedCourse(db, { id: 1, is_hidden: 1, name: 'Hidden' });
      seedCourse(db, { id: 2, archived_at: '2024-01-01', name: 'Archived' });

      const rows = reader.getByIds([1, 2]);

      expect(rows).toHaveLength(2);
    });
  });

  describe('getArchivedSortedByTermEnd', () => {
    test('returns only archived, non-deleted courses', () => {
      seedCourse(db, { id: 1, archived_at: '2024-12-01' });
      seedCourse(db, { id: 2 }); // active
      seedCourse(db, { id: 3, archived_at: '2024-06-01', deleted_at: '2024-07-01' }); // archived + deleted

      const rows = reader.getArchivedSortedByTermEnd();

      expect(rows.map((r) => r.id)).toEqual([1]);
    });

    test('orders by term end_at descending (most recent term first)', () => {
      const t1 = seedEnrollmentTerm(db, {
        external_id: '100',
        name: 'Fall 2023',
        end_at: '2023-12-15T00:00:00Z',
      });
      const t2 = seedEnrollmentTerm(db, {
        external_id: '200',
        name: 'Fall 2024',
        end_at: '2024-12-15T00:00:00Z',
      });

      seedCourse(db, {
        id: 1,
        name: 'Old',
        archived_at: '2024-01-01',
        enrollment_term_id: t1,
      });
      seedCourse(db, {
        id: 2,
        name: 'Recent',
        archived_at: '2025-01-01',
        enrollment_term_id: t2,
      });

      const rows = reader.getArchivedSortedByTermEnd();

      expect(rows.map((r) => r.name)).toEqual(['Recent', 'Old']);
    });

    test('puts courses without a matching term last (NULLS LAST), then by name', () => {
      const t1 = seedEnrollmentTerm(db, {
        external_id: '100',
        name: 'Fall 2024',
        end_at: '2024-12-15T00:00:00Z',
      });

      seedCourse(db, {
        id: 1,
        name: 'WithTerm',
        archived_at: '2025-01-01',
        enrollment_term_id: t1,
      });
      seedCourse(db, { id: 2, name: 'Beta', archived_at: '2024-01-01' });
      seedCourse(db, { id: 3, name: 'Alpha', archived_at: '2024-01-01' });

      const rows = reader.getArchivedSortedByTermEnd();

      expect(rows.map((r) => r.name)).toEqual(['WithTerm', 'Alpha', 'Beta']);
    });

    test('returns empty array when no archived courses', () => {
      seedCourse(db, { id: 1 }); // active

      expect(reader.getArchivedSortedByTermEnd()).toEqual([]);
    });
  });

  describe('getSettingsById', () => {
    test('returns per-course settings (schema defaults)', () => {
      seedCourse(db, { id: 1 });

      expect(reader.getSettingsById(1)).toEqual({
        auto_assign_due_date: null,
        allow_guessed_override: 1,
      });
    });

    test('reflects updated setting values', () => {
      seedCourse(db, { id: 1 });
      db.executeWrite(
        `UPDATE courses SET auto_assign_due_date = 1, allow_guessed_override = 0 WHERE id = 1`,
        []
      );

      expect(reader.getSettingsById(1)).toEqual({
        auto_assign_due_date: 1,
        allow_guessed_override: 0,
      });
    });

    test('returns null for a missing course', () => {
      expect(reader.getSettingsById(9999)).toBeNull();
    });
  });
});

// =============================================================================
// Seed helpers
// =============================================================================

function seedCourse(
  db: Database,
  data: {
    id: number;
    code?: string;
    name?: string;
    is_hidden?: number;
    deleted_at?: string | null;
    archived_at?: string | null;
    enrollment_term_id?: number | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO courses (
      id, external_id, code, name, is_hidden, deleted_at, archived_at,
      enrollment_term_id, target_grade
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      `ext_${data.id}`,
      data.code ?? `COURSE${data.id}`,
      data.name ?? `Course ${data.id}`,
      data.is_hidden ?? 0,
      data.deleted_at ?? null,
      data.archived_at ?? null,
      data.enrollment_term_id ?? null,
      85,
    ]
  );
}

function seedEnrollmentTerm(
  db: Database,
  data: {
    external_id: string;
    name: string;
    end_at: string;
  }
): number {
  const result = db.executeWrite(
    `INSERT INTO enrollment_terms (external_id, name, end_at) VALUES (?, ?, ?)`,
    [data.external_id, data.name, data.end_at]
  );
  return Number(result.lastInsertRowid);
}
