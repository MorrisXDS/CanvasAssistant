/**
 * TaskReader tests (ADR-0008 PR-D).
 *
 * Reader returns raw `tasks` rows. Visibility filtering and title
 * similarity scoring live elsewhere (per ADR-0007 sub-decision α).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { TaskReader } from '../../../src/layers/l1-persistence/readers/TaskReader';

describe('TaskReader', () => {
  let db: Database;
  let reader: TaskReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');
    reader = new TaskReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getById', () => {
    test('returns the row when it exists', () => {
      const id = seedTask(db, { courseId: 1, title: 'Lab 1' });
      const row = reader.getById(id);
      expect(row).not.toBeNull();
      expect(row?.title).toBe('Lab 1');
    });

    test('returns null when the id does not exist', () => {
      expect(reader.getById(99999)).toBeNull();
    });

    test('returns soft-deleted rows (bypasses deleted_at filter for single-id)', () => {
      const id = seedTask(db, { courseId: 1, title: 'Dead', deletedAt: '2026-01-01' });
      const row = reader.getById(id);
      expect(row).not.toBeNull();
      expect(row?.deleted_at).toBe('2026-01-01');
    });
  });

  describe('getByCourseIds', () => {
    test('returns rows from the given courses, sorted by priority_score DESC', () => {
      seedTask(db, { courseId: 1, title: 'low', priorityScore: 1 });
      seedTask(db, { courseId: 1, title: 'high', priorityScore: 10 });
      seedTask(db, { courseId: 1, title: 'mid', priorityScore: 5 });

      const rows = reader.getByCourseIds([1]);

      expect(rows.map((r) => r.title)).toEqual(['high', 'mid', 'low']);
    });

    test('excludes other courses', () => {
      seedTask(db, { courseId: 1, title: 'in-cs' });
      seedTask(db, { courseId: 2, title: 'in-mat' });

      const rows = reader.getByCourseIds([1]);

      expect(rows.map((r) => r.title)).toEqual(['in-cs']);
    });

    test('returns empty for empty input', () => {
      seedTask(db, { courseId: 1 });
      expect(reader.getByCourseIds([])).toEqual([]);
    });

    test('excludes soft-deleted rows by default', () => {
      seedTask(db, { courseId: 1, title: 'live' });
      seedTask(db, { courseId: 1, title: 'dead', deletedAt: '2026-01-01' });

      const rows = reader.getByCourseIds([1]);

      expect(rows.map((r) => r.title)).toEqual(['live']);
    });

    test('includes soft-deleted rows when opts.includeDeleted=true', () => {
      seedTask(db, { courseId: 1, title: 'live', priorityScore: 2 });
      seedTask(db, {
        courseId: 1,
        title: 'dead',
        deletedAt: '2026-01-01',
        priorityScore: 1,
      });

      const rows = reader.getByCourseIds([1], { includeDeleted: true });

      expect(rows.map((r) => r.title)).toEqual(['live', 'dead']);
    });
  });

  describe('findUnlinkedUserTasksInCourse', () => {
    test('returns user tasks with no external_id', () => {
      seedTask(db, {
        courseId: 1,
        title: 'mine',
        sourceType: 'user',
        externalId: null,
      });

      const rows = reader.findUnlinkedUserTasksInCourse(1);

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('mine');
    });

    test('excludes Canvas-sourced tasks', () => {
      seedTask(db, { courseId: 1, title: 'from-canvas', sourceType: 'canvas' });

      expect(reader.findUnlinkedUserTasksInCourse(1)).toHaveLength(0);
    });

    test('excludes user tasks that have been linked (external_id IS NOT NULL)', () => {
      seedTask(db, {
        courseId: 1,
        title: 'linked',
        sourceType: 'user',
        externalId: 'canvas-123',
      });

      expect(reader.findUnlinkedUserTasksInCourse(1)).toHaveLength(0);
    });

    test('excludes soft-deleted user tasks', () => {
      seedTask(db, {
        courseId: 1,
        title: 'gone',
        sourceType: 'user',
        externalId: null,
        deletedAt: '2026-01-01',
      });

      expect(reader.findUnlinkedUserTasksInCourse(1)).toHaveLength(0);
    });

    test('scopes by course', () => {
      seedTask(db, {
        courseId: 1,
        title: 'cs',
        sourceType: 'user',
        externalId: null,
      });
      seedTask(db, {
        courseId: 2,
        title: 'mat',
        sourceType: 'user',
        externalId: null,
      });

      const rows = reader.findUnlinkedUserTasksInCourse(1);

      expect(rows.map((r) => r.title)).toEqual(['cs']);
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

let extCounter = 1;

function seedTask(
  db: Database,
  data: {
    courseId: number;
    title?: string;
    sourceType?: 'canvas' | 'user';
    externalId?: string | null;
    priorityScore?: number;
    deletedAt?: string | null;
  }
): number {
  const externalId =
    data.externalId === null ? null : (data.externalId ?? `ext_task_${extCounter++}`);
  const result = db.executeWrite(
    `INSERT INTO tasks (course_id, external_id, source_type, title, priority_score, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.courseId,
      externalId,
      data.sourceType ?? 'canvas',
      data.title ?? 'task',
      data.priorityScore ?? 0,
      data.deletedAt ?? null,
    ]
  );
  return Number(result.lastInsertRowid);
}
