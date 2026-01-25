/**
 * NotificationCommands Tests
 *
 * Tests for L4 notification-related commands:
 * - DismissNotificationCommand
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { DismissNotificationCommand } from '../../../src/layers/l4-controller/commands/DismissNotificationCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l4-notifications');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-notifications.db');

describe('Notification Commands', () => {
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

  describe('DismissNotificationCommand', () => {
    let command: DismissNotificationCommand;
    let notificationId: number;

    beforeEach(() => {
      command = new DismissNotificationCommand();

      // Create a test notification
      const result = db.executeWrite(
        `INSERT INTO notifications (
          source_type, source_id, course_id, title, message, published_at
        ) VALUES (
          'canvas', 'announcement_123', ?, 'Test Announcement', 'Test message', datetime('now')
        )`,
        [testCourseId],
        'notifications'
      );
      notificationId = result.lastInsertRowid as number;
    });

    describe('validate', () => {
      it('should reject invalid notification ID', () => {
        const result = command.validate({ notificationId: 0 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid notification ID');
      });

      it('should reject negative notification ID', () => {
        const result = command.validate({ notificationId: -1 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid notification ID');
      });

      it('should accept valid notification ID', () => {
        const result = command.validate({ notificationId: 1 });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should dismiss notification successfully', async () => {
        const result = await command.execute(context, { notificationId });

        expect(result.success).toBe(true);
        expect(result.data?.dismissedAt).toBeInstanceOf(Date);

        // Verify notification was dismissed
        const notification = db.executeReadOne<{ dismissed_at: string | null }>(
          'SELECT dismissed_at FROM notifications WHERE id = ?',
          [notificationId]
        );
        expect(notification?.dismissed_at).not.toBeNull();
      });

      it('should fail for non-existent notification', async () => {
        const result = await command.execute(context, {
          notificationId: 99999,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Notification not found');
      });

      it('should fail for already dismissed notification', async () => {
        // First dismiss
        await command.execute(context, { notificationId });

        // Try to dismiss again
        const result = await command.execute(context, { notificationId });

        expect(result.success).toBe(false);
        expect(result.error).toContain('already dismissed');
      });
    });
  });
});
