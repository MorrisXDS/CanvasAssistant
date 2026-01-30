/**
 * WorkloadOrchestrator Tests
 *
 * Tests for the L3 workload analysis orchestration layer.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { WorkloadOrchestrator } from '../../../src/layers/l3-intelligence/orchestration/WorkloadOrchestrator';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-workload');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-workload.db');

describe('WorkloadOrchestrator', () => {
  let db: Database;
  let orchestrator: WorkloadOrchestrator;
  let testCourseId: number;

  beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    db = new Database({ dbPath: TEST_DB_PATH, verbose: false });
    db.initialize();

    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    orchestrator = new WorkloadOrchestrator(db);

    // Create test course
    const result = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade, current_grade, total_weight)
       VALUES ('course_1', 'TEST101', 'Test Course', 80, 75, 100)`,
      [],
      'courses'
    );
    testCourseId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultOrchestrator = new WorkloadOrchestrator(db);
      expect(defaultOrchestrator).toBeDefined();
    });

    it('should accept custom config', () => {
      const customOrchestrator = new WorkloadOrchestrator(db, {
        defaultAvailableHoursPerDay: 6,
        defaultLookAheadDays: 21,
      });
      expect(customOrchestrator).toBeDefined();
    });
  });

  describe('analyzeWorkload', () => {
    it('should return distribution with no tasks', () => {
      const result = orchestrator.analyzeWorkload();

      expect(result).toBeDefined();
      expect(result.totalTasks).toBe(0);
      expect(result.totalEstimatedMinutes).toBe(0);
    });

    it('should analyze tasks with due dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task 1', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      const result = orchestrator.analyzeWorkload();

      expect(result.totalTasks).toBe(1);
      expect(result.tasksByCourse).toBeDefined();
    });

    it('should exclude completed tasks', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Completed Task', 20, ?, 1)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      const result = orchestrator.analyzeWorkload();

      expect(result.totalTasks).toBe(0);
    });

    it('should emit workload-calculated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('workload-calculated', eventSpy);

      orchestrator.analyzeWorkload();

      expect(eventSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDailySummary', () => {
    it('should return summary for date range', () => {
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Create tasks across the week
      for (let i = 1; i <= 3; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + i);

        db.executeWrite(
          `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
           VALUES (?, 'canvas', ?, ?, 10, ?, 0)`,
          [`task_${i}`, testCourseId, `Task ${i}`, dueDate.toISOString()],
          'tasks'
        );
      }

      const summary = orchestrator.getDailySummary(today, nextWeek);

      expect(summary).toBeDefined();
      expect(Array.isArray(summary)).toBe(true);
    });
  });

  describe('getDeadlineClusters', () => {
    it('should identify clustered deadlines', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create multiple tasks due on the same day (cluster)
      for (let i = 1; i <= 4; i++) {
        db.executeWrite(
          `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
           VALUES (?, 'canvas', ?, ?, 10, ?, 0)`,
          [`task_${i}`, testCourseId, `Task ${i}`, tomorrow.toISOString()],
          'tasks'
        );
      }

      const clusters = orchestrator.getDeadlineClusters();

      expect(clusters).toBeDefined();
      expect(Array.isArray(clusters)).toBe(true);
    });
  });

  describe('getNeglectedCourses', () => {
    it('should detect courses with no recent work', () => {
      // Create another course with old completed task
      const course2Result = db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES ('course_2', 'OTHER202', 'Other Course', 70)`,
        [],
        'courses'
      );
      const course2Id = course2Result.lastInsertRowid;

      // Add old incomplete task to course 2
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('old_task', 'canvas', ?, 'Old Task', 10, ?, 0)`,
        [course2Id, twoWeeksAgo.toISOString()],
        'tasks'
      );

      const neglected = orchestrator.getNeglectedCourses();

      expect(neglected).toBeDefined();
      expect(Array.isArray(neglected)).toBe(true);
    });
  });

  describe('saveSnapshot', () => {
    it('should save workload snapshot to database', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Test Task', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      orchestrator.saveSnapshot();

      const snapshot = db.executeReadOne<{ id: number }>(
        'SELECT id FROM workload_snapshots ORDER BY id DESC LIMIT 1'
      );

      expect(snapshot).not.toBeNull();
    });

    it('should emit snapshot-saved event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('snapshot-saved', eventSpy);

      orchestrator.saveSnapshot();

      expect(eventSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHistoricalSnapshots', () => {
    it('should retrieve recent snapshots', () => {
      // Save a few snapshots
      orchestrator.saveSnapshot();

      const snapshots = orchestrator.getHistoricalSnapshots(7);

      expect(snapshots).toBeDefined();
      expect(Array.isArray(snapshots)).toBe(true);
    });
  });

  describe('getClusteringScore', () => {
    it('should calculate deadline clustering score', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create clustered tasks
      for (let i = 1; i <= 3; i++) {
        db.executeWrite(
          `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
           VALUES (?, 'canvas', ?, ?, 10, ?, 0)`,
          [`task_${i}`, testCourseId, `Task ${i}`, tomorrow.toISOString()],
          'tasks'
        );
      }

      const score = orchestrator.getClusteringScore();

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCourseBalanceScore', () => {
    it('should calculate course balance score', () => {
      // Create multiple courses with tasks
      const course2Result = db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES ('course_2', 'OTHER202', 'Other Course', 70)`,
        [],
        'courses'
      );

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, due_at, is_completed)
         VALUES ('task_1', 'canvas', ?, 'Task 1', 20, ?, 0)`,
        [testCourseId, tomorrow.toISOString()],
        'tasks'
      );

      const score = orchestrator.getCourseBalanceScore();

      expect(typeof score).toBe('number');
    });
  });
});
