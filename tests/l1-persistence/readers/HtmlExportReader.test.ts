/**
 * HtmlExportReader tests (ADR-0007).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { HtmlExportReader } from '../../../src/layers/l1-persistence/readers/HtmlExportReader';

function seedCourse(db: Database, id: number): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, target_grade) VALUES (?, ?, ?, ?, 85)`,
    [id, `ext_${id}`, `C${id}`, `Course ${id}`]
  );
}

function seedExport(
  db: Database,
  opts: {
    courseId: number;
    sourceType?: string;
    sourceId: string;
    localPath?: string | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO html_exports (course_id, source_type, source_id, title, local_path)
     VALUES (?, ?, ?, ?, ?)`,
    [
      opts.courseId,
      opts.sourceType ?? 'page',
      opts.sourceId,
      `Title ${opts.sourceId}`,
      opts.localPath === undefined ? '/files/x.html' : opts.localPath,
    ]
  );
}

describe('HtmlExportReader', () => {
  let db: Database;
  let reader: HtmlExportReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    seedCourse(db, 1);
    seedCourse(db, 2);
    reader = new HtmlExportReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getByContext', () => {
    test('returns the matching row', () => {
      seedExport(db, {
        courseId: 1,
        sourceType: 'page',
        sourceId: '7',
        localPath: '/p.html',
      });

      const row = reader.getByContext(1, 'page', '7');

      expect(row?.local_path).toBe('/p.html');
    });

    test('returns null when no match', () => {
      expect(reader.getByContext(1, 'page', 'nope')).toBeNull();
    });
  });

  describe('getByCourseWithPath', () => {
    test('returns only rows with a non-null local_path, scoped to the course', () => {
      seedExport(db, { courseId: 1, sourceId: 'a', localPath: '/a.html' });
      seedExport(db, { courseId: 1, sourceId: 'b', localPath: null });
      seedExport(db, { courseId: 2, sourceId: 'c', localPath: '/c.html' });

      const rows = reader.getByCourseWithPath(1);

      expect(rows.map((r) => r.source_id)).toEqual(['a']);
    });

    test('returns empty when the course has no materialized exports', () => {
      expect(reader.getByCourseWithPath(1)).toEqual([]);
    });
  });
});
