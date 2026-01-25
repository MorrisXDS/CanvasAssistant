/**
 * TaskCommands Tests
 *
 * Tests for L4 task-related commands:
 * - CreateTaskCommand
 * - DeleteTaskCommand
 * - MarkTaskCompleteCommand
 * - UpdateTaskCommand
 * - DuplicateTaskCommand
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CreateTaskCommand } from '../../../src/layers/l4-controller/commands/CreateTaskCommand';
import { DeleteTaskCommand } from '../../../src/layers/l4-controller/commands/DeleteTaskCommand';
import { MarkTaskCompleteCommand } from '../../../src/layers/l4-controller/commands/MarkTaskCompleteCommand';
import { CommandContext, createSimulationContext } from '../../../src/layers/l4-controller/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l4-commands');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-commands.db');

describe('Task Commands', () => {
  let db: Database;
  let context: CommandContext;
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

    // Create command context
    context = { db, simulationContext: createSimulationContext() };

    // Create a test course
    const result = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade)
       VALUES ('test_course_1', 'TEST101', 'Test Course', 80)`,
      [],
      'courses'
    );
    testCourseId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  describe('CreateTaskCommand', () => {
    let command: CreateTaskCommand;

    beforeEach(() => {
      command = new CreateTaskCommand();
    });

    describe('validate', () => {
      it('should reject invalid course ID', () => {
        const result = command.validate({ courseId: 0, title: 'Test Task' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject empty title', () => {
        const result = command.validate({ courseId: 1, title: '' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('title is required');
      });

      it('should reject title over 500 characters', () => {
        const longTitle = 'a'.repeat(501);
        const result = command.validate({ courseId: 1, title: longTitle });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('500 characters');
      });

      it('should reject invalid weight', () => {
        const result = command.validate({
          courseId: 1,
          title: 'Test',
          weight: 150,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Weight must be between');
      });

      it('should reject negative points possible', () => {
        const result = command.validate({
          courseId: 1,
          title: 'Test',
          pointsPossible: -10,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-negative');
      });

      it('should accept valid params', () => {
        const result = command.validate({
          courseId: 1,
          title: 'Test Task',
          weight: 10,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should create a task successfully', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          title: 'My New Task',
          description: 'Task description',
          weight: 15,
        });

        expect(result.success).toBe(true);
        expect(result.data?.taskId).toBeGreaterThan(0);

        // Verify task was created
        const task = db.executeReadOne<{ title: string; weight: number }>(
          'SELECT title, weight FROM tasks WHERE id = ?',
          [result.data!.taskId]
        );
        expect(task?.title).toBe('My New Task');
        expect(task?.weight).toBe(15);
      });

      it('should fail for non-existent course', async () => {
        const result = await command.execute(context, {
          courseId: 99999,
          title: 'Test Task',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Course not found');
      });

      it('should trim whitespace from title', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          title: '  Trimmed Title  ',
        });

        expect(result.success).toBe(true);

        const task = db.executeReadOne<{ title: string }>(
          'SELECT title FROM tasks WHERE id = ?',
          [result.data!.taskId]
        );
        expect(task?.title).toBe('Trimmed Title');
      });

      it('should set source_type to user', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          title: 'User Task',
        });

        const task = db.executeReadOne<{ source_type: string }>(
          'SELECT source_type FROM tasks WHERE id = ?',
          [result.data!.taskId]
        );
        expect(task?.source_type).toBe('user');
      });
    });
  });

  describe('DeleteTaskCommand', () => {
    let command: DeleteTaskCommand;
    let userTaskId: number;
    let canvasTaskId: number;

    beforeEach(() => {
      command = new DeleteTaskCommand();

      // Create a user task
      const userResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight)
         VALUES ('user_task_1', 'user', ?, 'User Task', 10)`,
        [testCourseId],
        'tasks'
      );
      userTaskId = userResult.lastInsertRowid as number;

      // Create a Canvas task
      const canvasResult = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight)
         VALUES ('canvas_123', 'canvas', ?, 'Canvas Task', 20)`,
        [testCourseId],
        'tasks'
      );
      canvasTaskId = canvasResult.lastInsertRowid as number;
    });

    describe('validate', () => {
      it('should reject invalid task ID', () => {
        const result = command.validate({ taskId: 0 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid task ID');
      });

      it('should accept valid task ID', () => {
        const result = command.validate({ taskId: 1 });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should delete user-created task', async () => {
        const result = await command.execute(context, { taskId: userTaskId });

        expect(result.success).toBe(true);
        expect(result.data?.deleted).toBe(true);

        // Verify task was deleted
        const task = db.executeReadOne(
          'SELECT id FROM tasks WHERE id = ?',
          [userTaskId]
        );
        expect(task).toBeNull();
      });

      it('should reject deleting Canvas task without force', async () => {
        const result = await command.execute(context, { taskId: canvasTaskId });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot delete Canvas-synced task');
      });

      it('should delete Canvas task with force flag', async () => {
        const result = await command.execute(context, {
          taskId: canvasTaskId,
          force: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.deleted).toBe(true);
      });

      it('should fail for non-existent task', async () => {
        const result = await command.execute(context, { taskId: 99999 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Task not found');
      });
    });
  });

  describe('MarkTaskCompleteCommand', () => {
    let command: MarkTaskCompleteCommand;
    let taskId: number;

    beforeEach(() => {
      command = new MarkTaskCompleteCommand();

      // Create a test task
      const result = db.executeWrite(
        `INSERT INTO tasks (external_id, source_type, course_id, title, weight, grade, is_completed)
         VALUES ('task_1', 'user', ?, 'Test Task', 20, 85, 0)`,
        [testCourseId],
        'tasks'
      );
      taskId = result.lastInsertRowid as number;
    });

    describe('validate', () => {
      it('should reject invalid task ID', () => {
        const result = command.validate({ taskId: 0, isComplete: true });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid task ID');
      });

      it('should reject non-boolean isComplete', () => {
        const result = command.validate({
          taskId: 1,
          isComplete: 'yes' as unknown as boolean,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a boolean');
      });

      it('should accept valid params', () => {
        const result = command.validate({ taskId: 1, isComplete: true });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should mark task as complete', async () => {
        const result = await command.execute(context, {
          taskId,
          isComplete: true,
        });

        expect(result.success).toBe(true);
        expect(result.data?.previousState).toBe(false);
        expect(result.data?.completedAt).not.toBeNull();

        // Verify task was updated
        const task = db.executeReadOne<{ is_completed: number }>(
          'SELECT is_completed FROM tasks WHERE id = ?',
          [taskId]
        );
        expect(task?.is_completed).toBe(1);
      });

      it('should mark task as incomplete', async () => {
        // First mark as complete
        await command.execute(context, { taskId, isComplete: true });

        // Then mark as incomplete
        const result = await command.execute(context, {
          taskId,
          isComplete: false,
        });

        expect(result.success).toBe(true);
        expect(result.data?.previousState).toBe(true);
        expect(result.data?.completedAt).toBeNull();

        // Verify task was updated
        const task = db.executeReadOne<{ is_completed: number }>(
          'SELECT is_completed FROM tasks WHERE id = ?',
          [taskId]
        );
        expect(task?.is_completed).toBe(0);
      });

      it('should fail for non-existent task', async () => {
        const result = await command.execute(context, {
          taskId: 99999,
          isComplete: true,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Task not found');
      });

      it('should mark field as locally modified', async () => {
        await command.execute(context, { taskId, isComplete: true });

        // Check if the field was marked as modified
        const modified = db.executeReadOne<{ id: number }>(
          `SELECT id FROM task_local_modifications
           WHERE task_id = ? AND field_name = 'is_completed'`,
          [taskId]
        );
        expect(modified).not.toBeNull();
      });
    });
  });
});
