/**
 * VisibleDataProvider Tests
 *
 * Tests the centralized visibility rules service.
 */

import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import {
  VisibleDataProvider,
  TermSelection,
} from '../../src/layers/l1-persistence/VisibleDataProvider';

describe('VisibleDataProvider', () => {
  let db: Database;
  let migrationRunner: MigrationRunner;
  let provider: VisibleDataProvider;

  beforeEach(() => {
    // Create in-memory database
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize(); // Create schema_version table before running migrations
    migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    provider = new VisibleDataProvider(db);
  });

  afterEach(() => {
    provider.stop();
    db.close();
  });

  describe('Term Selection', () => {
    test('getTermSelection returns "auto" by default', () => {
      const result = provider.getTermSelection();
      expect(result).toBe('auto');
    });

    test('setTermSelection stores value in database', () => {
      provider.setTermSelection('all');
      expect(provider.getTermSelection()).toBe('all');

      provider.setTermSelection(123);
      expect(provider.getTermSelection()).toBe(123);

      provider.setTermSelection('auto');
      expect(provider.getTermSelection()).toBe('auto');
    });

    test('setTermSelection emits settings-changed event', () => {
      const callback = jest.fn();
      provider.on('settings-changed', callback);

      provider.setTermSelection('all');

      expect(callback).toHaveBeenCalledWith({
        key: 'term_selection',
        value: 'all',
      });
    });

    test('setTermSelection invalidates cache', () => {
      // Seed a visible course
      seedCourse(db, { id: 1, is_hidden: 0 });

      // Set to 'all' first so course is visible (auto mode requires matching enrollment term)
      provider.setTermSelection('all');

      // Prime the cache
      const ids1 = provider.getVisibleCourseIds();
      expect(ids1).toContain(1);

      // Change setting (should invalidate cache)
      provider.setTermSelection('auto');

      // Cache should be invalidated
      const ids2 = provider.getVisibleCourseIds();
      // With auto mode and no enrollment term, course won't be visible
      expect(ids2).not.toContain(1);
    });
  });

  describe('getVisibleCourseIds', () => {
    test('returns empty array when no courses exist', () => {
      const result = provider.getVisibleCourseIds();
      expect(result).toEqual([]);
    });

    test('excludes hidden courses', () => {
      seedCourse(db, { id: 1, is_hidden: 0 });
      seedCourse(db, { id: 2, is_hidden: 1 });
      seedCourse(db, { id: 3, is_hidden: 0 });

      // With 'all' to avoid term filtering
      provider.setTermSelection('all');

      const result = provider.getVisibleCourseIds();
      expect(result).toContain(1);
      expect(result).not.toContain(2);
      expect(result).toContain(3);
    });

    test('excludes soft-deleted courses', () => {
      seedCourse(db, { id: 1, is_hidden: 0, deleted_at: null });
      seedCourse(db, { id: 2, is_hidden: 0, deleted_at: '2024-01-01' });

      provider.setTermSelection('all');

      const result = provider.getVisibleCourseIds();
      expect(result).toContain(1);
      expect(result).not.toContain(2);
    });

    test('filters by specific term when set', () => {
      seedCourse(db, { id: 1, is_hidden: 0, enrollment_term_id: 100 });
      seedCourse(db, { id: 2, is_hidden: 0, enrollment_term_id: 200 });
      seedCourse(db, { id: 3, is_hidden: 0, enrollment_term_id: 100 });

      provider.setTermSelection(100);

      const result = provider.getVisibleCourseIds();
      expect(result).toContain(1);
      expect(result).not.toContain(2);
      expect(result).toContain(3);
    });

    test('auto mode filters by active terms', () => {
      // Create enrollment terms
      const now = new Date();
      const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
      const pastDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      seedEnrollmentTerm(db, {
        external_id: '100',
        name: 'Current Semester',
        end_at: futureDate.toISOString(),
      });
      seedEnrollmentTerm(db, {
        external_id: '200',
        name: 'Past Semester',
        end_at: pastDate.toISOString(),
      });

      seedCourse(db, { id: 1, is_hidden: 0, enrollment_term_id: 100 });
      seedCourse(db, { id: 2, is_hidden: 0, enrollment_term_id: 200 });

      provider.setTermSelection('auto');

      const result = provider.getVisibleCourseIds();
      expect(result).toContain(1);
      expect(result).not.toContain(2);
    });

    test('caches results for performance', () => {
      seedCourse(db, { id: 1, is_hidden: 0 });
      provider.setTermSelection('all');

      // First call
      const result1 = provider.getVisibleCourseIds();

      // Spy on database to verify no query on second call
      const spy = jest.spyOn(db, 'executeRead');

      // Second call should use cache
      const result2 = provider.getVisibleCourseIds();

      expect(result1).toEqual(result2);
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe('getVisibleCourses', () => {
    test('returns full course rows for visible courses', () => {
      seedCourse(db, { id: 1, is_hidden: 0, name: 'Visible Course', code: 'CS101' });
      seedCourse(db, { id: 2, is_hidden: 1, name: 'Hidden Course', code: 'CS102' });

      provider.setTermSelection('all');

      const result = provider.getVisibleCourses();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Visible Course');
      expect(result[0].code).toBe('CS101');
    });

    test('returns empty array when no visible courses', () => {
      seedCourse(db, { id: 1, is_hidden: 1 });

      provider.setTermSelection('all');

      const result = provider.getVisibleCourses();
      expect(result).toEqual([]);
    });
  });

  describe('getVisibleTasks', () => {
    test('returns tasks only from visible courses', () => {
      seedCourse(db, { id: 1, is_hidden: 0 });
      seedCourse(db, { id: 2, is_hidden: 1 });

      seedTask(db, { id: 1, course_id: 1, title: 'Task from visible course' });
      seedTask(db, { id: 2, course_id: 2, title: 'Task from hidden course' });

      provider.setTermSelection('all');

      const result = provider.getVisibleTasks();
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Task from visible course');
    });
  });

  describe('getVisibleIncompleteTasks', () => {
    test('returns only incomplete tasks from visible courses', () => {
      seedCourse(db, { id: 1, is_hidden: 0 });
      seedTask(db, { id: 1, course_id: 1, title: 'Incomplete', is_completed: 0 });
      seedTask(db, { id: 2, course_id: 1, title: 'Complete', is_completed: 1 });

      provider.setTermSelection('all');

      const result = provider.getVisibleIncompleteTasks();
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Incomplete');
    });
  });

  describe('isCourseVisible', () => {
    test('returns true for visible course', () => {
      seedCourse(db, { id: 1, is_hidden: 0 });
      provider.setTermSelection('all');

      expect(provider.isCourseVisible(1)).toBe(true);
    });

    test('returns false for hidden course', () => {
      seedCourse(db, { id: 1, is_hidden: 1 });
      provider.setTermSelection('all');

      expect(provider.isCourseVisible(1)).toBe(false);
    });

    test('returns false for non-existent course', () => {
      expect(provider.isCourseVisible(999)).toBe(false);
    });
  });

  describe('notifyVisibilityChanged', () => {
    test('invalidates cache and emits event', () => {
      const callback = jest.fn();
      provider.on('visibility-changed', callback);

      // Prime the cache
      provider.getVisibleCourseIds();

      // Notify change
      provider.notifyVisibilityChanged(1);

      expect(callback).toHaveBeenCalledWith({ courseId: 1 });
    });

    test('works without specific courseId', () => {
      const callback = jest.fn();
      provider.on('visibility-changed', callback);

      provider.notifyVisibilityChanged();

      expect(callback).toHaveBeenCalledWith({ courseId: undefined });
    });
  });
});

// Helper functions to seed test data
function seedCourse(
  db: Database,
  data: {
    id: number;
    is_hidden?: number;
    deleted_at?: string | null;
    enrollment_term_id?: number | null;
    name?: string;
    code?: string;
  }
) {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, deleted_at, enrollment_term_id, target_grade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      `ext_${data.id}`,
      data.code ?? `COURSE${data.id}`,
      data.name ?? `Course ${data.id}`,
      data.is_hidden ?? 0,
      data.deleted_at ?? null,
      data.enrollment_term_id ?? null,
      85,
    ]
  );
}

function seedTask(
  db: Database,
  data: {
    id: number;
    course_id: number;
    title: string;
    is_completed?: number;
  }
) {
  db.executeWrite(
    `INSERT INTO tasks (id, external_id, course_id, title, is_completed, priority_score)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      `task_ext_${data.id}`,
      data.course_id,
      data.title,
      data.is_completed ?? 0,
      50,
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
) {
  db.executeWrite(
    `INSERT INTO enrollment_terms (external_id, name, end_at)
     VALUES (?, ?, ?)`,
    [data.external_id, data.name, data.end_at]
  );
}
