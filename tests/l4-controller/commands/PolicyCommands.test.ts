/**
 * PolicyCommands Tests
 *
 * Tests for L4 policy-related commands:
 * - AddPolicyCommand
 * - UpdatePolicyCommand
 * - DeletePolicyCommand
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { AddPolicyCommand } from '../../../src/layers/l4-controller/commands/AddPolicyCommand';
import { UpdatePolicyCommand } from '../../../src/layers/l4-controller/commands/UpdatePolicyCommand';
import { DeletePolicyCommand } from '../../../src/layers/l4-controller/commands/DeletePolicyCommand';
import {
  CommandContext,
  createSimulationContext,
} from '../../../src/layers/l4-controller/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l4-policies');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-policies.db');

describe('Policy Commands', () => {
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

  describe('AddPolicyCommand', () => {
    let command: AddPolicyCommand;

    beforeEach(() => {
      command = new AddPolicyCommand();
    });

    describe('validate', () => {
      it('should reject invalid course ID', () => {
        const result = command.validate({
          courseId: 0,
          policyType: 'grace_tokens',
          policyName: 'Test Policy',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid course ID');
      });

      it('should reject invalid policy type', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'invalid_type' as never,
          policyName: 'Test Policy',
          policyConfig: {},
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid policy type');
      });

      it('should reject empty policy name', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'grace_tokens',
          policyName: '',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Policy name is required');
      });

      it('should reject missing policy config', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'grace_tokens',
          policyName: 'Test',
          policyConfig: null as never,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Policy config is required');
      });

      it('should validate grace_tokens config', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'grace_tokens',
          policyName: 'Test',
          policyConfig: { total_tokens: -1, hours_per_token: 24 },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('total_tokens');
      });

      it('should validate late_penalty config', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'late_penalty',
          policyName: 'Test',
          policyConfig: { penalty_value: 10, penalty_type: 'invalid' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('penalty_type');
      });

      it('should validate drop_lowest config', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'drop_lowest',
          policyName: 'Test',
          policyConfig: { drop_count: 0, category: 'quizzes' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('drop_count');
      });

      it('should validate weight_transfer config', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'weight_transfer',
          policyName: 'Test',
          policyConfig: { source_task_id: 1 }, // Missing target
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('target');
      });

      it('should accept valid grace_tokens policy', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'grace_tokens',
          policyName: 'Grace Tokens',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });
        expect(result.valid).toBe(true);
      });

      it('should accept valid late_penalty policy', () => {
        const result = command.validate({
          courseId: 1,
          policyType: 'late_penalty',
          policyName: 'Late Penalty',
          policyConfig: { penalty_value: 10, penalty_type: 'percentage_per_day' },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should add policy successfully', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          policyType: 'grace_tokens',
          policyName: 'Grace Tokens',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });

        expect(result.success).toBe(true);
        expect(result.data?.policyId).toBeDefined();

        // Verify policy was added
        const policy = db.executeReadOne<{ id: number; policy_name: string }>(
          'SELECT id, policy_name FROM course_policies WHERE id = ?',
          [result.data?.policyId]
        );
        expect(policy?.policy_name).toBe('Grace Tokens');
      });

      it('should fail for non-existent course', async () => {
        const result = await command.execute(context, {
          courseId: 99999,
          policyType: 'grace_tokens',
          policyName: 'Test',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Course not found');
      });

      it('should reject duplicate policy', async () => {
        // Add first policy
        await command.execute(context, {
          courseId: testCourseId,
          policyType: 'grace_tokens',
          policyName: 'Grace Tokens',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });

        // Try to add duplicate
        const result = await command.execute(context, {
          courseId: testCourseId,
          policyType: 'grace_tokens',
          policyName: 'Grace Tokens',
          policyConfig: { total_tokens: 5, hours_per_token: 12 },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('already exists');
      });

      it('should add default fields to config', async () => {
        const result = await command.execute(context, {
          courseId: testCourseId,
          policyType: 'grace_tokens',
          policyName: 'Grace Tokens',
          policyConfig: { total_tokens: 3, hours_per_token: 24 },
        });

        expect(result.success).toBe(true);

        const policy = db.executeReadOne<{ policy_config: string }>(
          'SELECT policy_config FROM course_policies WHERE id = ?',
          [result.data?.policyId]
        );
        const config = JSON.parse(policy!.policy_config);

        // Should have default values
        expect(config.tokens_used).toBe(0);
        expect(config.max_tokens_per_task).toBe(2);
        expect(config.excludes).toContain('exam');
      });
    });
  });

  describe('UpdatePolicyCommand', () => {
    let command: UpdatePolicyCommand;
    let testPolicyId: number;

    beforeEach(async () => {
      command = new UpdatePolicyCommand();

      // Create a test policy
      const addCommand = new AddPolicyCommand();
      const result = await addCommand.execute(context, {
        courseId: testCourseId,
        policyType: 'grace_tokens',
        policyName: 'Grace Tokens',
        policyConfig: { total_tokens: 3, hours_per_token: 24 },
      });
      testPolicyId = result.data!.policyId as number;
    });

    describe('validate', () => {
      it('should reject invalid policy ID', () => {
        const result = command.validate({
          policyId: 0,
          updates: { policyName: 'New Name' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid policy ID');
      });

      it('should reject empty updates', () => {
        const result = command.validate({
          policyId: 1,
          updates: {},
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('No updates provided');
      });

      it('should accept valid params', () => {
        const result = command.validate({
          policyId: 1,
          updates: { policyName: 'New Name' },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should update policy name', async () => {
        const result = await command.execute(context, {
          policyId: testPolicyId,
          updates: { policyName: 'Updated Name' },
        });

        expect(result.success).toBe(true);

        const policy = db.executeReadOne<{ policy_name: string }>(
          'SELECT policy_name FROM course_policies WHERE id = ?',
          [testPolicyId]
        );
        expect(policy?.policy_name).toBe('Updated Name');
      });

      it('should merge config updates', async () => {
        const result = await command.execute(context, {
          policyId: testPolicyId,
          updates: { policyConfig: { total_tokens: 5 } },
        });

        expect(result.success).toBe(true);

        const policy = db.executeReadOne<{ policy_config: string }>(
          'SELECT policy_config FROM course_policies WHERE id = ?',
          [testPolicyId]
        );
        const config = JSON.parse(policy!.policy_config);

        // Updated value
        expect(config.total_tokens).toBe(5);
        // Original value preserved
        expect(config.hours_per_token).toBe(24);
      });

      it('should update isActive flag', async () => {
        const result = await command.execute(context, {
          policyId: testPolicyId,
          updates: { isActive: false },
        });

        expect(result.success).toBe(true);

        const policy = db.executeReadOne<{ is_active: number }>(
          'SELECT is_active FROM course_policies WHERE id = ?',
          [testPolicyId]
        );
        expect(policy?.is_active).toBe(0);
      });

      it('should mark as verified by default', async () => {
        // First, unverify the policy
        db.executeWrite(
          'UPDATE course_policies SET is_user_verified = 0 WHERE id = ?',
          [testPolicyId],
          'course_policies'
        );

        const result = await command.execute(context, {
          policyId: testPolicyId,
          updates: { policyName: 'Verified Update' },
        });

        expect(result.success).toBe(true);
        expect(result.data?.wasVerified).toBe(false);

        const policy = db.executeReadOne<{ is_user_verified: number }>(
          'SELECT is_user_verified FROM course_policies WHERE id = ?',
          [testPolicyId]
        );
        expect(policy?.is_user_verified).toBe(1);
      });

      it('should return previous config', async () => {
        const result = await command.execute(context, {
          policyId: testPolicyId,
          updates: { policyConfig: { total_tokens: 10 } },
        });

        expect(result.success).toBe(true);
        expect(result.data?.previousConfig.total_tokens).toBe(3);
      });

      it('should fail for non-existent policy', async () => {
        const result = await command.execute(context, {
          policyId: 99999,
          updates: { policyName: 'Test' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Policy not found');
      });
    });
  });

  describe('DeletePolicyCommand', () => {
    let command: DeletePolicyCommand;
    let testPolicyId: number;

    beforeEach(async () => {
      command = new DeletePolicyCommand();

      // Create a test policy
      const addCommand = new AddPolicyCommand();
      const result = await addCommand.execute(context, {
        courseId: testCourseId,
        policyType: 'grace_tokens',
        policyName: 'Grace Tokens',
        policyConfig: { total_tokens: 3, hours_per_token: 24 },
      });
      testPolicyId = result.data!.policyId as number;
    });

    describe('validate', () => {
      it('should reject invalid policy ID', () => {
        const result = command.validate({ policyId: 0 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid policy ID');
      });

      it('should reject negative policy ID', () => {
        const result = command.validate({ policyId: -1 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid policy ID');
      });

      it('should accept valid policy ID', () => {
        const result = command.validate({ policyId: 1 });
        expect(result.valid).toBe(true);
      });
    });

    describe('execute', () => {
      it('should delete policy successfully', async () => {
        const result = await command.execute(context, {
          policyId: testPolicyId,
        });

        expect(result.success).toBe(true);
        expect(result.data?.deleted).toBe(true);

        // Verify policy was deleted
        const policy = db.executeReadOne<{ id: number }>(
          'SELECT id FROM course_policies WHERE id = ?',
          [testPolicyId]
        );
        expect(policy).toBeNull();
      });

      it('should fail for non-existent policy', async () => {
        const result = await command.execute(context, {
          policyId: 99999,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Policy not found');
      });
    });
  });
});
