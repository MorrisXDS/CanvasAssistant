/**
 * CanvasTaskQueueReader tests (ADR-0008 PR-D slice 2).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CanvasTaskQueueReader } from '../../../src/layers/l1-persistence/readers/CanvasTaskQueueReader';

describe('CanvasTaskQueueReader', () => {
  let db: Database;
  let reader: CanvasTaskQueueReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');
    reader = new CanvasTaskQueueReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getByCourseIds', () => {
    test('returns rows from the given courses (no status filter)', () => {
      seedQueue(db, { courseId: 1, externalId: 'a', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'b', status: 'rejected' });
      seedQueue(db, { courseId: 2, externalId: 'c', status: 'pending' });

      const rows = reader.getByCourseIds([1]);

      expect(rows.map((r) => r.external_id).sort()).toEqual(['a', 'b']);
    });

    test('filters by status when provided', () => {
      seedQueue(db, { courseId: 1, externalId: 'p1', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'p2', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'r1', status: 'rejected' });

      const rows = reader.getByCourseIds([1], { status: 'pending' });

      expect(rows.map((r) => r.external_id).sort()).toEqual(['p1', 'p2']);
    });

    test('orders by due_at ASC, first_seen_at ASC (most urgent first)', () => {
      seedQueue(db, {
        courseId: 1,
        externalId: 'late',
        dueAt: '2026-12-01T00:00:00Z',
        firstSeenAt: '2026-01-01T00:00:00Z',
      });
      seedQueue(db, {
        courseId: 1,
        externalId: 'soon',
        dueAt: '2026-06-01T00:00:00Z',
        firstSeenAt: '2026-01-01T00:00:00Z',
      });
      seedQueue(db, {
        courseId: 1,
        externalId: 'nodue-early',
        dueAt: null,
        firstSeenAt: '2026-01-01T00:00:00Z',
      });
      seedQueue(db, {
        courseId: 1,
        externalId: 'nodue-late',
        dueAt: null,
        firstSeenAt: '2026-05-01T00:00:00Z',
      });

      const rows = reader.getByCourseIds([1]);

      // SQLite orders NULL first by default with ASC. So nodue rows come
      // before due rows, tied on due_at NULL → broken by first_seen_at ASC.
      expect(rows.map((r) => r.external_id)).toEqual([
        'nodue-early',
        'nodue-late',
        'soon',
        'late',
      ]);
    });

    test('returns empty for empty input', () => {
      seedQueue(db, { courseId: 1, externalId: 'a' });
      expect(reader.getByCourseIds([])).toEqual([]);
    });
  });

  describe('countByCourseIds', () => {
    test('counts rows across the given courses', () => {
      seedQueue(db, { courseId: 1, externalId: 'a', status: 'pending' });
      seedQueue(db, { courseId: 2, externalId: 'b', status: 'pending' });

      expect(reader.countByCourseIds([1, 2])).toBe(2);
    });

    test('counts only the matching status', () => {
      seedQueue(db, { courseId: 1, externalId: 'p', status: 'pending' });
      seedQueue(db, { courseId: 1, externalId: 'r', status: 'rejected' });

      expect(reader.countByCourseIds([1], { status: 'pending' })).toBe(1);
    });

    test('returns 0 for empty input', () => {
      expect(reader.countByCourseIds([])).toBe(0);
    });

    test('returns 0 when no matching rows', () => {
      seedQueue(db, { courseId: 1, externalId: 'a', status: 'accepted' });
      expect(reader.countByCourseIds([1], { status: 'pending' })).toBe(0);
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

function seedQueue(
  db: Database,
  data: {
    courseId: number;
    externalId: string;
    status?: 'pending' | 'accepted' | 'rejected' | 'merged';
    firstSeenAt?: string;
    dueAt?: string | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO canvas_task_queue (
       course_id, external_id, title, status, due_at, first_seen_at, last_synced_at, canvas_data
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.courseId,
      data.externalId,
      `Title ${data.externalId}`,
      data.status ?? 'pending',
      data.dueAt === undefined ? null : data.dueAt,
      data.firstSeenAt ?? '2026-01-01T00:00:00Z',
      data.firstSeenAt ?? '2026-01-01T00:00:00Z',
      JSON.stringify({ id: data.externalId, name: `Title ${data.externalId}` }),
    ]
  );
}
