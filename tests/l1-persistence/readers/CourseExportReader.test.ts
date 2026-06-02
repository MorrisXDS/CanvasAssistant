/**
 * CourseExportReader tests (ADR-0007 — courseExportHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CourseExportReader } from '../../../src/layers/l1-persistence/readers/CourseExportReader';

describe('CourseExportReader', () => {
  let db: Database;
  let reader: CourseExportReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new CourseExportReader(db);

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'e1', 'CS101', 'Intro'), (2, 'e2', 'CS202', 'Adv')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO tasks (id, external_id, course_id, title) VALUES (10, 't1', 1, 'HW1'), (11, 't2', 2, 'HW2')`,
      [],
      'tasks'
    );
  });

  afterEach(() => {
    db.close();
  });

  test('gathers all courses + related rows when no filter', () => {
    const b = reader.gather();
    expect(b.courses.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(b.tasks).toHaveLength(2);
    // full course row is projected (camelCase mapping happens in the handler)
    expect(b.courses[0]).toHaveProperty('external_id');
    expect(b.courses[0]).toHaveProperty('syllabus_body');
  });

  test('filters to the requested course ids', () => {
    const b = reader.gather([1]);
    expect(b.courses.map((c) => c.id)).toEqual([1]);
    expect(b.tasks.map((t) => t.id)).toEqual([10]);
  });

  test('empty course set → all-empty bundle (no invalid IN ())', () => {
    const b = reader.gather([999]);
    expect(b.courses).toEqual([]);
    expect(b.tasks).toEqual([]);
    expect(b.syllabuses).toEqual([]);
  });

  test('non-integer ids are coerced/dropped (no SQL injection via filter)', () => {
    // A junk id mixed in must not break the query or leak SQL.
    const b = reader.gather(['1) OR 1=1 --' as unknown as number, 1]);
    expect(b.courses.map((c) => c.id)).toEqual([1]);
  });
});
