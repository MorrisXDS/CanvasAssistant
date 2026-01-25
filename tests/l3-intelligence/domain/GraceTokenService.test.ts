/**
 * GraceTokenService Tests
 *
 * Tests for the L3 grace token business logic service.
 * This is a pure domain service with no database dependencies.
 */

import { GraceTokenService } from '../../../src/layers/l3-intelligence/domain/GraceTokenService';
import type { Task, Policy } from '../../../src/shared/ipc-contract';
import type { GraceTokenConfig } from '../../../src/layers/l1-persistence/repositories/PolicyRepository';

describe('GraceTokenService', () => {
  let service: GraceTokenService;

  beforeEach(() => {
    service = new GraceTokenService();
  });

  // Helper to create a minimal task
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 1,
    externalId: 'task_1',
    courseId: 1,
    title: 'Test Assignment',
    description: 'Test description',
    dueAt: new Date('2025-01-30T23:59:00Z').toISOString(),
    weight: 10,
    grade: null,
    pointsPossible: 100,
    priorityScore: 50,
    isCompleted: false,
    completedAt: null,
    submissionStatus: null,
    taskType: 'assignment',
    taskGroupId: null,
    ...overrides,
  });

  // Helper to create a minimal config
  const createConfig = (overrides: Partial<GraceTokenConfig> = {}): GraceTokenConfig => ({
    total_tokens: 3,
    tokens_used: 0,
    hours_per_token: 24,
    max_tokens_per_task: 1,
    applies_to: [],
    excludes: ['exam', 'final', 'midterm'],
    ...overrides,
  });

  // Helper to create a policy with grace token config
  const createPolicy = (
    config: GraceTokenConfig
  ): Policy & { policyConfig: GraceTokenConfig } => ({
    id: 1,
    courseId: 1,
    policyType: 'grace_tokens',
    policyName: 'Grace Tokens',
    policyConfig: config,
    rawText: null,
    isUserVerified: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  describe('getStatus', () => {
    it('should return correct token status', () => {
      const config = createConfig({
        total_tokens: 5,
        tokens_used: 2,
        hours_per_token: 24,
        max_tokens_per_task: 2,
      });

      const status = service.getStatus(config);

      expect(status.totalTokens).toBe(5);
      expect(status.usedTokens).toBe(2);
      expect(status.availableTokens).toBe(3);
      expect(status.hoursPerToken).toBe(24);
      expect(status.maxTokensPerTask).toBe(2);
    });

    it('should handle all tokens used', () => {
      const config = createConfig({
        total_tokens: 3,
        tokens_used: 3,
      });

      const status = service.getStatus(config);

      expect(status.availableTokens).toBe(0);
    });

    it('should handle fresh config with no tokens used', () => {
      const config = createConfig({
        total_tokens: 10,
        tokens_used: 0,
      });

      const status = service.getStatus(config);

      expect(status.availableTokens).toBe(10);
      expect(status.usedTokens).toBe(0);
    });
  });

  describe('checkAvailability', () => {
    it('should allow token use when available', () => {
      const config = createConfig({ total_tokens: 3, tokens_used: 0 });
      const policy = createPolicy(config);
      const task = createTask();

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(true);
      expect(result.availableTokens).toBe(3);
      expect(result.requestedTokens).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should reject when not enough tokens available', () => {
      const config = createConfig({ total_tokens: 3, tokens_used: 2 });
      const policy = createPolicy(config);
      const task = createTask();

      const result = service.checkAvailability(policy, task, 2);

      expect(result.canUse).toBe(false);
      expect(result.error).toContain('Not enough tokens');
      expect(result.availableTokens).toBe(1);
      expect(result.requestedTokens).toBe(2);
    });

    it('should reject when exceeding max tokens per task', () => {
      const config = createConfig({
        total_tokens: 5,
        tokens_used: 0,
        max_tokens_per_task: 1,
      });
      const policy = createPolicy(config);
      const task = createTask();

      const result = service.checkAvailability(policy, task, 2);

      expect(result.canUse).toBe(false);
      expect(result.error).toContain('Cannot use more than 1 tokens per task');
    });

    it('should reject when task has no due date', () => {
      const config = createConfig();
      const policy = createPolicy(config);
      const task = createTask({ dueAt: null });

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Task has no due date');
    });

    it('should reject excluded task types', () => {
      const config = createConfig({ excludes: ['exam', 'final', 'midterm'] });
      const policy = createPolicy(config);
      const task = createTask({ title: 'Final Exam' });

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Grace tokens cannot be used for this task type');
    });

    it('should reject task types not in applies_to list', () => {
      const config = createConfig({ applies_to: ['assignment', 'quiz'] });
      const policy = createPolicy(config);
      const task = createTask({ title: 'Project Presentation' });

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Grace tokens do not apply to this task type');
    });

    it('should allow task types in applies_to list', () => {
      const config = createConfig({
        applies_to: ['assignment', 'quiz'],
        excludes: [],
      });
      const policy = createPolicy(config);
      const task = createTask({ title: 'Weekly Assignment 3' });

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(true);
    });

    it('should be case-insensitive for exclusion matching', () => {
      const config = createConfig({ excludes: ['EXAM'] });
      const policy = createPolicy(config);
      const task = createTask({ title: 'midterm exam' });

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(false);
    });
  });

  describe('calculateApplication', () => {
    it('should calculate correct new deadline', () => {
      const config = createConfig({ hours_per_token: 24 });
      const originalDue = new Date('2025-01-30T23:59:00Z');
      const task = createTask({ dueAt: originalDue.toISOString() });

      const result = service.calculateApplication(config, task, 1);

      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(1);
      expect(result.hoursExtended).toBe(24);

      const expectedDeadline = new Date(originalDue.getTime() + 24 * 60 * 60 * 1000);
      expect(result.newDeadline.getTime()).toBe(expectedDeadline.getTime());
    });

    it('should calculate correct remaining tokens', () => {
      const config = createConfig({ total_tokens: 5, tokens_used: 1 });
      const task = createTask();

      const result = service.calculateApplication(config, task, 2);

      expect(result.remainingTokens).toBe(2); // 5 - 1 - 2 = 2
      expect(result.updatedConfig.tokens_used).toBe(3); // 1 + 2 = 3
    });

    it('should handle multiple tokens per task', () => {
      const config = createConfig({
        hours_per_token: 12,
        max_tokens_per_task: 3,
      });
      const originalDue = new Date('2025-01-30T12:00:00Z');
      const task = createTask({ dueAt: originalDue.toISOString() });

      const result = service.calculateApplication(config, task, 3);

      expect(result.hoursExtended).toBe(36); // 3 * 12 = 36 hours
      const expectedDeadline = new Date(originalDue.getTime() + 36 * 60 * 60 * 1000);
      expect(result.newDeadline.getTime()).toBe(expectedDeadline.getTime());
    });

    it('should fail for task without due date', () => {
      const config = createConfig();
      const task = createTask({ dueAt: null });

      const result = service.calculateApplication(config, task, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task has no due date');
      expect(result.tokensUsed).toBe(0);
      expect(result.hoursExtended).toBe(0);
    });

    it('should return updated config with incremented tokens_used', () => {
      const config = createConfig({ total_tokens: 3, tokens_used: 0 });
      const task = createTask();

      const result = service.calculateApplication(config, task, 1);

      expect(result.updatedConfig.tokens_used).toBe(1);
      expect(result.updatedConfig.total_tokens).toBe(3);
      // Original config should not be mutated
      expect(config.tokens_used).toBe(0);
    });
  });

  describe('createDefaultConfig', () => {
    it('should create config with default values', () => {
      const config = service.createDefaultConfig();

      expect(config.total_tokens).toBe(3);
      expect(config.tokens_used).toBe(0);
      expect(config.hours_per_token).toBe(24);
      expect(config.max_tokens_per_task).toBe(1);
      expect(config.applies_to).toEqual([]);
      expect(config.excludes).toEqual(['exam', 'final', 'midterm']);
    });

    it('should allow overriding specific values', () => {
      const config = service.createDefaultConfig({
        total_tokens: 5,
        hours_per_token: 48,
      });

      expect(config.total_tokens).toBe(5);
      expect(config.hours_per_token).toBe(48);
      // Other values should be defaults
      expect(config.tokens_used).toBe(0);
      expect(config.max_tokens_per_task).toBe(1);
    });

    it('should allow overriding excludes list', () => {
      const config = service.createDefaultConfig({
        excludes: ['test', 'quiz'],
      });

      expect(config.excludes).toEqual(['test', 'quiz']);
    });

    it('should allow overriding applies_to list', () => {
      const config = service.createDefaultConfig({
        applies_to: ['homework', 'assignment'],
      });

      expect(config.applies_to).toEqual(['homework', 'assignment']);
    });
  });

  describe('formatStatus', () => {
    it('should format status with available tokens', () => {
      const config = createConfig({ total_tokens: 3, tokens_used: 1 });

      const status = service.formatStatus(config);

      expect(status).toBe('2/3 tokens available');
    });

    it('should format status with no tokens used', () => {
      const config = createConfig({ total_tokens: 5, tokens_used: 0 });

      const status = service.formatStatus(config);

      expect(status).toBe('5/5 tokens available');
    });

    it('should format status with all tokens used', () => {
      const config = createConfig({ total_tokens: 3, tokens_used: 3 });

      const status = service.formatStatus(config);

      expect(status).toBe('0/3 tokens available');
    });
  });

  describe('calculateMaxExtension', () => {
    it('should calculate max extension based on available tokens', () => {
      const config = createConfig({
        total_tokens: 5,
        tokens_used: 2,
        hours_per_token: 24,
        max_tokens_per_task: 2,
      });

      // Available = 3, but max per task = 2, so max extension = 2 * 24 = 48
      const maxHours = service.calculateMaxExtension(config);

      expect(maxHours).toBe(48);
    });

    it('should be limited by available tokens when fewer than max per task', () => {
      const config = createConfig({
        total_tokens: 3,
        tokens_used: 2,
        hours_per_token: 24,
        max_tokens_per_task: 5,
      });

      // Available = 1, max per task = 5, so max extension = 1 * 24 = 24
      const maxHours = service.calculateMaxExtension(config);

      expect(maxHours).toBe(24);
    });

    it('should return 0 when no tokens available', () => {
      const config = createConfig({
        total_tokens: 3,
        tokens_used: 3,
        hours_per_token: 24,
      });

      const maxHours = service.calculateMaxExtension(config);

      expect(maxHours).toBe(0);
    });

    it('should account for different hours per token', () => {
      const config = createConfig({
        total_tokens: 5,
        tokens_used: 0,
        hours_per_token: 12,
        max_tokens_per_task: 3,
      });

      // Available = 5, max per task = 3, so max extension = 3 * 12 = 36
      const maxHours = service.calculateMaxExtension(config);

      expect(maxHours).toBe(36);
    });
  });

  describe('edge cases', () => {
    it('should handle zero tokens config', () => {
      const config = createConfig({ total_tokens: 0, tokens_used: 0 });

      const status = service.getStatus(config);
      expect(status.availableTokens).toBe(0);

      const maxExtension = service.calculateMaxExtension(config);
      expect(maxExtension).toBe(0);
    });

    it('should handle empty excludes and applies_to lists', () => {
      const config = createConfig({ excludes: [], applies_to: [] });
      const policy = createPolicy(config);
      const task = createTask({ title: 'Final Exam' }); // Would normally be excluded

      const result = service.checkAvailability(policy, task, 1);

      // With empty excludes, even "Final Exam" should be allowed
      expect(result.canUse).toBe(true);
    });

    it('should handle task title with special characters', () => {
      const config = createConfig({ excludes: ['exam'] });
      const policy = createPolicy(config);
      const task = createTask({ title: 'EXAM-2025 (Final)' });

      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(false);
    });

    it('should handle partial match in exclusion', () => {
      const config = createConfig({ excludes: ['final'] });
      const policy = createPolicy(config);
      const task = createTask({ title: 'Semifinal Project' });

      // "final" is contained in "Semifinal"
      const result = service.checkAvailability(policy, task, 1);

      expect(result.canUse).toBe(false);
    });
  });
});
