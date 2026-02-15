/**
 * SyncCommands Tests
 *
 * Tests for L4 sync-related commands:
 * - TriggerSyncCommand
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import {
  TriggerSyncCommand,
  SyncRequestEvent,
} from '../../../src/layers/l4-controller/commands/sync/TriggerSyncCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l4-sync');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-sync.db');

describe('Sync Commands', () => {
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

  describe('TriggerSyncCommand', () => {
    let command: TriggerSyncCommand;

    beforeEach(() => {
      command = new TriggerSyncCommand();
      // Disable rate limiting for most tests
      command.setMinSyncInterval(0);
    });

    describe('validate', () => {
      it('should accept full sync type', () => {
        const result = command.validate({ type: 'full' });
        expect(result.valid).toBe(true);
      });

      it('should accept courses sync type', () => {
        const result = command.validate({ type: 'courses' });
        expect(result.valid).toBe(true);
      });

      it('should accept tasks sync type', () => {
        const result = command.validate({ type: 'tasks' });
        expect(result.valid).toBe(true);
      });

      it('should accept notifications sync type', () => {
        const result = command.validate({ type: 'notifications' });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid sync type', () => {
        const result = command.validate({ type: 'invalid' as never });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid sync type');
      });

      it('should accept valid courseId', () => {
        const result = command.validate({ type: 'tasks', courseId: 1 });
        expect(result.valid).toBe(true);
      });

      it('should reject non-integer courseId', () => {
        const result = command.validate({ type: 'tasks', courseId: 1.5 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject negative courseId', () => {
        const result = command.validate({ type: 'tasks', courseId: -1 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject zero courseId', () => {
        const result = command.validate({ type: 'tasks', courseId: 0 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject excessively large courseId', () => {
        const result = command.validate({
          type: 'tasks',
          courseId: 2147483648, // exceeds max
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum value');
      });
    });

    describe('execute', () => {
      it('should trigger full sync successfully', async () => {
        const result = await command.execute(context, { type: 'full' });

        expect(result.success).toBe(true);
        expect(result.data?.requestedAt).toBeInstanceOf(Date);
      });

      it('should trigger course-specific sync', async () => {
        const result = await command.execute(context, {
          type: 'tasks',
          courseId: testCourseId,
        });

        expect(result.success).toBe(true);
      });

      it('should emit sync-requested event', async () => {
        const eventSpy = jest.fn();
        command.on('sync-requested', eventSpy);

        await command.execute(context, { type: 'full' });

        expect(eventSpy).toHaveBeenCalledTimes(1);
        const event: SyncRequestEvent = eventSpy.mock.calls[0][0];
        expect(event.type).toBe('full');
        expect(event.requestedAt).toBeInstanceOf(Date);
      });

      it('should emit event with courseId when specified', async () => {
        const eventSpy = jest.fn();
        command.on('sync-requested', eventSpy);

        await command.execute(context, {
          type: 'tasks',
          courseId: testCourseId,
        });

        const event: SyncRequestEvent = eventSpy.mock.calls[0][0];
        expect(event.type).toBe('tasks');
        expect(event.courseId).toBe(testCourseId);
      });

      it('should fail for non-existent course', async () => {
        const result = await command.execute(context, {
          type: 'tasks',
          courseId: 99999,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Course not found');
      });

      it('should enforce rate limiting', async () => {
        // Set a longer interval
        command.setMinSyncInterval(1000);

        // First sync should succeed
        const result1 = await command.execute(context, { type: 'full' });
        expect(result1.success).toBe(true);

        // Second sync immediately after should fail
        const result2 = await command.execute(context, { type: 'full' });
        expect(result2.success).toBe(false);
        expect(result2.error).toContain('Please wait');
      });

      it('should allow sync after rate limit expires', async () => {
        command.setMinSyncInterval(10); // 10ms

        // First sync
        await command.execute(context, { type: 'full' });

        // Wait for rate limit
        await new Promise((resolve) => setTimeout(resolve, 15));

        // Second sync should succeed
        const result = await command.execute(context, { type: 'full' });
        expect(result.success).toBe(true);
      });

      it('should allow sync after resetRateLimit', async () => {
        command.setMinSyncInterval(60000); // Long interval

        // First sync
        await command.execute(context, { type: 'full' });

        // Reset rate limit
        command.resetRateLimit();

        // Second sync should succeed
        const result = await command.execute(context, { type: 'full' });
        expect(result.success).toBe(true);
      });
    });

    describe('setMinSyncInterval', () => {
      it('should update minimum sync interval', async () => {
        command.setMinSyncInterval(100);

        await command.execute(context, { type: 'full' });
        const result = await command.execute(context, { type: 'full' });

        expect(result.success).toBe(false);
        // The error should mention waiting time
        expect(result.error).toMatch(/wait \d+ seconds/);
      });
    });
  });
});
