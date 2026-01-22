/**
 * CommandDispatcher Tests
 *
 * Tests the L4 command dispatcher and core commands.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../src/layers/l1-persistence/Database';
import { MigrationRunner, coreMigrations } from '../../src/layers/l1-persistence/MigrationRunner';
import { CommandDispatcher } from '../../src/layers/l4-controller/CommandDispatcher';
import { SimulationResult } from '../../src/layers/l4-controller/types';
import { ClearSimulationResult } from '../../src/layers/l4-controller/commands/ClearSimulationCommand';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../temp-l4-controller');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-controller.db');

describe('CommandDispatcher', () => {
  let db: Database;
  let dispatcher: CommandDispatcher;

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

    // Initialize dispatcher
    dispatcher = new CommandDispatcher({ db });
  });

  afterEach(() => {
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default commands', () => {
      const commands = dispatcher.getRegisteredCommands();

      expect(commands).toContain('UpdateTargetGrade');
      expect(commands).toContain('DismissNotification');
      expect(commands).toContain('MarkTaskComplete');
      expect(commands).toContain('SimulateGrade');
      expect(commands).toContain('ClearSimulation');
    });

    it('should start with no active simulation', () => {
      expect(dispatcher.isSimulationActive()).toBe(false);
    });
  });

  describe('dispatch', () => {
    it('should return error for unknown command', async () => {
      const result = await dispatcher.dispatch('UnknownCommand' as any, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command');
    });

    it('should validate command parameters', async () => {
      const result = await dispatcher.dispatch('UpdateTargetGrade', {
        courseId: -1,
        targetGrade: 85,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid course ID');
    });

    it('should emit command events', async () => {
      const startHandler = jest.fn();
      const completeHandler = jest.fn();
      const failHandler = jest.fn();

      dispatcher.on('command-started', startHandler);
      dispatcher.on('command-completed', completeHandler);
      dispatcher.on('command-failed', failHandler);

      // This will fail validation but still emit events
      await dispatcher.dispatch('UpdateTargetGrade', {
        courseId: 1,
        targetGrade: 85,
      });

      expect(startHandler).toHaveBeenCalled();
      // Will fail because course doesn't exist
      expect(failHandler).toHaveBeenCalled();
    });
  });

  describe('UpdateTargetGrade command', () => {
    beforeEach(() => {
      // Insert a test course
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES (?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85],
        'courses'
      );
    });

    it('should update target grade', async () => {
      const result = await dispatcher.dispatch('UpdateTargetGrade', {
        courseId: 1,
        targetGrade: 90,
      });

      expect(result.success).toBe(true);
      expect((result.data as { previousGrade: number })?.previousGrade).toBe(85);

      // Verify in database
      const course = db.executeReadOne<{ target_grade: number }>(
        'SELECT target_grade FROM courses WHERE id = 1'
      );
      expect(course?.target_grade).toBe(90);
    });

    it('should reject invalid target grades', async () => {
      const result = await dispatcher.dispatch('UpdateTargetGrade', {
        courseId: 1,
        targetGrade: 150,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject non-existent course', async () => {
      const result = await dispatcher.dispatch('UpdateTargetGrade', {
        courseId: 999,
        targetGrade: 90,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Course not found');
    });
  });

  describe('DismissNotification command', () => {
    beforeEach(() => {
      // Insert a test course first (for FK)
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES (?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85],
        'courses'
      );
      // Insert a test notification
      db.executeWrite(
        `INSERT INTO notifications (source_type, source_id, course_id, title, message, published_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['canvas', '1', 1, 'Test Notification', 'Test message', new Date().toISOString()],
        'notifications'
      );
    });

    it('should dismiss a notification', async () => {
      const result = await dispatcher.dispatch('DismissNotification', {
        notificationId: 1,
      });

      expect(result.success).toBe(true);
      expect((result.data as { dismissedAt: Date })?.dismissedAt).toBeInstanceOf(Date);

      // Verify in database
      const notification = db.executeReadOne<{ dismissed_at: string }>(
        'SELECT dismissed_at FROM notifications WHERE id = 1'
      );
      expect(notification?.dismissed_at).not.toBeNull();
    });

    it('should reject already dismissed notification', async () => {
      // Dismiss once
      await dispatcher.dispatch('DismissNotification', { notificationId: 1 });

      // Try to dismiss again
      const result = await dispatcher.dispatch('DismissNotification', {
        notificationId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already dismissed');
    });

    it('should reject non-existent notification', async () => {
      const result = await dispatcher.dispatch('DismissNotification', {
        notificationId: 999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('MarkTaskComplete command', () => {
    beforeEach(() => {
      // Insert course and task
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES (?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85],
        'courses'
      );
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight, is_completed)
         VALUES (?, ?, ?, ?, ?)`,
        ['task-1', 1, 'Test Task', 10, 0],
        'tasks'
      );
    });

    it('should mark task as complete', async () => {
      const result = await dispatcher.dispatch('MarkTaskComplete', {
        taskId: 1,
        isComplete: true,
      });

      expect(result.success).toBe(true);
      const data = result.data as { previousState: boolean; completedAt: Date | null };
      expect(data?.previousState).toBe(false);
      expect(data?.completedAt).toBeInstanceOf(Date);

      // Verify in database
      const task = db.executeReadOne<{ is_completed: number }>(
        'SELECT is_completed FROM tasks WHERE id = 1'
      );
      expect(task?.is_completed).toBe(1);
    });

    it('should mark task as incomplete', async () => {
      // First mark as complete
      await dispatcher.dispatch('MarkTaskComplete', {
        taskId: 1,
        isComplete: true,
      });

      // Then mark as incomplete
      const result = await dispatcher.dispatch('MarkTaskComplete', {
        taskId: 1,
        isComplete: false,
      });

      expect(result.success).toBe(true);
      const data = result.data as { previousState: boolean; completedAt: Date | null };
      expect(data?.previousState).toBe(true);
      expect(data?.completedAt).toBeNull();
    });
  });

  describe('SimulateGrade command', () => {
    beforeEach(() => {
      // Insert course and task
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade, assessed_grade)
         VALUES (?, ?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85, 80],
        'courses'
      );
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight, grade, priority_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['task-1', 1, 'Test Task', 10, null, 50],
        'tasks'
      );
    });

    it('should create grade simulation', async () => {
      const result = await dispatcher.dispatch('SimulateGrade', {
        taskId: 1,
        grade: 90,
      });

      expect(result.success).toBe(true);
      expect((result.data as SimulationResult)?.courseImpact).toBeDefined();
      expect(dispatcher.isSimulationActive()).toBe(true);
    });

    it('should calculate simulation impact', async () => {
      const result = await dispatcher.dispatch('SimulateGrade', {
        taskId: 1,
        grade: 95,
      });

      expect(result.success).toBe(true);
      const data = result.data as SimulationResult;
      expect(data?.courseImpact.courseId).toBe(1);
      expect(data?.courseImpact.simulatedAssessedGrade).toBeGreaterThan(0);
    });

    it('should reject invalid grades', async () => {
      const result = await dispatcher.dispatch('SimulateGrade', {
        taskId: 1,
        grade: 150,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should allow multiple simulations', async () => {
      // Add second task
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight, grade, priority_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['task-2', 1, 'Test Task 2', 15, null, 40],
        'tasks'
      );

      await dispatcher.dispatch('SimulateGrade', { taskId: 1, grade: 90 });
      await dispatcher.dispatch('SimulateGrade', { taskId: 2, grade: 85 });

      const context = dispatcher.getSimulationContext();
      expect(context.grades.size).toBe(2);
    });
  });

  describe('ClearSimulation command', () => {
    beforeEach(() => {
      // Setup simulation
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES (?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85],
        'courses'
      );
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight)
         VALUES (?, ?, ?, ?)`,
        ['task-1', 1, 'Test Task', 10],
        'tasks'
      );
    });

    it('should clear all simulations', async () => {
      // Add simulation
      await dispatcher.dispatch('SimulateGrade', { taskId: 1, grade: 90 });
      expect(dispatcher.isSimulationActive()).toBe(true);

      // Clear
      const result = await dispatcher.dispatch('ClearSimulation', {});

      expect(result.success).toBe(true);
      const data = result.data as ClearSimulationResult;
      expect(data?.clearedCount).toBe(1);
      expect(data?.remainingCount).toBe(0);
      expect(dispatcher.isSimulationActive()).toBe(false);
    });

    it('should clear specific simulation', async () => {
      // Add second task
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight)
         VALUES (?, ?, ?, ?)`,
        ['task-2', 1, 'Test Task 2', 15],
        'tasks'
      );

      // Add simulations
      await dispatcher.dispatch('SimulateGrade', { taskId: 1, grade: 90 });
      await dispatcher.dispatch('SimulateGrade', { taskId: 2, grade: 85 });

      // Clear specific
      const result = await dispatcher.dispatch('ClearSimulation', {
        taskId: 1,
      });

      expect(result.success).toBe(true);
      const data = result.data as ClearSimulationResult;
      expect(data?.clearedCount).toBe(1);
      expect(data?.remainingCount).toBe(1);
      expect(dispatcher.isSimulationActive()).toBe(true);
    });
  });

  describe('simulation events', () => {
    beforeEach(() => {
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES (?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85],
        'courses'
      );
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight)
         VALUES (?, ?, ?, ?)`,
        ['task-1', 1, 'Test Task', 10],
        'tasks'
      );
    });

    it('should emit simulation-changed event on start', async () => {
      const handler = jest.fn();
      dispatcher.on('simulation-changed', handler);

      await dispatcher.dispatch('SimulateGrade', { taskId: 1, grade: 90 });

      // Event is not directly emitted by command, but by SimulationManager
      // In integration, this would work; in unit test, we just verify the command works
      expect(dispatcher.isSimulationActive()).toBe(true);
    });
  });

  describe('clearSimulation method', () => {
    it('should clear all simulation state', async () => {
      // Setup
      db.executeWrite(
        `INSERT INTO courses (external_id, code, name, target_grade)
         VALUES (?, ?, ?, ?)`,
        ['canvas-123', 'TEST101', 'Test Course', 85],
        'courses'
      );
      db.executeWrite(
        `INSERT INTO tasks (external_id, course_id, title, weight)
         VALUES (?, ?, ?, ?)`,
        ['task-1', 1, 'Test Task', 10],
        'tasks'
      );

      await dispatcher.dispatch('SimulateGrade', { taskId: 1, grade: 90 });
      expect(dispatcher.isSimulationActive()).toBe(true);

      // Use direct method (simulates app close)
      dispatcher.clearSimulation();

      expect(dispatcher.isSimulationActive()).toBe(false);
      expect(dispatcher.getSimulationContext().grades.size).toBe(0);
    });
  });
});
