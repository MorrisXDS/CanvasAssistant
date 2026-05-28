/**
 * CanvasFileReader tests (ADR-0008 PR-F.2).
 *
 * Reader returns raw `resources` rows where `type='file'`. Visibility
 * filtering is not the reader's job (per ADR-0007 sub-decision α).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CanvasFileReader } from '../../../src/layers/l1-persistence/readers/CanvasFileReader';

describe('CanvasFileReader', () => {
  let db: Database;
  let reader: CanvasFileReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    seedCourse(db, 1, 'CS101');
    reader = new CanvasFileReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getByExternalId', () => {
    test('returns the row when a file with that external_id exists', () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'lab1.pdf' });

      const row = reader.getByExternalId('111');

      expect(row).not.toBeNull();
      expect(row?.external_id).toBe('111');
      expect(row?.title).toBe('lab1.pdf');
      expect(row?.type).toBe('file');
    });

    test('returns null when no row matches', () => {
      expect(reader.getByExternalId('does-not-exist')).toBeNull();
    });

    test('does not return non-file rows (folders, pages)', () => {
      seedResource(db, { externalId: '222', courseId: 1, type: 'folder', title: 'Labs' });
      seedResource(db, { externalId: '333', courseId: 1, type: 'page', title: 'Home' });

      expect(reader.getByExternalId('222')).toBeNull();
      expect(reader.getByExternalId('333')).toBeNull();
    });
  });

  describe('getByExternalIds', () => {
    test('returns a Map keyed by external_id', () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'a.pdf' });
      seedFile(db, { externalId: '222', courseId: 1, title: 'b.pdf' });

      const map = reader.getByExternalIds(['111', '222']);

      expect(map.size).toBe(2);
      expect(map.get('111')?.title).toBe('a.pdf');
      expect(map.get('222')?.title).toBe('b.pdf');
    });

    test('omits ids that do not exist (caller detects misses by key)', () => {
      seedFile(db, { externalId: '111', courseId: 1 });

      const map = reader.getByExternalIds(['111', '999']);

      expect(map.size).toBe(1);
      expect(map.has('999')).toBe(false);
    });

    test('returns empty Map for empty input', () => {
      expect(reader.getByExternalIds([]).size).toBe(0);
    });

    test('skips non-file rows even when external_id matches', () => {
      seedResource(db, { externalId: '111', courseId: 1, type: 'folder', title: 'F' });

      const map = reader.getByExternalIds(['111']);

      expect(map.size).toBe(0);
    });
  });

  describe('getByCourseIds', () => {
    test('returns files only in the given course ids, ordered by title', () => {
      seedCourse(db, 2, 'MAT201');
      seedFile(db, { externalId: '111', courseId: 1, title: 'cherry.pdf' });
      seedFile(db, { externalId: '222', courseId: 1, title: 'apple.pdf' });
      seedFile(db, { externalId: '333', courseId: 2, title: 'banana.pdf' });

      const rows = reader.getByCourseIds([1]);

      expect(rows.map((r) => r.title)).toEqual(['apple.pdf', 'cherry.pdf']);
    });

    test('returns empty for empty input', () => {
      seedFile(db, { externalId: '111', courseId: 1 });
      expect(reader.getByCourseIds([])).toEqual([]);
    });

    test('does not return folders or pages', () => {
      seedFile(db, { externalId: '111', courseId: 1, title: 'file.pdf' });
      seedResource(db, {
        externalId: '222',
        courseId: 1,
        type: 'folder',
        title: 'Folder',
      });
      seedResource(db, { externalId: '333', courseId: 1, type: 'page', title: 'Page' });

      const rows = reader.getByCourseIds([1]);

      expect(rows).toHaveLength(1);
      expect(rows[0].external_id).toBe('111');
    });
  });
});

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

function seedFile(
  db: Database,
  data: { externalId: string; courseId: number; title?: string }
): void {
  seedResource(db, {
    externalId: data.externalId,
    courseId: data.courseId,
    type: 'file',
    title: data.title ?? `file_${data.externalId}.pdf`,
  });
}

function seedResource(
  db: Database,
  data: { externalId: string; courseId: number; type: string; title: string }
): void {
  db.executeWrite(
    `INSERT INTO resources (external_id, course_id, type, title)
     VALUES (?, ?, ?, ?)`,
    [data.externalId, data.courseId, data.type, data.title]
  );
}
