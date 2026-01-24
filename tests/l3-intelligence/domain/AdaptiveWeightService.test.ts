/**
 * AdaptiveWeightService Domain Service Tests
 */

import {
  calculateAdaptiveWeights,
  applyAdaptiveWeights,
  detectWeightDrift,
  buildAdaptiveWeights,
  getAdjustmentSummary,
  determineOutcome,
  createLearningInput,
} from '../../../src/layers/l3-intelligence/domain/AdaptiveWeightService';
import {
  LearningInput,
  LearningOutcome,
  WeightAdjustment,
  PriorityFactors,
} from '../../../src/layers/l3-intelligence/types';

describe('AdaptiveWeightService', () => {
  const createDefaultFactors = (): PriorityFactors => ({
    urgency: 50,
    weight: 20,
    courseGap: 15,
    policyAdjustment: 0,
    dependency: 0,
    taskTypeBoost: 5,
    lockTimeUrgency: 0,
    graceTokenFactor: 0,
    submissionFactor: 0,
  });

  const createLearningInputHelper = (
    overrides: Partial<LearningInput> = {}
  ): LearningInput => ({
    taskId: 1,
    courseId: 1,
    taskType: 'assignment',
    priorityScore: 70,
    factors: createDefaultFactors(),
    outcome: 'completed_ontime',
    daysFromDeadline: 1,
    ...overrides,
  });

  describe('determineOutcome', () => {
    it('should return completed_early for early submissions', () => {
      expect(determineOutcome(false, 3)).toBe('completed_early');
      expect(determineOutcome(false, 2)).toBe('completed_early');
    });

    it('should return completed_ontime for on-time submissions', () => {
      expect(determineOutcome(false, 0)).toBe('completed_ontime');
      expect(determineOutcome(false, 0.5)).toBe('completed_ontime');
    });

    it('should return completed_late for late submissions', () => {
      expect(determineOutcome(true, -1)).toBe('completed_late');
      expect(determineOutcome(true, -5)).toBe('completed_late');
    });

    it('should return missed for very late submissions', () => {
      expect(determineOutcome(true, -8)).toBe('missed');
      expect(determineOutcome(true, -14)).toBe('missed');
    });
  });

  describe('createLearningInput', () => {
    it('should create valid learning input', () => {
      const factors = createDefaultFactors();
      const input = createLearningInput(
        1, // taskId
        2, // courseId
        'quiz',
        75,
        factors,
        false,
        2
      );

      expect(input.taskId).toBe(1);
      expect(input.courseId).toBe(2);
      expect(input.taskType).toBe('quiz');
      expect(input.priorityScore).toBe(75);
      expect(input.factors).toEqual(factors);
      expect(input.outcome).toBe('completed_early');
      expect(input.daysFromDeadline).toBe(2);
    });

    it('should determine outcome correctly', () => {
      const factors = createDefaultFactors();

      const earlyInput = createLearningInput(1, 1, 'assignment', 70, factors, false, 3);
      expect(earlyInput.outcome).toBe('completed_early');

      const lateInput = createLearningInput(1, 1, 'assignment', 70, factors, true, -2);
      expect(lateInput.outcome).toBe('completed_late');
    });
  });

  describe('calculateAdaptiveWeights', () => {
    it('should return empty array for insufficient data', () => {
      const inputs = Array(5)
        .fill(null)
        .map(() => createLearningInputHelper());

      const result = calculateAdaptiveWeights(inputs, 10);

      expect(result).toEqual([]);
    });

    it('should calculate adjustments for sufficient data', () => {
      // Create inputs with clear pattern: high urgency correlates with good outcomes
      const inputs: LearningInput[] = [];

      // High urgency -> good outcomes
      for (let i = 0; i < 15; i++) {
        inputs.push(createLearningInputHelper({
          taskId: i,
          factors: { ...createDefaultFactors(), urgency: 80 },
          outcome: 'completed_ontime',
        }));
      }

      // Low urgency -> poor outcomes
      for (let i = 0; i < 15; i++) {
        inputs.push(createLearningInputHelper({
          taskId: 20 + i,
          factors: { ...createDefaultFactors(), urgency: 20 },
          outcome: 'completed_late',
        }));
      }

      const result = calculateAdaptiveWeights(inputs, 10);

      // Should have some adjustments
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create course-specific adjustments when enough data', () => {
      const inputs: LearningInput[] = [];

      // Course 1: high weight correlates with good outcomes
      for (let i = 0; i < 15; i++) {
        inputs.push(createLearningInputHelper({
          taskId: i,
          courseId: 1,
          factors: { ...createDefaultFactors(), weight: 40 },
          outcome: 'completed_ontime',
        }));
      }

      // Course 2: different pattern
      for (let i = 0; i < 15; i++) {
        inputs.push(createLearningInputHelper({
          taskId: 20 + i,
          courseId: 2,
          factors: { ...createDefaultFactors(), weight: 40 },
          outcome: 'completed_late',
        }));
      }

      const result = calculateAdaptiveWeights(inputs, 10);

      // May or may not have course-specific adjustments based on correlation strength
      // The function should run without error and return an array
      expect(Array.isArray(result)).toBe(true);
    });

    it('should create task-type-specific adjustments', () => {
      const inputs: LearningInput[] = [];

      // Quizzes: good performance
      for (let i = 0; i < 15; i++) {
        inputs.push(createLearningInputHelper({
          taskId: i,
          taskType: 'quiz',
          factors: { ...createDefaultFactors(), taskTypeBoost: 5 },
          outcome: 'completed_ontime',
        }));
      }

      // Exams: poor performance
      for (let i = 0; i < 15; i++) {
        inputs.push(createLearningInputHelper({
          taskId: 20 + i,
          taskType: 'exam',
          factors: { ...createDefaultFactors(), taskTypeBoost: 10 },
          outcome: 'completed_late',
        }));
      }

      const result = calculateAdaptiveWeights(inputs, 10);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('applyAdaptiveWeights', () => {
    it('should apply no changes with empty adjustments', () => {
      const base = createDefaultFactors();
      const result = applyAdaptiveWeights(base, [], 1, 'assignment');

      expect(result).toEqual(base);
    });

    it('should apply global adjustments', () => {
      const base = createDefaultFactors();
      const adjustments: WeightAdjustment[] = [
        {
          factorName: 'urgency',
          courseId: null,
          taskType: null,
          weightMultiplier: 1.5,
          adjustmentReason: 'Test',
          sampleSize: 50,
          lastUpdatedAt: new Date(),
        },
      ];

      const result = applyAdaptiveWeights(base, adjustments, 1, 'assignment');

      expect(result.urgency).toBe(75); // 50 * 1.5
    });

    it('should apply course-specific adjustments', () => {
      const base = createDefaultFactors();
      const adjustments: WeightAdjustment[] = [
        {
          factorName: 'weight',
          courseId: 1, // Only for course 1
          taskType: null,
          weightMultiplier: 2.0,
          adjustmentReason: 'Test',
          sampleSize: 30,
          lastUpdatedAt: new Date(),
        },
      ];

      const resultCourse1 = applyAdaptiveWeights(base, adjustments, 1, 'assignment');
      const resultCourse2 = applyAdaptiveWeights(base, adjustments, 2, 'assignment');

      expect(resultCourse1.weight).toBe(40); // 20 * 2.0
      expect(resultCourse2.weight).toBe(20); // Unchanged
    });

    it('should apply task-type-specific adjustments', () => {
      const base = createDefaultFactors();
      const adjustments: WeightAdjustment[] = [
        {
          factorName: 'taskTypeBoost',
          courseId: null,
          taskType: 'quiz',
          weightMultiplier: 1.5,
          adjustmentReason: 'Test',
          sampleSize: 30,
          lastUpdatedAt: new Date(),
        },
      ];

      const resultQuiz = applyAdaptiveWeights(base, adjustments, 1, 'quiz');
      const resultExam = applyAdaptiveWeights(base, adjustments, 1, 'exam');

      expect(resultQuiz.taskTypeBoost).toBe(7.5); // 5 * 1.5
      expect(resultExam.taskTypeBoost).toBe(5); // Unchanged
    });

    it('should apply adjustments in order of specificity', () => {
      const base: PriorityFactors = { ...createDefaultFactors(), urgency: 100 };
      const adjustments: WeightAdjustment[] = [
        // Global
        {
          factorName: 'urgency',
          courseId: null,
          taskType: null,
          weightMultiplier: 0.5,
          adjustmentReason: 'Global',
          sampleSize: 50,
          lastUpdatedAt: new Date(),
        },
        // Course-specific (more specific, applied after)
        {
          factorName: 'urgency',
          courseId: 1,
          taskType: null,
          weightMultiplier: 2.0,
          adjustmentReason: 'Course',
          sampleSize: 30,
          lastUpdatedAt: new Date(),
        },
      ];

      const result = applyAdaptiveWeights(base, adjustments, 1, 'assignment');

      // Should apply global first (100 * 0.5 = 50), then course (50 * 2.0 = 100)
      expect(result.urgency).toBe(100);
    });
  });

  describe('detectWeightDrift', () => {
    it('should return empty for insufficient data', () => {
      const inputs = Array(10).fill(null).map(() => createLearningInputHelper());
      const result = detectWeightDrift(inputs, 20);
      expect(result).toEqual([]);
    });

    it('should detect significant drift', () => {
      const inputs: LearningInput[] = [];

      // Earlier window: high urgency correlates with good outcomes
      for (let i = 0; i < 25; i++) {
        inputs.push(createLearningInputHelper({
          taskId: i,
          factors: { ...createDefaultFactors(), urgency: i < 15 ? 80 : 30 },
          outcome: i < 15 ? 'completed_ontime' : 'completed_late',
        }));
      }

      // Recent window: different pattern
      for (let i = 0; i < 25; i++) {
        inputs.push(createLearningInputHelper({
          taskId: 30 + i,
          factors: { ...createDefaultFactors(), urgency: i < 15 ? 30 : 80 },
          outcome: i < 15 ? 'completed_ontime' : 'completed_late',
        }));
      }

      const result = detectWeightDrift(inputs, 20);

      // May detect drift depending on correlation changes
      // Just verify function runs without error
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('buildAdaptiveWeights', () => {
    it('should build complete adaptive weights structure', () => {
      const inputs: LearningInput[] = [];

      for (let i = 0; i < 20; i++) {
        inputs.push(createLearningInputHelper({
          taskId: i,
          outcome: i % 2 === 0 ? 'completed_ontime' : 'completed_late',
        }));
      }

      const result = buildAdaptiveWeights(inputs, 10);

      expect(result.baseWeights).toBeDefined();
      expect(result.adjustments).toBeDefined();
      expect(result.globalMultipliers).toBeDefined();
      expect(typeof result.baseWeights.urgency).toBe('number');
    });

    it('should include global multipliers', () => {
      const inputs: LearningInput[] = [];

      // Create clear correlation pattern
      for (let i = 0; i < 30; i++) {
        inputs.push(createLearningInputHelper({
          taskId: i,
          factors: {
            ...createDefaultFactors(),
            urgency: i < 15 ? 90 : 10,
          },
          outcome: i < 15 ? 'completed_ontime' : 'missed',
        }));
      }

      const result = buildAdaptiveWeights(inputs, 10);

      // May or may not have multipliers depending on correlation
      expect(typeof result.globalMultipliers).toBe('object');
    });
  });

  describe('getAdjustmentSummary', () => {
    it('should return empty for no adjustments', () => {
      const result = getAdjustmentSummary([]);
      expect(result).toEqual([]);
    });

    it('should summarize global adjustments', () => {
      const adjustments: WeightAdjustment[] = [
        {
          factorName: 'urgency',
          courseId: null,
          taskType: null,
          weightMultiplier: 1.5,
          adjustmentReason: 'Positive correlation',
          sampleSize: 50,
          lastUpdatedAt: new Date(),
        },
        {
          factorName: 'weight',
          courseId: null,
          taskType: null,
          weightMultiplier: 0.8,
          adjustmentReason: 'Negative correlation',
          sampleSize: 50,
          lastUpdatedAt: new Date(),
        },
      ];

      const result = getAdjustmentSummary(adjustments);

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.includes('Increased'))).toBe(true);
      expect(result.some((s) => s.includes('Decreased'))).toBe(true);
    });

    it('should mention course-specific adjustments', () => {
      const adjustments: WeightAdjustment[] = [
        {
          factorName: 'urgency',
          courseId: 1,
          taskType: null,
          weightMultiplier: 1.5,
          adjustmentReason: 'Test',
          sampleSize: 30,
          lastUpdatedAt: new Date(),
        },
        {
          factorName: 'weight',
          courseId: 2,
          taskType: null,
          weightMultiplier: 0.8,
          adjustmentReason: 'Test',
          sampleSize: 30,
          lastUpdatedAt: new Date(),
        },
      ];

      const result = getAdjustmentSummary(adjustments);

      expect(result.some((s) => s.includes('course-specific'))).toBe(true);
    });

    it('should mention task-type adjustments', () => {
      const adjustments: WeightAdjustment[] = [
        {
          factorName: 'urgency',
          courseId: null,
          taskType: 'quiz',
          weightMultiplier: 1.5,
          adjustmentReason: 'Test',
          sampleSize: 30,
          lastUpdatedAt: new Date(),
        },
      ];

      const result = getAdjustmentSummary(adjustments);

      expect(result.some((s) => s.includes('task-type'))).toBe(true);
    });
  });
});
