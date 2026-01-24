import { PolicyEvaluator, PolicyEvaluationResult } from '../../src/layers/l3-intelligence/PolicyEvaluator';
import { TaskForPriority, CourseForPriority, PolicyForPriority } from '../../src/layers/l3-intelligence/types';

describe('PolicyEvaluator', () => {
  let evaluator: PolicyEvaluator;
  let baseTask: TaskForPriority;
  let baseCourse: CourseForPriority;

  beforeEach(() => {
    evaluator = new PolicyEvaluator();

    baseTask = {
      id: 1,
      courseId: 100,
      title: 'Test Assignment',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
      unlockAt: null,
      lockAt: null,
      pointsPossible: 100,
      weight: 10,
      isCompleted: false,
      isPinned: false,
      grade: null,
      submittedAt: null,
      taskType: 'assignment',
      taskGroupId: null,
      submissionStatus: null,
    };

    baseCourse = {
      id: 100,
      code: 'CSC101',
      name: 'Intro to CS',
      currentGrade: 85,
      targetGrade: 90,
      totalWeight: 100,
    };
  });

  describe('evaluate with no policies', () => {
    it('should return neutral result with on-time window', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, []);

      expect(result.adjustment).toBe(0);
      expect(result.factors).toHaveLength(0);
      expect(result.submissionWindows).toHaveLength(1);
      expect(result.submissionWindows[0].type).toBe('on_time');
    });

    it('should return empty result for task without due date', () => {
      const taskNoDue = { ...baseTask, dueAt: null };
      const result = evaluator.evaluate(taskNoDue, baseCourse, []);

      expect(result.adjustment).toBe(0);
      expect(result.submissionWindows).toHaveLength(0);
    });
  });

  describe('grace tokens policy', () => {
    const graceTokenPolicy: PolicyForPriority = {
      id: 1,
      courseId: 100,
      policyType: 'grace_tokens',
      policyName: 'Grace Tokens',
      policyConfig: {
        type: 'grace_tokens',
        total_tokens: 5,
        tokens_used: 2,
        hours_per_token: 24,
        max_tokens_per_task: 2,
        applies_to: ['Assignment'],
        excludes: ['Final'],
      },
      isActive: true,
    };

    it('should add grace token windows for task before deadline', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [graceTokenPolicy]);

      // Should have on_time plus grace token windows
      expect(result.submissionWindows.length).toBeGreaterThan(1);

      const graceWindows = result.submissionWindows.filter((w) => w.type === 'grace_token');
      expect(graceWindows.length).toBe(2); // max_tokens_per_task = 2
    });

    it('should set correct token costs', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [graceTokenPolicy]);

      const graceWindows = result.submissionWindows.filter((w) => w.type === 'grace_token');
      expect(graceWindows[0].tokenCost).toBe(1);
      expect(graceWindows[1].tokenCost).toBe(2);
    });

    it('should track available grace tokens', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [graceTokenPolicy]);

      // 5 total - 2 used = 3 available, but max 2 per task
      expect(result.graceTokensAvailable).toBe(2);
    });

    it('should boost priority for salvageable past-due tasks', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours past due
      };
      const now = new Date();

      const result = evaluator.evaluate(pastDueTask, baseCourse, [graceTokenPolicy], now);

      expect(result.adjustment).toBeGreaterThan(0);
      expect(result.factors.some((f) => f.id === 'grace_token_salvageable')).toBe(true);
    });

    it('should not apply to excluded tasks', () => {
      const finalExam = { ...baseTask, title: 'Final Exam' };
      const result = evaluator.evaluate(finalExam, baseCourse, [graceTokenPolicy]);

      expect(result.graceTokensAvailable).toBe(0);
    });
  });

  describe('late penalty policy', () => {
    const latePenaltyPolicy: PolicyForPriority = {
      id: 2,
      courseId: 100,
      policyType: 'late_penalty',
      policyName: 'Late Penalty',
      policyConfig: {
        type: 'late_penalty',
        penalty_type: 'percentage_per_day',
        penalty_value: 10,
        grace_period_hours: 2,
        max_penalty: 50,
        cutoff_days: 7,
        applies_to: ['*'],
      },
      isActive: true,
    };

    it('should add grace period and penalty windows', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [latePenaltyPolicy]);

      const graceWindow = result.submissionWindows.find(
        (w) => w.type === 'late_penalty' && w.penaltyPercent === 0
      );
      expect(graceWindow).toBeDefined();
      expect(graceWindow?.label).toContain('Grace period');
    });

    it('should add intermediate penalty windows', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [latePenaltyPolicy]);

      const penaltyWindows = result.submissionWindows.filter(
        (w) => w.type === 'late_penalty' && (w.penaltyPercent ?? 0) > 0
      );
      expect(penaltyWindows.length).toBeGreaterThan(0);
    });

    it('should add cutoff window', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [latePenaltyPolicy]);

      const cutoffWindow = result.submissionWindows.find((w) => w.type === 'cutoff');
      expect(cutoffWindow).toBeDefined();
      expect(cutoffWindow?.available).toBe(false);
    });

    it('should boost priority during grace period after deadline', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour past due
      };
      const now = new Date();

      const result = evaluator.evaluate(pastDueTask, baseCourse, [latePenaltyPolicy], now);

      expect(result.adjustment).toBeGreaterThan(0);
      expect(result.factors.some((f) => f.id === 'grace_period_active')).toBe(true);
    });

    it('should reduce priority when penalty is active', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days past due
      };
      const now = new Date();

      const result = evaluator.evaluate(pastDueTask, baseCourse, [latePenaltyPolicy], now);

      expect(result.adjustment).toBeLessThan(0);
      expect(result.factors.some((f) => f.id === 'late_penalty_active')).toBe(true);
    });

    it('should drastically reduce priority after cutoff', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days past due
      };
      const now = new Date();

      const result = evaluator.evaluate(pastDueTask, baseCourse, [latePenaltyPolicy], now);

      expect(result.adjustment).toBeLessThanOrEqual(-100);
      expect(result.factors.some((f) => f.id === 'past_cutoff')).toBe(true);
    });
  });

  describe('drop lowest policy', () => {
    const dropLowestPolicy: PolicyForPriority = {
      id: 3,
      courseId: 100,
      policyType: 'drop_lowest',
      policyName: 'Drop Lowest Quiz',
      policyConfig: {
        type: 'drop_lowest',
        category: 'Quiz',
        drop_count: 2,
        min_submissions: 5,
      },
      isActive: true,
    };

    it('should mark matching tasks as droppable', () => {
      const quizTask = { ...baseTask, title: 'Quiz 3' };
      const result = evaluator.evaluate(quizTask, baseCourse, [dropLowestPolicy]);

      expect(result.isDroppable).toBe(true);
      expect(result.factors.some((f) => f.id === 'drop_lowest')).toBe(true);
    });

    it('should reduce priority for droppable tasks', () => {
      const quizTask = { ...baseTask, title: 'Quiz 3' };
      const result = evaluator.evaluate(quizTask, baseCourse, [dropLowestPolicy]);

      expect(result.adjustment).toBeLessThan(0);
    });

    it('should not affect non-matching tasks', () => {
      const assignmentTask = { ...baseTask, title: 'Assignment 1' };
      const result = evaluator.evaluate(assignmentTask, baseCourse, [dropLowestPolicy]);

      expect(result.isDroppable).toBe(false);
    });
  });

  describe('weight transfer policy', () => {
    const weightTransferPolicy: PolicyForPriority = {
      id: 4,
      courseId: 100,
      policyType: 'weight_transfer',
      policyName: 'Midterm to Final',
      policyConfig: {
        type: 'weight_transfer',
        from_task: 'Midterm',
        to_task: 'Final',
        condition: 'if_higher',
        max_transfer_percent: 100,
        transfer_ratio: 1.0,
      },
      isActive: true,
    };

    it('should mark source task as transferable', () => {
      const midtermTask = { ...baseTask, title: 'Midterm Exam' };
      const result = evaluator.evaluate(midtermTask, baseCourse, [weightTransferPolicy]);

      expect(result.canTransferWeight).toBe(true);
      expect(result.factors.some((f) => f.id === 'weight_transfer_source')).toBe(true);
    });

    it('should boost priority for target task', () => {
      const finalTask = { ...baseTask, title: 'Final Exam' };
      const result = evaluator.evaluate(finalTask, baseCourse, [weightTransferPolicy]);

      expect(result.adjustment).toBeGreaterThan(0);
      expect(result.factors.some((f) => f.id === 'weight_transfer_target')).toBe(true);
    });

    it('should not affect unrelated tasks', () => {
      const result = evaluator.evaluate(baseTask, baseCourse, [weightTransferPolicy]);

      expect(result.canTransferWeight).toBe(false);
      expect(result.factors.every((f) => !f.id.includes('weight_transfer'))).toBe(true);
    });
  });

  describe('calculateMaxPossibleScore', () => {
    const latePenaltyPolicy: PolicyForPriority = {
      id: 2,
      courseId: 100,
      policyType: 'late_penalty',
      policyName: 'Late Penalty',
      policyConfig: {
        type: 'late_penalty',
        penalty_type: 'percentage_per_day',
        penalty_value: 10,
        grace_period_hours: 2,
        max_penalty: 50,
        cutoff_days: 7,
        applies_to: ['*'],
      },
      isActive: true,
    };

    it('should return full score for on-time submission', () => {
      const score = evaluator.calculateMaxPossibleScore(baseTask, [latePenaltyPolicy]);
      expect(score).toBe(100);
    });

    it('should return full score during grace period', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour past due
      };
      const now = new Date();

      const score = evaluator.calculateMaxPossibleScore(pastDueTask, [latePenaltyPolicy], now);
      expect(score).toBe(100);
    });

    it('should return reduced score after grace period', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 30 * 60 * 60 * 1000), // ~1.25 days past due (past grace)
      };
      const now = new Date();

      // 30 hours past due, 2 hour grace = 28 hours past grace
      // ceil(28/24) = 2 days of penalty = 20%
      const score = evaluator.calculateMaxPossibleScore(pastDueTask, [latePenaltyPolicy], now);
      expect(score).toBeLessThan(100);
      expect(score).toBe(80); // 20% penalty (2 days past grace period)
    });

    it('should return 0 after cutoff', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days past due
      };
      const now = new Date();

      const score = evaluator.calculateMaxPossibleScore(pastDueTask, [latePenaltyPolicy], now);
      expect(score).toBe(0);
    });

    it('should return full score when no late penalty policy exists', () => {
      const pastDueTask = {
        ...baseTask,
        dueAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      };
      const now = new Date();

      const score = evaluator.calculateMaxPossibleScore(pastDueTask, [], now);
      expect(score).toBe(100);
    });
  });

  describe('multiple policies', () => {
    it('should evaluate all active policies', () => {
      const policies: PolicyForPriority[] = [
        {
          id: 1,
          courseId: 100,
          policyType: 'grace_tokens',
          policyName: 'Grace Tokens',
          policyConfig: {
            type: 'grace_tokens',
            total_tokens: 3,
            tokens_used: 0,
            hours_per_token: 24,
            max_tokens_per_task: 2,
            applies_to: [],
            excludes: [],
          },
          isActive: true,
        },
        {
          id: 2,
          courseId: 100,
          policyType: 'drop_lowest',
          policyName: 'Drop Lowest Quiz',
          policyConfig: {
            type: 'drop_lowest',
            category: 'Test',
            drop_count: 1,
            min_submissions: 3,
          },
          isActive: true,
        },
      ];

      const quizTask = { ...baseTask, title: 'Test 1' };
      const result = evaluator.evaluate(quizTask, baseCourse, policies);

      // Should have effects from both policies
      expect(result.graceTokensAvailable).toBe(2);
      expect(result.isDroppable).toBe(true);
    });

    it('should skip inactive policies', () => {
      const inactivePolicy: PolicyForPriority = {
        id: 1,
        courseId: 100,
        policyType: 'drop_lowest',
        policyName: 'Drop Lowest',
        policyConfig: {
          type: 'drop_lowest',
          category: 'Test',
          drop_count: 1,
          min_submissions: 3,
        },
        isActive: false,
      };

      const testTask = { ...baseTask, title: 'Test 1' };
      const result = evaluator.evaluate(testTask, baseCourse, [inactivePolicy]);

      expect(result.isDroppable).toBe(false);
    });
  });

  describe('malformed policy configs', () => {
    it('should skip policies with invalid config', () => {
      const badPolicy: PolicyForPriority = {
        id: 1,
        courseId: 100,
        policyType: 'grace_tokens',
        policyName: 'Bad Config',
        policyConfig: {
          type: 'grace_tokens',
          // Missing required fields
        },
        isActive: true,
      };

      // Should not throw, just skip the policy
      const result = evaluator.evaluate(baseTask, baseCourse, [badPolicy]);
      expect(result.graceTokensAvailable).toBe(0);
    });
  });
});
