import { PriorityEngine } from '../../src/layers/l3-intelligence/PriorityEngine';
import { PriorityConfig } from '../../src/layers/l3-intelligence/PriorityConfig';
import { Database } from '../../src/layers/l1-persistence/Database';
import { MigrationRunner, coreMigrations } from '../../src/layers/l1-persistence/MigrationRunner';
import path from 'path';
import fs from 'fs';

describe('PriorityEngine', () => {
  let db: Database;
  let engine: PriorityEngine;
  let config: PriorityConfig;
  const testDbPath = path.join(__dirname, '../../test-data/priority-engine-test.db');

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
      name: 'Intro to Computer Science',
      current_grade: 85,
      target_grade: 90,
      total_weight: 100,
    });

    config = new PriorityConfig();
    engine = new PriorityEngine(db, config);
  });

  afterEach(() => {
    db.close();
  });

  describe('calculateAll', () => {
    it('should return empty queues when no tasks exist', () => {
      const result = engine.calculateAll();

      expect(result.queues.pinned).toHaveLength(0);
      expect(result.queues.active).toHaveLength(0);
      expect(result.queues.overdue).toHaveLength(0);
      expect(result.queues.deadlines).toHaveLength(0);
    });

    it('should place active tasks in active queue', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Assignment 1',
        due_at: futureDate,
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();

      expect(result.queues.active).toHaveLength(1);
      expect(result.queues.active[0].taskId).toBeDefined();
    });

    it('should place overdue tasks in overdue queue', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Late Assignment',
        due_at: pastDate,
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();

      expect(result.queues.overdue).toHaveLength(1);
    });

    it('should place tasks without weight in deadlines queue', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Ungraded Activity',
        due_at: futureDate,
        points_possible: 0,
        weight: null,
        is_completed: 0,
      });

      const result = engine.calculateAll();

      expect(result.queues.deadlines).toHaveLength(1);
    });

    it('should sort tasks by priority score descending', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;

      // Create tasks with different urgencies
      const urgentDate = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6 hours
      const normalDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 3 days

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Urgent Assignment',
        due_at: urgentDate,
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      db.upsert('tasks', {
        external_id: 'task2',
        course_id: courseId,
        title: 'Normal Assignment',
        due_at: normalDate,
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();

      expect(result.queues.active).toHaveLength(2);
      // Urgent task should have higher score (first in list)
      expect(result.queues.active[0].finalScore).toBeGreaterThan(result.queues.active[1].finalScore);
    });

    it('should emit priorities-calculated event', () => {
      const handler = jest.fn();
      engine.on('priorities-calculated', handler);

      engine.calculateAll();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          queues: expect.any(Object),
          calculatedAt: expect.any(Date),
        })
      );
    });
  });

  describe('calculateTaskPriority', () => {
    it('should calculate urgency factor for approaching deadline', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const urgentDate = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

      db.upsert('tasks', {
        external_id: 'urgent-task',
        course_id: courseId,
        title: 'Urgent Task',
        due_at: urgentDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();
      const explanation = result.queues.active[0];

      expect(explanation.factors.some((f) => f.id === 'urgency')).toBe(true);
      const urgencyFactor = explanation.factors.find((f) => f.id === 'urgency');
      expect(urgencyFactor?.impact).toBeGreaterThan(0);
    });

    it('should calculate weight factor based on task weight', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'heavy-task',
        course_id: courseId,
        title: 'Major Project',
        due_at: futureDate.toISOString(),
        points_possible: 100,
        weight: 25,
        is_completed: 0,
      });

      const result = engine.calculateAll();
      const explanation = result.queues.active[0];

      expect(explanation.factors.some((f) => f.id === 'weight')).toBe(true);
      const weightFactor = explanation.factors.find((f) => f.id === 'weight');
      expect(weightFactor?.description).toContain('25%');
    });

    it('should calculate course gap factor when below target', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // Update course to have remaining weight so target is achievable
      db.executeWrite('UPDATE courses SET total_weight = 75 WHERE id = ?', [courseId], 'courses');

      // Course is at 85%, target is 90%, with 25% remaining weight
      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Assignment',
        due_at: futureDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();
      const explanation = result.queues.active[0];

      expect(explanation.factors.some((f) => f.id === 'course_gap')).toBe(true);
      const gapFactor = explanation.factors.find((f) => f.id === 'course_gap');
      // Should indicate below target when achievable
      expect(gapFactor?.description).toMatch(/below target|gap/i);
    });

    it('should include grade impact analysis', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Assignment',
        due_at: futureDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();
      const explanation = result.queues.active[0];

      expect(explanation.gradeImpact).toBeDefined();
      expect(explanation.gradeImpact.currentGrade).toBe(85);
      expect(explanation.gradeImpact.targetGrade).toBe(90);
      expect(explanation.gradeImpact.gapToTarget).toBe(5);
    });
  });

  describe('pinTask / unpinTask', () => {
    it('should place pinned tasks in pinned queue', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Priority Task',
        due_at: futureDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'task1'")!.id;

      engine.pinTask(taskId);
      const result = engine.calculateAll();

      expect(result.queues.pinned).toHaveLength(1);
      expect(result.queues.active).toHaveLength(0);
    });

    it('should emit task-pinned event', () => {
      const handler = jest.fn();
      engine.on('task-pinned', handler);

      engine.pinTask(999);

      expect(handler).toHaveBeenCalledWith({ taskId: 999 });
    });

    it('should move task back to normal queue when unpinned', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Task',
        due_at: futureDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'task1'")!.id;

      engine.pinTask(taskId);
      engine.unpinTask(taskId);
      const result = engine.calculateAll();

      expect(result.queues.pinned).toHaveLength(0);
      expect(result.queues.active).toHaveLength(1);
    });
  });

  describe('dismissNotice', () => {
    it('should track dismissed notices', () => {
      const handler = jest.fn();
      engine.on('notice-dismissed', handler);

      engine.dismissNotice(1, 'estimated_submission');

      expect(handler).toHaveBeenCalledWith({
        taskId: 1,
        noticeType: 'estimated_submission',
      });
    });
  });

  describe('getTaskExplanation', () => {
    it('should return explanation for specific task', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'task1',
        course_id: courseId,
        title: 'Specific Task',
        due_at: futureDate.toISOString(),
        points_possible: 100,
        weight: 15,
        is_completed: 0,
      });

      const taskId = db.executeReadOne<{ id: number }>("SELECT id FROM tasks WHERE external_id = 'task1'")!.id;

      const explanation = engine.getTaskExplanation(taskId);

      expect(explanation).not.toBeNull();
      expect(explanation?.taskId).toBe(taskId);
      expect(explanation?.factors.some((f) => f.id === 'weight')).toBe(true);
    });

    it('should return null for non-existent task', () => {
      const explanation = engine.getTaskExplanation(99999);
      expect(explanation).toBeNull();
    });
  });

  describe('notices', () => {
    it('should generate estimated submission notice for old overdue tasks', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      // Task due 72 hours ago (past assumeSubmittedAfterHours threshold of 48)
      const oldPastDate = new Date(Date.now() - 72 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'old-task',
        course_id: courseId,
        title: 'Old Incomplete Task',
        due_at: oldPastDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();

      expect(result.notices.some((n) => n.type === 'estimated_submission')).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use custom config when provided', () => {
      const customConfig = new PriorityConfig({
        defaultTargetGrade: 95,
      });
      const customEngine = new PriorityEngine(db, customConfig);

      expect(customEngine.getConfig().getConfig().defaultTargetGrade).toBe(95);
    });

    it('should use default config when not provided', () => {
      const defaultEngine = new PriorityEngine(db);
      expect(defaultEngine.getConfig().getConfig().defaultTargetGrade).toBe(85);
    });
  });

  describe('refresh timing', () => {
    it('should set next refresh based on most urgent task', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const urgentDate = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

      db.upsert('tasks', {
        external_id: 'urgent-task',
        course_id: courseId,
        title: 'Urgent Task',
        due_at: urgentDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const now = new Date();
      const result = engine.calculateAll(now);

      // Should be scheduled for ~30 minutes (halfHourly tier for <24h tasks)
      const refreshMs = result.nextRefreshAt.getTime() - now.getTime();
      expect(refreshMs).toBeLessThanOrEqual(31 * 60 * 1000); // ~30 minutes with buffer
    });
  });

  describe('summary generation', () => {
    it('should generate appropriate summary for critical tasks', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const urgentDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

      db.upsert('tasks', {
        external_id: 'critical-task',
        course_id: courseId,
        title: 'Critical Task',
        due_at: urgentDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();
      const explanation = result.queues.active[0];

      expect(explanation.summary.toLowerCase()).toContain('critical');
    });

    it('should generate appropriate summary for overdue tasks', () => {
      const courseId = db.executeReadOne<{ id: number }>('SELECT id FROM courses')!.id;
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      db.upsert('tasks', {
        external_id: 'overdue-task',
        course_id: courseId,
        title: 'Overdue Task',
        due_at: pastDate.toISOString(),
        points_possible: 100,
        weight: 10,
        is_completed: 0,
      });

      const result = engine.calculateAll();
      const explanation = result.queues.overdue[0];

      expect(explanation.summary.toLowerCase()).toContain('past due');
    });
  });
});
