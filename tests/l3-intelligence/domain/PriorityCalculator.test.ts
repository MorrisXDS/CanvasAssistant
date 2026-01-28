/**
 * PriorityCalculator Tests
 *
 * Tests for the pure domain functions that calculate task priorities.
 * These are the core algorithms that drive the priority engine.
 */

import {
  calculateUrgencyScore,
  calculateWeightScore,
  calculateCourseGapFactor,
  calculateLockTimeUrgency,
  calculateGraceTokenFactor,
  calculateSubmissionFactor,
  calculatePolicyAdjustment,
  calculateTaskTypeBoost,
  assignQueue,
  calculateAllFactors,
  calculateFinalScore,
  calculatePriority,
} from '../../../src/layers/l3-intelligence/domain/PriorityCalculator';
import type {
  TaskForPriority,
  CourseForPriority,
  PolicyForPriority,
  GraceTokenPolicy,
  PriorityInput,
} from '../../../src/layers/l3-intelligence/types';

// Helper to create a test task
function createTask(overrides: Partial<TaskForPriority> = {}): TaskForPriority {
  return {
    id: 1,
    courseId: 100,
    title: 'Test Assignment',
    dueAt: null,
    dueTimeKnown: true,
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
    ...overrides,
  };
}

// Helper to create a test course
function createCourse(overrides: Partial<CourseForPriority> = {}): CourseForPriority {
  return {
    id: 100,
    code: 'CS101',
    name: 'Intro to Computer Science',
    currentGrade: 85,
    targetGrade: 90,
    totalWeight: 100,
    ...overrides,
  };
}

describe('PriorityCalculator', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  describe('calculateUrgencyScore', () => {
    it('should return 100 for tasks due within 6 hours', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 3 * 60 * 60 * 1000) }); // 3 hours
      expect(calculateUrgencyScore(task, now)).toBe(100);
    });

    it('should return 95 for tasks due within 12 hours', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 10 * 60 * 60 * 1000) }); // 10 hours
      expect(calculateUrgencyScore(task, now)).toBe(95);
    });

    it('should return 85 for tasks due within 24 hours', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 20 * 60 * 60 * 1000) }); // 20 hours
      expect(calculateUrgencyScore(task, now)).toBe(85);
    });

    it('should return 70 for tasks due within 48 hours', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 36 * 60 * 60 * 1000) }); // 36 hours
      expect(calculateUrgencyScore(task, now)).toBe(70);
    });

    it('should return 45 for tasks due within a week', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 100 * 60 * 60 * 1000) }); // ~4 days
      expect(calculateUrgencyScore(task, now)).toBe(45);
    });

    it('should return 20 for tasks due more than 2 weeks out', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 500 * 60 * 60 * 1000) }); // ~3 weeks
      expect(calculateUrgencyScore(task, now)).toBe(20);
    });

    it('should return 90 for tasks overdue less than 24 hours', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 12 * 60 * 60 * 1000) }); // 12 hours ago
      expect(calculateUrgencyScore(task, now)).toBe(90);
    });

    it('should return 80 for tasks overdue 1-3 days', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 48 * 60 * 60 * 1000) }); // 2 days ago
      expect(calculateUrgencyScore(task, now)).toBe(80);
    });

    it('should return 40 for very overdue tasks', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) }); // 2 weeks ago
      expect(calculateUrgencyScore(task, now)).toBe(40);
    });

    it('should return 30 for tasks with no due date', () => {
      const task = createTask({ dueAt: null });
      expect(calculateUrgencyScore(task, now)).toBe(30);
    });
  });

  describe('calculateWeightScore', () => {
    it('should return weight directly up to 50', () => {
      expect(calculateWeightScore(createTask({ weight: 10 }))).toBe(10);
      expect(calculateWeightScore(createTask({ weight: 25 }))).toBe(25);
      expect(calculateWeightScore(createTask({ weight: 50 }))).toBe(50);
    });

    it('should cap at 50 for weights above 50', () => {
      expect(calculateWeightScore(createTask({ weight: 75 }))).toBe(50);
      expect(calculateWeightScore(createTask({ weight: 100 }))).toBe(50);
    });

    it('should return 0 for null weight', () => {
      expect(calculateWeightScore(createTask({ weight: null }))).toBe(0);
    });
  });

  describe('calculateCourseGapFactor', () => {
    it('should return 0 when at or above target', () => {
      expect(calculateCourseGapFactor(createCourse({ currentGrade: 95, targetGrade: 90 }))).toBe(0);
      expect(calculateCourseGapFactor(createCourse({ currentGrade: 90, targetGrade: 90 }))).toBe(0);
    });

    it('should return 10 for small gaps (<=5)', () => {
      expect(calculateCourseGapFactor(createCourse({ currentGrade: 87, targetGrade: 90 }))).toBe(10);
    });

    it('should return 20 for medium gaps (5-10)', () => {
      expect(calculateCourseGapFactor(createCourse({ currentGrade: 82, targetGrade: 90 }))).toBe(20);
    });

    it('should return 25 for larger gaps (10-15)', () => {
      expect(calculateCourseGapFactor(createCourse({ currentGrade: 77, targetGrade: 90 }))).toBe(25);
    });

    it('should return 30 for critical gaps (>15)', () => {
      expect(calculateCourseGapFactor(createCourse({ currentGrade: 70, targetGrade: 90 }))).toBe(30);
    });

    it('should return 15 for courses with no current grade', () => {
      expect(calculateCourseGapFactor(createCourse({ currentGrade: null }))).toBe(15);
    });
  });

  describe('calculateLockTimeUrgency', () => {
    it('should return 0 for tasks with no lock date', () => {
      const task = createTask({ lockAt: null });
      expect(calculateLockTimeUrgency(task, now)).toBe(0);
    });

    it('should return 0 for already locked tasks', () => {
      const task = createTask({ lockAt: new Date(now.getTime() - 60 * 60 * 1000) }); // 1 hour ago
      expect(calculateLockTimeUrgency(task, now)).toBe(0);
    });

    it('should return 50 for tasks locking within 6 hours', () => {
      const task = createTask({ lockAt: new Date(now.getTime() + 3 * 60 * 60 * 1000) }); // 3 hours
      expect(calculateLockTimeUrgency(task, now)).toBe(50);
    });

    it('should return 30 for tasks locking within 24 hours', () => {
      const task = createTask({ lockAt: new Date(now.getTime() + 18 * 60 * 60 * 1000) }); // 18 hours
      expect(calculateLockTimeUrgency(task, now)).toBe(30);
    });

    it('should return 15 for tasks locking within 72 hours', () => {
      const task = createTask({ lockAt: new Date(now.getTime() + 48 * 60 * 60 * 1000) }); // 48 hours
      expect(calculateLockTimeUrgency(task, now)).toBe(15);
    });

    it('should return 0 for tasks locking more than 72 hours out', () => {
      const task = createTask({ lockAt: new Date(now.getTime() + 100 * 60 * 60 * 1000) }); // ~4 days
      expect(calculateLockTimeUrgency(task, now)).toBe(0);
    });
  });

  describe('calculateGraceTokenFactor', () => {
    const policy: GraceTokenPolicy = {
      totalTokens: 5,
      tokensRemaining: 3,
      hoursPerToken: 24,
      maxTokensPerTask: 2,
    };

    it('should return 0 for tasks not yet overdue', () => {
      const task = createTask({ dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
      expect(calculateGraceTokenFactor(task, policy, now)).toBe(0);
    });

    it('should return 0 for completed tasks', () => {
      const task = createTask({ isCompleted: true, dueAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) });
      expect(calculateGraceTokenFactor(task, policy, now)).toBe(0);
    });

    it('should return 0 when no tokens available', () => {
      const noTokenPolicy = { ...policy, tokensRemaining: 0 };
      const task = createTask({ dueAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) });
      expect(calculateGraceTokenFactor(task, noTokenPolicy, now)).toBe(0);
    });

    it('should return positive boost for salvageable tasks (1 token)', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 12 * 60 * 60 * 1000) }); // 12 hours overdue
      const result = calculateGraceTokenFactor(task, policy, now);
      expect(result).toBe(15); // 20 - 1*5
    });

    it('should return smaller boost for tasks needing more tokens', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 36 * 60 * 60 * 1000) }); // 36 hours overdue
      const result = calculateGraceTokenFactor(task, policy, now);
      expect(result).toBe(10); // 20 - 2*5
    });

    it('should return -10 for tasks exceeding max tokens per task', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 72 * 60 * 60 * 1000) }); // 72 hours overdue (needs 3 tokens)
      const result = calculateGraceTokenFactor(task, policy, now);
      expect(result).toBe(-10);
    });

    it('should return 0 when policy is null', () => {
      const task = createTask({ dueAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) });
      expect(calculateGraceTokenFactor(task, null, now)).toBe(0);
    });
  });

  describe('calculateSubmissionFactor', () => {
    it('should return 0 for unsubmitted tasks', () => {
      expect(calculateSubmissionFactor('unsubmitted')).toBe(0);
      expect(calculateSubmissionFactor(null)).toBe(0);
    });

    it('should return -10 for late submissions', () => {
      expect(calculateSubmissionFactor('late')).toBe(-10);
    });

    it('should return -30 for missing tasks', () => {
      expect(calculateSubmissionFactor('missing')).toBe(-30);
    });

    it('should return -50 for submitted tasks', () => {
      expect(calculateSubmissionFactor('submitted')).toBe(-50);
    });

    it('should return -100 for graded tasks', () => {
      expect(calculateSubmissionFactor('graded')).toBe(-100);
    });
  });

  describe('calculateTaskTypeBoost', () => {
    it('should boost final exams', () => {
      expect(calculateTaskTypeBoost('final')).toBe(10); // (30 - 10) * 0.5
    });

    it('should boost midterms', () => {
      expect(calculateTaskTypeBoost('midterm')).toBe(7.5); // (25 - 10) * 0.5
    });

    it('should not boost regular assignments', () => {
      expect(calculateTaskTypeBoost('assignment')).toBe(0);
    });

    it('should reduce priority of low-weight items', () => {
      expect(calculateTaskTypeBoost('quiz')).toBe(-2.5); // (5 - 10) * 0.5
    });

    it('should handle unknown task types with default weight', () => {
      expect(calculateTaskTypeBoost('unknown_type')).toBe(0);
    });
  });

  describe('calculatePolicyAdjustment', () => {
    it('should return 0 with no policies', () => {
      const task = createTask();
      expect(calculatePolicyAdjustment(task, [], now)).toBe(0);
    });

    it('should apply late penalty policy for overdue tasks', () => {
      const task = createTask({
        dueAt: new Date(now.getTime() - 48 * 60 * 60 * 1000) // 2 days overdue
      });
      const policies: PolicyForPriority[] = [{
        id: 1,
        courseId: 100,
        policyType: 'late_penalty',
        policyName: 'Late Policy',
        policyConfig: { penaltyPerDay: 10 },
        isActive: true,
      }];

      const result = calculatePolicyAdjustment(task, policies, now);
      expect(result).toBe(-10); // 2 days * 10% * 0.5
    });

    it('should apply drop_lowest policy for matching task types', () => {
      const task = createTask({ taskType: 'quiz' });
      const policies: PolicyForPriority[] = [{
        id: 1,
        courseId: 100,
        policyType: 'drop_lowest',
        policyName: 'Drop Lowest Quiz',
        policyConfig: { dropCount: 1, applyToType: 'quiz' },
        isActive: true,
      }];

      expect(calculatePolicyAdjustment(task, policies, now)).toBe(-15);
    });

    it('should apply bonus policy', () => {
      const task = createTask();
      const policies: PolicyForPriority[] = [{
        id: 1,
        courseId: 100,
        policyType: 'bonus',
        policyName: 'Bonus Assignment',
        policyConfig: {},
        isActive: true,
      }];

      expect(calculatePolicyAdjustment(task, policies, now)).toBe(10);
    });

    it('should skip inactive policies', () => {
      const task = createTask();
      const policies: PolicyForPriority[] = [{
        id: 1,
        courseId: 100,
        policyType: 'bonus',
        policyName: 'Bonus',
        policyConfig: {},
        isActive: false,
      }];

      expect(calculatePolicyAdjustment(task, policies, now)).toBe(0);
    });

    it('should skip policies from other courses', () => {
      const task = createTask({ courseId: 100 });
      const policies: PolicyForPriority[] = [{
        id: 1,
        courseId: 200, // Different course
        policyType: 'bonus',
        policyName: 'Bonus',
        policyConfig: {},
        isActive: true,
      }];

      expect(calculatePolicyAdjustment(task, policies, now)).toBe(0);
    });
  });

  describe('assignQueue', () => {
    it('should assign pinned tasks to pinned queue', () => {
      const task = createTask({ isPinned: true });
      expect(assignQueue(task, now)).toBe('pinned');
    });

    it('should assign locked tasks to upcoming queue', () => {
      const task = createTask({ unlockAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
      expect(assignQueue(task, now)).toBe('upcoming');
    });

    it('should assign submitted/graded tasks to deadlines queue', () => {
      expect(assignQueue(createTask({ submissionStatus: 'submitted' }), now)).toBe('deadlines');
      expect(assignQueue(createTask({ submissionStatus: 'graded' }), now)).toBe('deadlines');
    });

    it('should assign overdue incomplete tasks to overdue queue', () => {
      const task = createTask({
        dueAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        isCompleted: false,
      });
      expect(assignQueue(task, now)).toBe('overdue');
    });

    it('should assign zero-weight tasks to deadlines queue', () => {
      expect(assignQueue(createTask({ weight: 0 }), now)).toBe('deadlines');
      expect(assignQueue(createTask({ weight: null }), now)).toBe('deadlines');
    });

    it('should assign normal tasks to active queue', () => {
      const task = createTask({
        weight: 10,
        dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
      expect(assignQueue(task, now)).toBe('active');
    });
  });

  describe('calculateAllFactors', () => {
    it('should calculate all factor components', () => {
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 15,
          taskType: 'midterm',
        }),
        course: createCourse({ currentGrade: 80, targetGrade: 90 }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const factors = calculateAllFactors(input);

      expect(factors.urgency).toBe(85); // Due within 24 hours
      expect(factors.weight).toBe(15);
      expect(factors.courseGap).toBe(20); // 10 point gap
      expect(factors.taskTypeBoost).toBe(7.5); // midterm
      expect(factors.policyAdjustment).toBe(0);
      expect(factors.lockTimeUrgency).toBe(0);
      expect(factors.graceTokenFactor).toBe(0);
      expect(factors.submissionFactor).toBe(0);
    });
  });

  describe('calculateFinalScore', () => {
    it('should sum all factors', () => {
      const factors = {
        urgency: 70,
        weight: 15,
        courseGap: 20,
        policyAdjustment: -10,
        dependency: 5,
        taskTypeBoost: 7.5,
        lockTimeUrgency: 30,
        graceTokenFactor: 10,
        submissionFactor: -50,
      };

      expect(calculateFinalScore(factors)).toBe(97.5);
    });
  });

  describe('calculateGradeImpact (points-based)', () => {
    it('correctly calculates impact for 100-point task with 85% current grade', () => {
      // Current: 850 points earned out of 1000 possible (85%)
      // New task: 100 points possible
      // Skip: 850 / 1100 = 77.3%
      // Ace: 950 / 1100 = 86.4%
      // Average: (850 + 85) / 1100 = 85% (maintains current grade)
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 10,
          pointsPossible: 100,
        }),
        course: createCourse({
          currentGrade: 85,
          targetGrade: 90,
          totalWeight: 100,
        }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      // gradeIfSkipped = 850 / 1100 = 77.27%
      expect(impact.gradeIfSkipped).toBeCloseTo(77.3, 0);
      // gradeIfAverage = (850 + 85) / 1100 = 85%
      expect(impact.gradeIfAverage).toBeCloseTo(85, 0);
    });

    it('handles first task in course (no current points means 0% grade)', () => {
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 100, // First and only task
          pointsPossible: 100,
        }),
        course: createCourse({
          currentGrade: 0, // No grade yet
          targetGrade: 90,
          totalWeight: 100,
        }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      // gradeIfSkipped: 0 / 1100 = 0%
      expect(impact.gradeIfSkipped).toBe(0);
      // gradeIfAverage with 0% current: (0 + 0) / 1100 = 0%
      expect(impact.gradeIfAverage).toBe(0);
    });

    it('handles task worth >50% of total points', () => {
      // Current: 100 points earned out of 100 possible (100%)
      // New task: 200 points possible
      // Skip: 100 / 300 = 33.3%
      // Large tasks should show proportionally larger impact
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 20,
          pointsPossible: 200, // Double the existing points
        }),
        course: createCourse({
          currentGrade: 100,
          targetGrade: 90,
          totalWeight: 10, // Small course weight (100 points basis)
        }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      // With 10% totalWeight: currentPointsPossible = 100, earned = 100
      // totalPointsAfterTask = 100 + 200 = 300
      // gradeIfSkipped = 100 / 300 = 33.3%
      expect(impact.gradeIfSkipped).toBeCloseTo(33.3, 0);
      // Large drop indicates high risk
      expect(impact.riskLevel).toBe('critical');
    });

    it('uses pointsPossible for grade calculation', () => {
      // Verify that pointsPossible (not weight) drives the calculation
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 10, // Weight for priority
          pointsPossible: 50, // Actual points for grade
        }),
        course: createCourse({
          currentGrade: 80,
          targetGrade: 90,
          totalWeight: 100,
        }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      // currentPointsPossible = 1000, earned = 800
      // totalPointsAfterTask = 1000 + 50 = 1050
      // gradeIfSkipped = 800 / 1050 = 76.2%
      expect(impact.gradeIfSkipped).toBeCloseTo(76.2, 0);
    });
  });

  describe('zero weight handling', () => {
    it('returns neutral impact for weight=0 task', () => {
      const input: PriorityInput = {
        task: createTask({ weight: 0, pointsPossible: 100 }),
        course: createCourse({ currentGrade: 85, targetGrade: 90 }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      expect(impact.riskLevel).toBe('low');
      expect(impact.gradeIfSkipped).toBe(85); // No change from current
      expect(impact.gradeIfAverage).toBe(85); // No change from current
      expect(impact.minScoreForTarget).toBeNull();
    });

    it('returns neutral impact for weight=null task', () => {
      const input: PriorityInput = {
        task: createTask({ weight: null, pointsPossible: 100 }),
        course: createCourse({ currentGrade: 85, targetGrade: 90 }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      expect(impact.riskLevel).toBe('low');
      expect(impact.gradeIfSkipped).toBe(85);
      expect(impact.minScoreForTarget).toBeNull();
    });

    it('handles pointsPossible=0 (extra credit or deadline-only)', () => {
      const input: PriorityInput = {
        task: createTask({ weight: 10, pointsPossible: 0 }),
        course: createCourse({ currentGrade: 85, targetGrade: 90 }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      // Should not crash
      const result = calculatePriority(input);
      expect(result.explanation.gradeImpact).toBeDefined();
    });

    it('handles both weight=0 and pointsPossible=0', () => {
      const input: PriorityInput = {
        task: createTask({ weight: 0, pointsPossible: 0 }),
        course: createCourse({ currentGrade: 85, targetGrade: 90 }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      // Should not crash and return neutral impact
      const result = calculatePriority(input);
      expect(result.explanation.gradeImpact.riskLevel).toBe('low');
    });
  });

  describe('calculatePriority (integration)', () => {
    it('should return complete priority result for active task', () => {
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 10,
        }),
        course: createCourse(),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);

      expect(result.taskId).toBe(1);
      expect(result.queue).toBe('active');
      expect(result.score).toBeGreaterThan(0);
      expect(result.explanation).toBeDefined();
      expect(result.explanation.factors.length).toBeGreaterThan(0);
      expect(result.explanation.gradeImpact).toBeDefined();
    });

    it('should return zero score for upcoming tasks', () => {
      const input: PriorityInput = {
        task: createTask({
          unlockAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        }),
        course: createCourse(),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);

      expect(result.queue).toBe('upcoming');
      expect(result.score).toBe(0);
      expect(result.reason).toContain('Unlocks');
    });

    it('should include submission windows when applicable', () => {
      const gracePolicy: GraceTokenPolicy = {
        totalTokens: 5,
        tokensRemaining: 3,
        hoursPerToken: 24,
        maxTokensPerTask: 2,
      };

      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          lockAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
          weight: 10,
        }),
        course: createCourse(),
        policies: [],
        graceTokenPolicy: gracePolicy,
        now,
      };

      const result = calculatePriority(input);

      expect(result.explanation.submissionWindows.length).toBeGreaterThan(0);
      const windowTypes = result.explanation.submissionWindows.map(w => w.type);
      expect(windowTypes).toContain('on_time');
      expect(windowTypes).toContain('grace_token');
      expect(windowTypes).toContain('cutoff');
    });

    it('should calculate correct grade impact', () => {
      const input: PriorityInput = {
        task: createTask({
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          weight: 10,
          pointsPossible: 100,
        }),
        course: createCourse({ currentGrade: 80, targetGrade: 90 }),
        policies: [],
        graceTokenPolicy: null,
        now,
      };

      const result = calculatePriority(input);
      const impact = result.explanation.gradeImpact;

      expect(impact.currentGrade).toBe(80);
      expect(impact.targetGrade).toBe(90);
      expect(impact.gapToTarget).toBe(10);
      // Risk level is now based on grade drop if skipped (points-based calculation)
      // With 100pt task on 1000pt basis, drop is ~7.3% → high risk
      expect(impact.riskLevel).toBe('high');
    });
  });
});
