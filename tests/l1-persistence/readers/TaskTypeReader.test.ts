/**
 * TaskTypeReader tests (ADR-0007).
 *
 * Verifies the read surface for `custom_task_types`: global vs
 * course-scoped listing, display-name ordering, and single-row lookups
 * by name and id.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { TaskTypeReader } from '../../../src/layers/l1-persistence/readers/TaskTypeReader';

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name)
     VALUES (?, ?, ?, ?)`,
    [id, `ext_${id}`, code, `${code} Course`],
    'courses'
  );
}

function seedType(
  db: Database,
  opts: { name: string; displayName?: string; courseId?: number | null }
): void {
  db.executeWrite(
    `INSERT INTO custom_task_types (name, display_name, course_id)
     VALUES (?, ?, ?)`,
    [opts.name, opts.displayName ?? opts.name, opts.courseId ?? null],
    'custom_task_types'
  );
}

describe('TaskTypeReader', () => {
  let db: Database;
  let reader: TaskTypeReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');
    reader = new TaskTypeReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getAll', () => {
    test('returns every row ordered by display_name when no courseId', () => {
      seedType(db, { name: 'zeta', displayName: 'Zeta' });
      seedType(db, { name: 'alpha', displayName: 'Alpha' });
      seedType(db, { name: 'mid', displayName: 'Mid', courseId: 1 });

      const rows = reader.getAll();

      expect(rows.map((r) => r.display_name)).toEqual(['Alpha', 'Mid', 'Zeta']);
    });

    test('returns globals + the given course, excluding other courses', () => {
      seedType(db, { name: 'global', displayName: 'Global', courseId: null });
      seedType(db, { name: 'cs', displayName: 'CS Only', courseId: 1 });
      seedType(db, { name: 'mat', displayName: 'MAT Only', courseId: 2 });

      const rows = reader.getAll(1);

      expect(rows.map((r) => r.display_name).sort()).toEqual(['CS Only', 'Global']);
    });

    test('returns empty array when no types exist', () => {
      expect(reader.getAll()).toEqual([]);
      expect(reader.getAll(1)).toEqual([]);
    });
  });

  describe('getByName', () => {
    test('returns the matching row', () => {
      seedType(db, { name: 'lab_report', displayName: 'Lab Report' });

      const row = reader.getByName('lab_report');

      expect(row?.display_name).toBe('Lab Report');
    });

    test('returns null when no row matches', () => {
      expect(reader.getByName('missing')).toBeNull();
    });
  });

  describe('getById', () => {
    test('returns the matching row', () => {
      seedType(db, { name: 'quiz', displayName: 'Quiz' });
      const inserted = reader.getByName('quiz');

      const row = reader.getById(inserted!.id);

      expect(row?.name).toBe('quiz');
    });

    test('returns null when no row matches', () => {
      expect(reader.getById(9999)).toBeNull();
    });
  });
});
