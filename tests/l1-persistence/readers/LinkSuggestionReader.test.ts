/**
 * LinkSuggestionReader tests (ADR-0007).
 *
 * Verifies the read surface for `link_suggestions`: status-filtered join
 * projection (with task titles + course name), status counts, and
 * single-id lookup.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { LinkSuggestionReader } from '../../../src/layers/l1-persistence/readers/LinkSuggestionReader';

let taskCounter = 1;

function seedCourse(db: Database, id: number, name: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, name, name]
  );
}

function seedTask(
  db: Database,
  opts: { courseId: number; title: string; sourceType?: 'canvas' | 'user' }
): number {
  const result = db.executeWrite(
    `INSERT INTO tasks (course_id, external_id, source_type, title)
     VALUES (?, ?, ?, ?)`,
    [opts.courseId, `task_ext_${taskCounter++}`, opts.sourceType ?? 'user', opts.title]
  );
  return Number(result.lastInsertRowid);
}

function seedSuggestion(
  db: Database,
  opts: {
    userTaskId: number;
    canvasTaskId: number;
    confidence?: number;
    status?: string;
    createdAt?: string;
  }
): number {
  const result = db.executeWrite(
    `INSERT INTO link_suggestions (user_task_id, canvas_task_id, confidence, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      opts.userTaskId,
      opts.canvasTaskId,
      opts.confidence ?? 0.8,
      opts.status ?? 'pending',
      opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    ]
  );
  return Number(result.lastInsertRowid);
}

describe('LinkSuggestionReader', () => {
  let db: Database;
  let reader: LinkSuggestionReader;
  let userTaskId: number;
  let canvasTaskId: number;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    seedCourse(db, 1, 'CS101');
    userTaskId = seedTask(db, { courseId: 1, title: 'My Essay', sourceType: 'user' });
    canvasTaskId = seedTask(db, {
      courseId: 1,
      title: 'Essay Assignment',
      sourceType: 'canvas',
    });
    reader = new LinkSuggestionReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getByStatusWithTasks', () => {
    test('joins task titles + course name, defaults to pending', () => {
      seedSuggestion(db, { userTaskId, canvasTaskId, confidence: 0.9 });

      const rows = reader.getByStatusWithTasks();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_task_id: userTaskId,
        canvas_task_id: canvasTaskId,
        user_task_title: 'My Essay',
        canvas_task_title: 'Essay Assignment',
        course_id: 1,
        course_name: 'CS101',
        status: 'pending',
      });
    });

    test('orders by confidence DESC then created_at DESC', () => {
      const c2 = seedTask(db, { courseId: 1, title: 'C2', sourceType: 'canvas' });
      seedSuggestion(db, { userTaskId, canvasTaskId, confidence: 0.5 });
      seedSuggestion(db, { userTaskId, canvasTaskId: c2, confidence: 0.95 });

      const rows = reader.getByStatusWithTasks('pending');

      expect(rows.map((r) => r.confidence)).toEqual([0.95, 0.5]);
    });

    test('filters by the requested status', () => {
      seedSuggestion(db, { userTaskId, canvasTaskId, status: 'accepted' });

      expect(reader.getByStatusWithTasks('pending')).toHaveLength(0);
      expect(reader.getByStatusWithTasks('accepted')).toHaveLength(1);
    });
  });

  describe('countByStatus', () => {
    test('counts only the requested status (default pending)', () => {
      const c2 = seedTask(db, { courseId: 1, title: 'C2', sourceType: 'canvas' });
      seedSuggestion(db, { userTaskId, canvasTaskId, status: 'pending' });
      seedSuggestion(db, { userTaskId, canvasTaskId: c2, status: 'rejected' });

      expect(reader.countByStatus()).toBe(1);
      expect(reader.countByStatus('rejected')).toBe(1);
    });

    test('returns 0 when none match', () => {
      expect(reader.countByStatus('pending')).toBe(0);
    });
  });

  describe('getById', () => {
    test('returns the raw suggestion row', () => {
      const id = seedSuggestion(db, { userTaskId, canvasTaskId, confidence: 0.7 });

      const row = reader.getById(id);

      expect(row?.user_task_id).toBe(userTaskId);
      expect(row?.confidence).toBe(0.7);
    });

    test('returns null when missing', () => {
      expect(reader.getById(9999)).toBeNull();
    });
  });
});
