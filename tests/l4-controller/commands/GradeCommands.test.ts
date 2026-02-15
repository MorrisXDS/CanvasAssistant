/**
 * GradeCommands Tests
 *
 * Tests for L4 grade-related commands:
 * - UpdateTargetGradeCommand
 * - SimulateGradeCommand
 * - ClearSimulationCommand
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { UpdateTargetGradeCommand } from '../../../src/layers/l4-controller/commands/course/UpdateTargetGradeCommand';
import { SimulateGradeCommand } from '../../../src/layers/l4-controller/commands/grade/SimulateGradeCommand';
import { ClearSimulationCommand } from '../../../src/layers/l4-controller/commands/grade/ClearSimulationCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l4-grades');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-grades.db');

describe('Grade Commands', () => {
  let db: Database;
  let context: CommandContext;
  let testCourseId: number;
  let testTaskId: number;

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

    context = { db, simulationContext: createSimulationContext() };

    // Create test course
    const courseResult = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade)
       VALUES ('test_course_1', 'TEST101', 'Test Course', 80)`,
      [],
      'courses'
    );
    testCourseId = courseResult.lastInsertRowid as number;

    // Create test task
    const taskResult = db.executeWrite(
      `INSERT INTO tasks (external_id, source_type, course_id, title, weight, is_completed)
       VALUES ('task_1', 'canvas', ?, 'Test Task', 20, 0)`,
      [testCourseId],
      'tasks'
    );
    testTaskId = taskResult.lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  describe('UpdateTargetGradeCommand', () => {
    let command: UpdateTargetGradeCommand;

    beforeEach(() => {
      command = new UpdateTargetGradeCommand();
    });

    describe('validate', () => {
      it('should reject invalid course ID', () => {
        const result = command.validate({ courseId: 0, targetGrade: 85 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject non-numeric target grade', () => {
        const result = command.validate({
          courseId: 1,
          targetGrade: 'A' as unknown as number,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a number');
      });

      it('should reject target grade below 0', () => {
        const result = command.validate({ courseId: 1, targetGrade: -5 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 0 and 100');
      });

      it('should reject target grade above 100', () => {
        const result = command.validate({ courseId: 1, targetGrade: 105 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 0 and 100');
      });

      it('should accept valid params', () => {
        const result = command.validate({ courseId: 1, targetGrade: 85 });
        expect(result.valid).toBe(true);
      });

      it('should accept boundary values', () => {
        expect(command.validate({ courseId: 1, targetGrade: 0 }).valid).toBe(
          true
        );
        expect(command.validate({ courseId: 1, targetGrade: 100 }).valid).toBe(
          true
        );
      });
    });

    describe('execute', () => {
      it('should update target grade successfully', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          targetGrade: 90,
        });

        expect(result.success).toBe(true);
        expect(result.data?.previousGrade).toBe(80);

        // Verify grade was updated
        const course = db.executeReadOne<{ target_grade: number }>(
          'SELECT target_grade FROM courses WHERE id = ?',
          [testCourseId]
        );
        expect(course?.target_grade).toBe(90);
      });

      it('should fail for non-existent course', async () => {
        const result = await command.execute(context, {
          courseId: 99999,
          targetGrade: 85,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Course not found');
      });

      it('should mark field as locally modified', async () => {
        await command.execute(context, {
          courseId: testCourseId,
          targetGrade: 90,
        });

        // Check if field was marked as modified in local_modified_fields JSON column
        const course = db.executeReadOne<{ local_modified_fields: string | null }>(
          'SELECT local_modified_fields FROM courses WHERE id = ?',
          [testCourseId]
        );
        expect(course).not.toBeNull();
        const fields = JSON.parse(course!.local_modified_fields || '[]');
        expect(fields).toContain('target_grade');
      });
    });
  });

  describe('SimulateGradeCommand', () => {
    let command: SimulateGradeCommand;

    beforeEach(() => {
      command = new SimulateGradeCommand();
    });

    describe('validate', () => {
      it('should reject invalid task ID', () => {
        const result = command.validate({ taskId: 0, grade: 85 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Task not found or invalid');
      });

      it('should reject grade below 0', () => {
        const result = command.validate({ taskId: 1, grade: -5 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 0 and 150');
      });

      it('should reject grade above 150', () => {
        const result = command.validate({ taskId: 1, grade: 200 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 0 and 150');
      });

      it('should accept valid params', () => {
        const result = command.validate({ taskId: 1, grade: 85 });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should add simulated grade to context', async () => {
        const result = await command.execute(context, {
          taskId: testTaskId,
          grade: 88,
        });

        expect(result.success).toBe(true);
        expect(context.simulationContext.isActive).toBe(true);
        expect(context.simulationContext.grades.has(testTaskId)).toBe(true);

        const simGrade = context.simulationContext.grades.get(testTaskId);
        expect(simGrade?.simulatedGrade).toBe(88);
      });

      it('should fail for non-existent task', async () => {
        const result = await command.execute(context, {
          taskId: 99999,
          grade: 85,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Task not found');
      });

      it('should allow updating existing simulation', async () => {
        // First simulation
        await command.execute(context, {
          taskId: testTaskId,
          grade: 80,
        });

        // Update simulation
        const result = await command.execute(context, {
          taskId: testTaskId,
          grade: 95,
        });

        expect(result.success).toBe(true);

        const simGrade = context.simulationContext.grades.get(testTaskId);
        expect(simGrade?.simulatedGrade).toBe(95);
      });
    });
  });

  describe('ClearSimulationCommand', () => {
    let command: ClearSimulationCommand;
    let simulateCommand: SimulateGradeCommand;

    beforeEach(() => {
      command = new ClearSimulationCommand();
      simulateCommand = new SimulateGradeCommand();
    });

    describe('validate', () => {
      it('should always return valid (no params required)', () => {
        const result = command.validate({});
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should clear all simulated grades', async () => {
        // Set up simulation
        await simulateCommand.execute(context, {
          taskId: testTaskId,
          grade: 88,
        });

        expect(context.simulationContext.isActive).toBe(true);

        // Clear simulation
        const result = await command.execute(context, {});

        expect(result.success).toBe(true);
        expect(result.data?.clearedCount).toBe(1);
        expect(context.simulationContext.isActive).toBe(false);
        expect(context.simulationContext.grades.size).toBe(0);
      });

      it('should succeed even with no active simulation', async () => {
        const result = await command.execute(context, {});

        expect(result.success).toBe(true);
        expect(result.data?.clearedCount).toBe(0);
      });
    });
  });
});
