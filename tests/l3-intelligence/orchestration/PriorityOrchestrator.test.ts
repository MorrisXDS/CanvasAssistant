/**
 * PriorityOrchestrator Tests
 *
 * Tests for the L3 priority orchestration layer.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { PriorityOrchestrator } from '../../../src/layers/l3-intelligence/orchestration/PriorityOrchestrator';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-orchestration');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-orchestrator.db');

describe('PriorityOrchestrator', () => {
  let db: Database;
  let orchestrator: PriorityOrchestrator;
  let testCourseId: number;

  beforeAll(() => {
    // Setup test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Remove test database before each test
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize fresh database
    db = new Database({ dbPath: TEST_DB_PATH, verbose: false });
    db.initialize();

    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    // Create orchestrator (disable auto-refresh for tests)
    orchestrator = new PriorityOrchestrator(db, { autoRefresh: false });

    // Create a test course
    const result = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade, current_grade, total_weight)
       VALUES ('test_course_1', 'TEST101', 'Test Course', 80, 75, 100)`,
      [],
      'courses'
    );
    testCourseId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    orchestrator.stop();
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultOrchestrator = new PriorityOrchestrator(db);
      expect(defaultOrchestrator).toBeDefined();
      defaultOrchestrator.stop();
    });

    it('should accept custom config', () => {
      const customOrchestrator = new PriorityOrchestrator(db, {
        refreshIntervalMs: 5000,
        autoRefresh: false,
      });
      expect(customOrchestrator).toBeDefined();
      customOrchestrator.stop();
    });
  });

  describe('calculateAll', () => {
    it('should return empty queues when no tasks exist', () => {
      const result = orchestrator.calculateAll();

      expect(result.queues.pinned).toHaveLength(0);
      expect(result.queues.active).toHaveLength(0);
      expect(result.queues.overdue).toHaveLength(0);
      expect(result.queues.deadlines).toHaveLength(0);
      expect(result.queues.upcoming).toHaveLength(0);
    });

    it('should calculate priority for tasks', () => {
      // Create a test task with due date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      const result = orchestrator.calculateAll();

      // Should have at least one task in a queue
      const totalTasks =
        result.queues.pinned.length +
        result.queues.active.length +
        result.queues.overdue.length +
        result.queues.deadlines.length +
        result.queues.upcoming.length;

      expect(totalTasks).toBe(1);
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it('should skip completed tasks', () => {
      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Completed Task', 20, 1)`,
        [testCourseId],
        'tasks'
      );

      const result = orchestrator.calculateAll();

      const totalTasks =
        result.queues.pinned.length +
        result.queues.active.length +
        result.queues.overdue.length +
        result.queues.deadlines.length +
        result.queues.upcoming.length;

      expect(totalTasks).toBe(0);
    });

    it('should place overdue tasks in overdue queue', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Overdue Task', 20, ?, 0)`,
        [testCourseId, yesterday.toISOString()],
        'tasks'
      );

      const result = orchestrator.calculateAll();

      expect(result.queues.overdue.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit priorities-calculated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('priorities-calculated', eventSpy);

      orchestrator.calculateAll();

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0]).toHaveProperty('queues');
    });

    it('should update priority_score in database', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const insertResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed, priority_score)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );
      const taskId = insertResult.lastInsertRowid;

      orchestrator.calculateAll();

      const task = db.executeReadOne<{ priority_score: number }>(
        'SELECT priority_score FROM tasks WHERE id = ?',
        [taskId]
      );

      // Score should be non-zero after calculation
      expect(task?.priority_score).toBeGreaterThan(0);
    });
  });

  describe('pinTask', () => {
    it('should pin a task', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const insertResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );
      const taskId = insertResult.lastInsertRowid as number;

      orchestrator.pinTask(taskId, true);
      const result = orchestrator.calculateAll();

      // Pinned tasks should be in the pinned queue
      expect(result.queues.pinned.some((t) => t.taskId === taskId)).toBe(true);
    });

    it('should unpin a task', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const insertResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );
      const taskId = insertResult.lastInsertRowid as number;

      // Pin then unpin
      orchestrator.pinTask(taskId, true);
      orchestrator.pinTask(taskId, false);
      const result = orchestrator.calculateAll();

      // Should not be in pinned queue
      expect(result.queues.pinned.some((t) => t.taskId === taskId)).toBe(false);
    });
  });

  describe('getLastResult', () => {
    it('should return null before first calculation', () => {
      expect(orchestrator.getLastResult()).toBeNull();
    });

    it('should return last result after calculation', () => {
      orchestrator.calculateAll();
      const result = orchestrator.getLastResult();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('queues');
      expect(result).toHaveProperty('calculatedAt');
    });
  });

  describe('getExplanation', () => {
    it('should return explanation for task', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const insertResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );
      const taskId = insertResult.lastInsertRowid as number;

      const explanation = orchestrator.getExplanation(taskId);

      expect(explanation).not.toBeNull();
      expect(explanation?.taskId).toBe(taskId);
      expect(explanation).toHaveProperty('finalScore');
      expect(explanation).toHaveProperty('factors');
    });

    it('should return null for non-existent task', () => {
      const explanation = orchestrator.getExplanation(99999);
      expect(explanation).toBeNull();
    });
  });

  describe('recalculateForCourse', () => {
    it('should update priorities for course tasks only', () => {
      // Create task in test course
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed, priority_score)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      // Create another course with task
      const course2Result = db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES ('course_2', 'OTHER202', 'Other Course', 70)`,
        [],
        'courses'
      );
      const course2Id = course2Result.lastInsertRowid;

      const task2Result = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed, priority_score)
         VALUES ('task_2', 'canvas', ?, 'Other Task', 15, ?, 0, 0)`,
        [course2Id, tomorrow.toISOString()],
        'tasks'
      );
      const task2Id = task2Result.lastInsertRowid;

      // Recalculate only for first course
      orchestrator.recalculateForCourse(testCourseId);

      // Task 2 should still have score 0 (not recalculated)
      const task2 = db.executeReadOne<{ priority_score: number }>(
        'SELECT priority_score FROM tasks WHERE id = ?',
        [task2Id]
      );
      expect(task2?.priority_score).toBe(0);
    });

    it('should emit course-priorities-updated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('course-priorities-updated', eventSpy);

      orchestrator.recalculateForCourse(testCourseId);

      expect(eventSpy).toHaveBeenCalledWith({ courseId: testCourseId });
    });
  });

  describe('stop', () => {
    it('should stop auto-refresh timer', () => {
      const autoRefreshOrchestrator = new PriorityOrchestrator(db, {
        autoRefresh: true,
        refreshIntervalMs: 100,
      });

      // Stop should not throw
      expect(() => autoRefreshOrchestrator.stop()).not.toThrow();

      // Calling stop again should be safe
      expect(() => autoRefreshOrchestrator.stop()).not.toThrow();
    });
  });
});
