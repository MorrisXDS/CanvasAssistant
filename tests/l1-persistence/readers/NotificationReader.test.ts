/**
 * NotificationReader tests (ADR-0007 PR-E).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { NotificationReader } from '../../../src/layers/l1-persistence/readers/NotificationReader';

describe('NotificationReader', () => {
  let db: Database;
  let reader: NotificationReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');
    reader = new NotificationReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getById', () => {
    test('returns the row when it exists', () => {
      const id = seedNotification(db, { courseId: 1, title: 'Hello' });
      const row = reader.getById(id);
      expect(row?.title).toBe('Hello');
    });

    test('returns null when id is unknown', () => {
      expect(reader.getById(99999)).toBeNull();
    });

    test('returns system notifications (course_id IS NULL)', () => {
      const id = seedNotification(db, { courseId: null, title: 'System' });
      expect(reader.getById(id)?.course_id).toBeNull();
    });
  });

  describe('getByCourseId', () => {
    test('returns notifications for one course, newest first', () => {
      seedNotification(db, {
        courseId: 1,
        title: 'old',
        publishedAt: '2026-01-01T00:00:00Z',
      });
      seedNotification(db, {
        courseId: 1,
        title: 'new',
        publishedAt: '2026-05-01T00:00:00Z',
      });
      seedNotification(db, {
        courseId: 1,
        title: 'mid',
        publishedAt: '2026-03-01T00:00:00Z',
      });

      const rows = reader.getByCourseId(1);

      expect(rows.map((r) => r.title)).toEqual(['new', 'mid', 'old']);
    });

    test('excludes other courses', () => {
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: 2, title: 'mat' });

      const rows = reader.getByCourseId(1);

      expect(rows.map((r) => r.title)).toEqual(['cs']);
    });

    test('does not return system notifications', () => {
      seedNotification(db, { courseId: null, title: 'system' });
      seedNotification(db, { courseId: 1, title: 'cs' });

      const rows = reader.getByCourseId(1);

      expect(rows.map((r) => r.title)).toEqual(['cs']);
    });

    test('returns empty array when no rows', () => {
      expect(reader.getByCourseId(1)).toEqual([]);
    });
  });

  describe('getByCourseIdsIncludingSystem', () => {
    test('returns notifications across given courses plus system', () => {
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: 2, title: 'mat' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = reader.getByCourseIdsIncludingSystem([1, 2]);

      expect(rows.map((r) => r.title).sort()).toEqual(['cs', 'mat', 'system']);
    });

    test('excludes courses not in the given id set', () => {
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: 2, title: 'mat' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = reader.getByCourseIdsIncludingSystem([1]);

      expect(rows.map((r) => r.title).sort()).toEqual(['cs', 'system']);
    });

    test('empty courseIds returns only system notifications', () => {
      seedNotification(db, { courseId: 1, title: 'cs' });
      seedNotification(db, { courseId: null, title: 'system' });

      const rows = reader.getByCourseIdsIncludingSystem([]);

      expect(rows.map((r) => r.title)).toEqual(['system']);
    });

    test('orders by published_at DESC across both groups', () => {
      seedNotification(db, {
        courseId: 1,
        title: 'cs-old',
        publishedAt: '2026-01-01T00:00:00Z',
      });
      seedNotification(db, {
        courseId: null,
        title: 'system-new',
        publishedAt: '2026-05-01T00:00:00Z',
      });
      seedNotification(db, {
        courseId: 1,
        title: 'cs-new',
        publishedAt: '2026-03-01T00:00:00Z',
      });

      const rows = reader.getByCourseIdsIncludingSystem([1]);

      expect(rows.map((r) => r.title)).toEqual(['system-new', 'cs-new', 'cs-old']);
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

let notifCounter = 1;

function seedNotification(
  db: Database,
  data: {
    courseId: number | null;
    title?: string;
    publishedAt?: string;
  }
): number {
  const sourceId = `notif_${notifCounter++}`;
  const result = db.executeWrite(
    `INSERT INTO notifications
       (source_type, source_id, course_id, title, message, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.courseId === null ? 'system' : 'canvas',
      sourceId,
      data.courseId,
      data.title ?? `Title ${sourceId}`,
      `Message ${sourceId}`,
      data.publishedAt ?? '2026-01-01T00:00:00Z',
    ]
  );
  return Number(result.lastInsertRowid);
}
