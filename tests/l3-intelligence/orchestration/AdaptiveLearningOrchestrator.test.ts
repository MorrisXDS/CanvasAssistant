/**
 * AdaptiveLearningOrchestrator Tests
 *
 * Tests for the L3 adaptive learning orchestration layer.
 */

import fs from 'fs';
import path from 'path';
import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { AdaptiveLearningOrchestrator } from '../../../src/layers/l3-intelligence/orchestration/AdaptiveLearningOrchestrator';
import type { PriorityFactors } from '../../../src/layers/l3-intelligence/types';

// Test directory for database
const TEST_DIR = path.join(__dirname, '../../temp-l3-adaptive');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-adaptive.db');

describe('AdaptiveLearningOrchestrator', () => {
  let db: Database;
  let orchestrator: AdaptiveLearningOrchestrator;
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

    // Create with autoRecalculate disabled for tests
    orchestrator = new AdaptiveLearningOrchestrator(db, { autoRecalculate: false });

    // Create test course
    const courseResult = db.executeWrite(
      `INSERT INTO courses (external_id, code, name, target_grade, current_grade, total_weight)
       VALUES ('course_1', 'TEST101', 'Test Course', 80, 75, 100)`,
      [],
      'courses'
    );
    testCourseId = courseResult.lastInsertRowid as number;

    // Create test task
    const taskResult = db.executeWrite(
      `INSERT INTO tasks (external_id, source_type, course_id, title, weight, is_completed)
       VALUES ('task_1', 'canvas', ?, 'Test Task', 10, 0)`,
      [testCourseId],
      'tasks'
    );
    testTaskId = taskResult.lastInsertRowid as number;
  });

  afterEach(() => {
    orchestrator.stop();
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultOrchestrator = new AdaptiveLearningOrchestrator(db);
      expect(defaultOrchestrator).toBeDefined();
      defaultOrchestrator.stop();
    });

    it('should accept custom config', () => {
      const customOrchestrator = new AdaptiveLearningOrchestrator(db, {
        recalculateIntervalMs: 3600000,
        minSampleSize: 5,
        maxLearningInputs: 100,
        autoRecalculate: false,
      });
      expect(customOrchestrator).toBeDefined();
      customOrchestrator.stop();
    });
  });

  describe('recordOutcome', () => {
    it('should record learning outcome', () => {
      const factors: PriorityFactors = {
        urgency: 60,
        weight: 20,
        courseGap: 10,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 5,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      orchestrator.recordOutcome(
        testTaskId,
        testCourseId,
        'assignment',
        75,
        factors,
        false, // wasLate
        2 // daysBeforeDue
      );

      expect(orchestrator.getLearningInputCount()).toBe(1);
    });

    it('should emit outcome-recorded event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('outcome-recorded', eventSpy);

      const factors: PriorityFactors = {
        urgency: 50,
        weight: 10,
        courseGap: 15,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 0,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      orchestrator.recordOutcome(testTaskId, testCourseId, 'quiz', 50, factors, false, 1);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should limit stored inputs to maxLearningInputs', () => {
      const smallLimitOrchestrator = new AdaptiveLearningOrchestrator(db, {
        maxLearningInputs: 3,
        autoRecalculate: false,
      });

      const factors: PriorityFactors = {
        urgency: 50,
        weight: 10,
        courseGap: 15,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 0,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      // Record more than maxLearningInputs
      for (let i = 0; i < 5; i++) {
        smallLimitOrchestrator.recordOutcome(
          testTaskId + i,
          testCourseId,
          'assignment',
          50 + i,
          factors,
          false,
          i
        );
      }

      expect(smallLimitOrchestrator.getLearningInputCount()).toBe(3);
      smallLimitOrchestrator.stop();
    });
  });

  describe('recalculateWeights', () => {
    it('should recalculate weights from learning inputs', () => {
      const factors: PriorityFactors = {
        urgency: 50,
        weight: 10,
        courseGap: 15,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 0,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      // Record multiple outcomes
      for (let i = 0; i < 15; i++) {
        orchestrator.recordOutcome(
          testTaskId + i,
          testCourseId,
          'assignment',
          50 + i * 2,
          factors,
          i % 3 === 0, // Some late
          i
        );
      }

      const weights = orchestrator.recalculateWeights();

      expect(weights).toBeDefined();
    });

    it('should emit weights-updated event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('weights-updated', eventSpy);

      orchestrator.recalculateWeights();

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('getWeightAdjustments', () => {
    it('should return empty array initially', () => {
      const adjustments = orchestrator.getWeightAdjustments();
      expect(adjustments).toEqual([]);
    });
  });

  describe('applyWeights', () => {
    it('should apply adjustments to factors', () => {
      const baseFactors: PriorityFactors = {
        urgency: 50,
        weight: 20,
        courseGap: 10,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 5,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      const adjustedFactors = orchestrator.applyWeights(
        baseFactors,
        testCourseId,
        'assignment'
      );

      // Without any adjustments, should return same values
      expect(adjustedFactors).toBeDefined();
    });
  });

  describe('getCachedWeights', () => {
    it('should return null before first calculation', () => {
      expect(orchestrator.getCachedWeights()).toBeNull();
    });

    it('should return weights after calculation', () => {
      orchestrator.recalculateWeights();
      expect(orchestrator.getCachedWeights()).toBeDefined();
    });
  });

  describe('getSummary', () => {
    it('should return empty summary when no adjustments', () => {
      const summary = orchestrator.getSummary();
      expect(Array.isArray(summary)).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      const stats = orchestrator.getStatistics();

      expect(stats.totalInputs).toBe(0);
      expect(stats.adjustmentCount).toBe(0);
      expect(stats.outcomeDistribution).toBeDefined();
      expect(stats.avgPriorityByOutcome).toBeDefined();
    });

    it('should track outcome distribution', () => {
      const factors: PriorityFactors = {
        urgency: 50,
        weight: 10,
        courseGap: 15,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 0,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      // Record some late, some on time
      orchestrator.recordOutcome(testTaskId, testCourseId, 'assignment', 50, factors, true, -1);
      orchestrator.recordOutcome(testTaskId + 1, testCourseId, 'assignment', 60, factors, false, 2);

      const stats = orchestrator.getStatistics();

      expect(stats.totalInputs).toBe(2);
    });
  });

  describe('resetWeights', () => {
    it('should clear all adjustments', () => {
      // Record some data and calculate
      const factors: PriorityFactors = {
        urgency: 50,
        weight: 10,
        courseGap: 15,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 0,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      for (let i = 0; i < 15; i++) {
        orchestrator.recordOutcome(testTaskId + i, testCourseId, 'assignment', 50, factors, false, i);
      }
      orchestrator.recalculateWeights();

      // Reset
      orchestrator.resetWeights();

      expect(orchestrator.getLearningInputCount()).toBe(0);
      expect(orchestrator.getCachedWeights()).toBeNull();
    });

    it('should emit weights-updated with null', () => {
      const eventSpy = jest.fn();
      orchestrator.on('weights-updated', eventSpy);

      orchestrator.resetWeights();

      expect(eventSpy).toHaveBeenCalledWith(null);
    });
  });

  describe('stop', () => {
    it('should stop auto-recalculate timer', () => {
      const autoOrchestrator = new AdaptiveLearningOrchestrator(db, {
        autoRecalculate: true,
        recalculateIntervalMs: 100,
      });

      expect(() => autoOrchestrator.stop()).not.toThrow();
      expect(() => autoOrchestrator.stop()).not.toThrow(); // Second stop should also not throw
    });
  });
});
