import { DependencyResolver } from '../../src/layers/l3-intelligence/DependencyResolver';
import { Database } from '../../src/layers/l1-persistence/Database';
import { MigrationRunner, coreMigrations } from '../../src/layers/l1-persistence/MigrationRunner';
import { TaskForPriority } from '../../src/layers/l3-intelligence/types';
import path from 'path';
import fs from 'fs';

describe('DependencyResolver', () => {
  let db: Database;
  let resolver: DependencyResolver;
  const testDbPath = path.join(__dirname, '../../test-data/dependency-resolver-test.db');

  let courseId: number;

  beforeAll(() => {
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clean up previous test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }

    // Initialize database
    db = new Database({ dbPath: testDbPath });
    db.initialize();

    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    // Create test course
    db.upsert('courses', {
      external_id: '12345',
      code: 'CSC101',
      name: 'Intro to CS',
          });

    courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;

    resolver = new DependencyResolver(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('resolve with no module association', () => {
    it('should return prerequisites met when task has no module', () => {
      // Create task without module item
      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Standalone Task',
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'task1'")!.id;

      const task: TaskForPriority = {
        id: taskId,
        courseId,
        title: 'Standalone Task',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      expect(result.prerequisitesMet).toBe(true);
      expect(result.dependency).toBeNull();
      expect(result.factor).toBeNull();
      expect(result.blockingItems).toHaveLength(0);
    });
  });

  describe('resolve with non-sequential module', () => {
    it('should return prerequisites met for module without sequential requirement', () => {
      // Create module without sequential progress
      db.upsert('modules', {
        external_id: 'mod1',
        course_id: courseId,
        name: 'Week 1',
        position: 1,
        require_sequential_progress: 0,
        published: 1,
      });

      const moduleId = db.executeReadOne<{ id: number }>("SELECT id FROM modules WHERE external_id = 'mod1'")!.id;

      // Create task with external_id
      db.upsert('tasks', {
        external_id: 'assign1',
        course_id: courseId,
        title: 'Assignment 1',
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'assign1'")!.id;

      // Create module item linking to task
      db.upsert('module_items', {
        external_id: 'item1',
        module_id: moduleId,
        title: 'Assignment 1',
        item_type: 'Assignment',
        content_id: 'assign1',
        position: 1,
        published: 1,
      });

      const task: TaskForPriority = {
        id: taskId,
        courseId,
        title: 'Assignment 1',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      expect(result.prerequisitesMet).toBe(true);
    });
  });

  describe('resolve with sequential module', () => {
    let moduleId: number;

    beforeEach(() => {
      // Create module WITH sequential progress
      db.upsert('modules', {
        external_id: 'seq-mod',
        course_id: courseId,
        name: 'Sequential Module',
        position: 1,
        require_sequential_progress: 1,
        published: 1,
      });

      moduleId = db.executeReadOne<{ id: number }>("SELECT id FROM modules WHERE external_id = 'seq-mod'")!.id;
    });

    it('should return prerequisites met when no prior items exist', () => {
      // Create task as first item
      db.upsert('tasks', {
        external_id: 'first-task',
        course_id: courseId,
        title: 'First Task',
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'first-task'")!.id;

      // Module item at position 1 (first)
      db.upsert('module_items', {
        external_id: 'first-item',
        module_id: moduleId,
        title: 'First Task',
        item_type: 'Assignment',
        content_id: 'first-task',
        position: 1,
        published: 1,
      });

      const task: TaskForPriority = {
        id: taskId,
        courseId,
        title: 'First Task',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      expect(result.prerequisitesMet).toBe(true);
    });

    it('should return blocked when prior items are incomplete', () => {
      // Create first task (prerequisite) - NOT completed
      db.upsert('tasks', {
        external_id: 'prereq-task',
        course_id: courseId,
        title: 'Prerequisite Task',
        is_completed: 0,
      });

      // Create second task (depends on first)
      db.upsert('tasks', {
        external_id: 'dependent-task',
        course_id: courseId,
        title: 'Dependent Task',
        is_completed: 0,
      });

      const dependentTaskId = db.executeReadOne<{ id: number }>(
        "SELECT id FROM tasks WHERE external_id = 'dependent-task'"
      )!.id;

      // First module item with must_submit requirement
      db.upsert('module_items', {
        external_id: 'prereq-item',
        module_id: moduleId,
        title: 'Prerequisite Task',
        item_type: 'Assignment',
        content_id: 'prereq-task',
        position: 1,
        completion_requirement: JSON.stringify({ type: 'must_submit' }),
        published: 1,
      });

      // Second module item (our task)
      db.upsert('module_items', {
        external_id: 'dependent-item',
        module_id: moduleId,
        title: 'Dependent Task',
        item_type: 'Assignment',
        content_id: 'dependent-task',
        position: 2,
        published: 1,
      });

      const task: TaskForPriority = {
        id: dependentTaskId,
        courseId,
        title: 'Dependent Task',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      expect(result.prerequisitesMet).toBe(false);
      expect(result.blockingItems).toHaveLength(1);
      expect(result.blockingItems[0].itemTitle).toBe('Prerequisite Task');
      expect(result.factor).not.toBeNull();
      expect(result.factor?.id).toBe('dependency_blocked');
    });

    it('should return unblocked when prior items are complete', () => {
      // Create first task (prerequisite) - COMPLETED
      db.upsert('tasks', {
        external_id: 'completed-prereq',
        course_id: courseId,
        title: 'Completed Prerequisite',
        is_completed: 1,
      });

      // Create second task
      db.upsert('tasks', {
        external_id: 'next-task',
        course_id: courseId,
        title: 'Next Task',
        is_completed: 0,
      });

      const nextTaskId = db.executeReadOne<{ id: number }>(
        "SELECT id FROM tasks WHERE external_id = 'next-task'"
      )!.id;

      // First item with must_submit requirement (completed)
      db.upsert('module_items', {
        external_id: 'completed-item',
        module_id: moduleId,
        title: 'Completed Prerequisite',
        item_type: 'Assignment',
        content_id: 'completed-prereq',
        position: 1,
        completion_requirement: JSON.stringify({ type: 'must_submit' }),
        published: 1,
      });

      // Second item
      db.upsert('module_items', {
        external_id: 'next-item',
        module_id: moduleId,
        title: 'Next Task',
        item_type: 'Assignment',
        content_id: 'next-task',
        position: 2,
        published: 1,
      });

      const task: TaskForPriority = {
        id: nextTaskId,
        courseId,
        title: 'Next Task',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      expect(result.prerequisitesMet).toBe(true);
      expect(result.blockingItems).toHaveLength(0);
    });
  });

  describe('resolveAll', () => {
    it('should resolve dependencies for multiple tasks', () => {
      db.upsert('tasks', {
        external_id: 'task-a',
        course_id: courseId,
        title: 'Task A',
        is_completed: 0,
      });

      db.upsert('tasks', {
        external_id: 'task-b',
        course_id: courseId,
        title: 'Task B',
        is_completed: 0,
      });

      const taskA = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'task-a'")!;
      const taskB = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'task-b'")!;

      const tasks: TaskForPriority[] = [
        {
          id: taskA.id,
          courseId,
          title: 'Task A',
          dueAt: null,
          unlockAt: null,
          pointsPossible: null,
          weight: null,
          isCompleted: false,
          isPinned: false,
          grade: null,
          submittedAt: null,
        },
        {
          id: taskB.id,
          courseId,
          title: 'Task B',
          dueAt: null,
          unlockAt: null,
          pointsPossible: null,
          weight: null,
          isCompleted: false,
          isPinned: false,
          grade: null,
          submittedAt: null,
        },
      ];

      const results = resolver.resolveAll(tasks, courseId);

      expect(results.size).toBe(2);
      expect(results.get(taskA.id)?.prerequisitesMet).toBe(true);
      expect(results.get(taskB.id)?.prerequisitesMet).toBe(true);
    });
  });

  describe('getBlockedTasks', () => {
    it('should return list of blocked tasks', () => {
      // Create sequential module
      db.upsert('modules', {
        external_id: 'blocking-mod',
        course_id: courseId,
        name: 'Blocking Module',
        position: 1,
        require_sequential_progress: 1,
        published: 1,
      });

      const moduleId = db.executeReadOne<{ id: number }>("SELECT id FROM modules WHERE external_id = 'blocking-mod'")!
        .id;

      // First task (not completed)
      db.upsert('tasks', {
        external_id: 'blocker',
        course_id: courseId,
        title: 'Blocker',
        is_completed: 0,
      });

      // Second task (blocked)
      db.upsert('tasks', {
        external_id: 'blocked',
        course_id: courseId,
        title: 'Blocked Task',
        is_completed: 0,
      });

      // Module items
      db.upsert('module_items', {
        external_id: 'blocker-item',
        module_id: moduleId,
        title: 'Blocker',
        item_type: 'Assignment',
        content_id: 'blocker',
        position: 1,
        completion_requirement: JSON.stringify({ type: 'must_submit' }),
        published: 1,
      });

      db.upsert('module_items', {
        external_id: 'blocked-item',
        module_id: moduleId,
        title: 'Blocked Task',
        item_type: 'Assignment',
        content_id: 'blocked',
        position: 2,
        published: 1,
      });

      const blockedTasks = resolver.getBlockedTasks(courseId);

      expect(blockedTasks.length).toBe(1);
      expect(blockedTasks[0].taskTitle).toBe('Blocked Task');
      expect(blockedTasks[0].blockingItems).toHaveLength(1);
    });
  });

  describe('clearCache', () => {
    it('should clear internal caches', () => {
      // Just ensure it doesn't throw
      expect(() => resolver.clearCache()).not.toThrow();
    });
  });

  describe('completion requirement types', () => {
    let moduleId: number;

    beforeEach(() => {
      db.upsert('modules', {
        external_id: 'req-mod',
        course_id: courseId,
        name: 'Requirements Module',
        position: 1,
        require_sequential_progress: 1,
        published: 1,
      });

      moduleId = db.executeReadOne<{ id: number }>("SELECT id FROM modules WHERE external_id = 'req-mod'")!.id;
    });

    it('should treat items without completion requirement as complete', () => {
      db.upsert('tasks', {
        external_id: 'target-task',
        course_id: courseId,
        title: 'Target Task',
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'target-task'")!.id;

      // Prior item with NO completion requirement
      db.upsert('module_items', {
        external_id: 'no-req-item',
        module_id: moduleId,
        title: 'No Requirement',
        item_type: 'Page',
        position: 1,
        published: 1,
        // No completion_requirement
      });

      db.upsert('module_items', {
        external_id: 'target-item',
        module_id: moduleId,
        title: 'Target Task',
        item_type: 'Assignment',
        content_id: 'target-task',
        position: 2,
        published: 1,
      });

      const task: TaskForPriority = {
        id: taskId,
        courseId,
        title: 'Target Task',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      expect(result.prerequisitesMet).toBe(true);
    });

    it('should check min_score requirement', () => {
      // Task with score below minimum
      db.upsert('tasks', {
        external_id: 'low-score-task',
        course_id: courseId,
        title: 'Low Score Task',
        is_completed: 1,
        grade: 50,
        points_possible: 100, // 50% score
      });

      db.upsert('tasks', {
        external_id: 'next-task',
        course_id: courseId,
        title: 'Next Task',
        is_completed: 0,
      });

      const nextTaskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'next-task'")!.id;

      // Item requiring min score of 70
      db.upsert('module_items', {
        external_id: 'min-score-item',
        module_id: moduleId,
        title: 'Low Score Task',
        item_type: 'Assignment',
        content_id: 'low-score-task',
        position: 1,
        completion_requirement: JSON.stringify({ type: 'min_score', min_score: 70 }),
        published: 1,
      });

      db.upsert('module_items', {
        external_id: 'next-item',
        module_id: moduleId,
        title: 'Next Task',
        item_type: 'Assignment',
        content_id: 'next-task',
        position: 2,
        published: 1,
      });

      const task: TaskForPriority = {
        id: nextTaskId,
        courseId,
        title: 'Next Task',
        dueAt: null,
        unlockAt: null,
        pointsPossible: null,
        weight: null,
        isCompleted: false,
        isPinned: false,
        grade: null,
        submittedAt: null,
      };

      const result = resolver.resolve(task, courseId);

      // Should be blocked because 50% < 70% required
      expect(result.prerequisitesMet).toBe(false);
    });
  });
});
