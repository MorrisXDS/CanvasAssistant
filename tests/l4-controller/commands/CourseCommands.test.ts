/**
 * CourseCommands Tests
 *
 * Tests for L4 course-related commands:
 * - UpdateCoursePreferencesCommand
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { UpdateCoursePreferencesCommand } from '../../../src/layers/l4-controller/commands/UpdateCoursePreferencesCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l4-course-commands');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-course.db');

describe('Course Commands', () => {
  let db: Database;
  let context: CommandContext;
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

    context = { db, simulationContext: createSimulationContext() };

    // Create test course
    const result = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade, color, nickname, is_hidden)
       VALUES ('test_course_1', 'TEST101', 'Test Course', 80, NULL, NULL, 0)`,
      [],
      'courses'
    );
    testCourseId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  describe('UpdateCoursePreferencesCommand', () => {
    let command: UpdateCoursePreferencesCommand;

    beforeEach(() => {
      command = new UpdateCoursePreferencesCommand();
    });

    describe('validate', () => {
      it('should reject invalid course ID', () => {
        const result = command.validate({
          courseId: 0,
          preferences: { color: '#FF0000' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject empty preferences', () => {
        const result = command.validate({
          courseId: 1,
          preferences: {},
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('No preferences provided');
      });

      it('should reject invalid target grade type', () => {
        const result = command.validate({
          courseId: 1,
          preferences: { targetGrade: 'A' as unknown as number },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a number');
      });

      it('should reject target grade below 0', () => {
        const result = command.validate({
          courseId: 1,
          preferences: { targetGrade: -5 },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 0 and 100');
      });

      it('should reject target grade above 100', () => {
        const result = command.validate({
          courseId: 1,
          preferences: { targetGrade: 105 },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 0 and 100');
      });

      it('should reject invalid color type', () => {
        const result = command.validate({
          courseId: 1,
          preferences: { color: 123 as unknown as string },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Color must be a string');
      });

      it('should reject nickname over 100 characters', () => {
        const result = command.validate({
          courseId: 1,
          preferences: { nickname: 'a'.repeat(101) },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('100 characters');
      });

      it('should accept valid preferences', () => {
        const result = command.validate({
          courseId: 1,
          preferences: {
            targetGrade: 90,
            color: '#FF0000',
            nickname: 'My Course',
            isHidden: false,
          },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should update color', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          preferences: { color: '#3498DB' },
        });

        expect(result.success).toBe(true);
        expect(result.data?.previous.color).toBeUndefined();

        const course = db.executeReadOne<{ color: string }>(
          'SELECT color FROM courses WHERE id = ?',
          [testCourseId]
        );
        expect(course?.color).toBe('#3498DB');
      });

      it('should update nickname', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          preferences: { nickname: 'My Favorite Class' },
        });

        expect(result.success).toBe(true);

        const course = db.executeReadOne<{ nickname: string }>(
          'SELECT nickname FROM courses WHERE id = ?',
          [testCourseId]
        );
        expect(course?.nickname).toBe('My Favorite Class');
      });

      it('should update target grade', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          preferences: { targetGrade: 95 },
        });

        expect(result.success).toBe(true);
        expect(result.data?.previous.targetGrade).toBe(80);

        const course = db.executeReadOne<{ target_grade: number }>(
          'SELECT target_grade FROM courses WHERE id = ?',
          [testCourseId]
        );
        expect(course?.target_grade).toBe(95);
      });

      it('should update isHidden', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          preferences: { isHidden: true },
        });

        expect(result.success).toBe(true);
        expect(result.data?.previous.isHidden).toBe(false);

        const course = db.executeReadOne<{ is_hidden: number }>(
          'SELECT is_hidden FROM courses WHERE id = ?',
          [testCourseId]
        );
        expect(course?.is_hidden).toBe(1);
      });

      it('should update multiple preferences at once', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          preferences: {
            color: '#E74C3C',
            nickname: 'Red Course',
            targetGrade: 88,
          },
        });

        expect(result.success).toBe(true);

        const course = db.executeReadOne<{
          color: string;
          nickname: string;
          target_grade: number;
        }>('SELECT color, nickname, target_grade FROM courses WHERE id = ?', [
          testCourseId,
        ]);
        expect(course?.color).toBe('#E74C3C');
        expect(course?.nickname).toBe('Red Course');
        expect(course?.target_grade).toBe(88);
      });

      it('should return previous preferences', async () => {
        // Set initial preferences
        await command.execute(context, {
          courseId: testCourseId,
          preferences: { color: '#FF0000', nickname: 'Old Name' },
        });

        // Update again
        const result = await command.execute(context, {
          courseId: testCourseId,
          preferences: { color: '#00FF00', nickname: 'New Name' },
        });

        expect(result.success).toBe(true);
        expect(result.data?.previous.color).toBe('#FF0000');
        expect(result.data?.previous.nickname).toBe('Old Name');
      });

      it('should fail for non-existent course', async () => {
        const result = await command.execute(context, {
          courseId: 99999,
          preferences: { color: '#FF0000' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Course not found');
      });
    });
  });
});
