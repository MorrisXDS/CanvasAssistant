/**
 * EffortEstimator Domain Service Tests
 */

import {
  DEFAULT_EFFORT_MINUTES,
  getDefaultEffort,
  calculatePointsBasedEffort,
  calculateHistoricalAverage,
  calculateCourseMultiplier,
  estimateEffort,
  batchEstimateEffort,
  calibrateEstimates,
  calculateAccuracyMetrics,
  formatEffortEstimate,
  getEffortLevel,
} from '../../../src/layers/l3-intelligence/domain/EffortEstimator';
import {
  TaskForPriority,
  TaskCompletionEvent,
  EffortCalibrationInput,
} from '../../../src/layers/l3-intelligence/types';

describe('EffortEstimator', () => {
  // Helper to create mock tasks
  const createTask = (overrides: Partial<TaskForPriority> = {}): TaskForPriority => ({
    id: 1,
    courseId: 1,
    title: 'Test Task',
    dueAt: new Date(),
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
  });

  // Helper to create mock completion events
  const createEvent = (
    overrides: Partial<TaskCompletionEvent> = {}
  ): TaskCompletionEvent => ({
    taskId: 1,
    courseId: 1,
    taskType: 'assignment',
    startedAt: null,
    completedAt: new Date(),
    dueAt: new Date(),
    timeToCompleteMinutes: 60,
    dayOfWeek: 1,
    hourOfDay: 10,
    daysBeforeDue: 1,
    wasLate: false,
    scoreAchieved: 85,
    pointsPossible: 100,
    ...overrides,
  });

  describe('DEFAULT_EFFORT_MINUTES', () => {
    it('should have expected task types', () => {
      expect(DEFAULT_EFFORT_MINUTES.final).toBe(480);
      expect(DEFAULT_EFFORT_MINUTES.midterm).toBe(360);
      expect(DEFAULT_EFFORT_MINUTES.exam).toBe(240);
      expect(DEFAULT_EFFORT_MINUTES.assignment).toBe(90);
      expect(DEFAULT_EFFORT_MINUTES.quiz).toBe(30);
      expect(DEFAULT_EFFORT_MINUTES.discussion).toBe(20);
    });
  });

  describe('getDefaultEffort', () => {
    it('should return correct default for known types', () => {
      expect(getDefaultEffort('assignment')).toBe(90);
      expect(getDefaultEffort('quiz')).toBe(30);
      expect(getDefaultEffort('final')).toBe(480);
    });

    it('should return other default for unknown types', () => {
      expect(getDefaultEffort('unknown')).toBe(60);
      expect(getDefaultEffort('')).toBe(60);
    });

    it('should be case insensitive', () => {
      expect(getDefaultEffort('QUIZ')).toBe(30);
      expect(getDefaultEffort('Assignment')).toBe(90);
    });
  });

  describe('calculatePointsBasedEffort', () => {
    it('should return default effort for null points', () => {
      const result = calculatePointsBasedEffort('assignment', null);
      expect(result).toBe(90);
    });

    it('should return default effort for zero points', () => {
      const result = calculatePointsBasedEffort('assignment', 0);
      expect(result).toBe(90);
    });

    it('should scale effort based on points', () => {
      const lowPoints = calculatePointsBasedEffort('assignment', 10);
      const highPoints = calculatePointsBasedEffort('assignment', 100);

      expect(highPoints).toBeGreaterThan(lowPoints);
    });

    it('should clamp to reasonable bounds', () => {
      const veryHighPoints = calculatePointsBasedEffort('quiz', 1000);

      // Should not exceed 3x default (30 * 3 = 90)
      expect(veryHighPoints).toBeLessThanOrEqual(90);
    });
  });

  describe('calculateHistoricalAverage', () => {
    it('should return null for insufficient data', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 60 }),
      ];

      const result = calculateHistoricalAverage('assignment', 1, events);
      expect(result).toBeNull();
    });

    it('should calculate average from historical data', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 60 }),
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 90 }),
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 120 }),
      ];

      const result = calculateHistoricalAverage('assignment', 1, events);

      expect(result).not.toBeNull();
      expect(result!.average).toBe(90);
      expect(result!.sampleSize).toBe(3);
    });

    it('should fallback to type-wide data if course-specific is insufficient', () => {
      const events: TaskCompletionEvent[] = [
        // Course 1: only 2 events
        createEvent({ taskType: 'quiz', courseId: 1, timeToCompleteMinutes: 30 }),
        createEvent({ taskType: 'quiz', courseId: 1, timeToCompleteMinutes: 40 }),
        // Course 2: enough events
        createEvent({ taskType: 'quiz', courseId: 2, timeToCompleteMinutes: 20 }),
        createEvent({ taskType: 'quiz', courseId: 2, timeToCompleteMinutes: 25 }),
      ];

      const result = calculateHistoricalAverage('quiz', 1, events);

      // Should use all quiz events since course-specific has < 3
      expect(result).not.toBeNull();
      expect(result!.sampleSize).toBe(4);
    });

    it('should exclude events with null time', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 60 }),
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: null }),
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 90 }),
        createEvent({ taskType: 'assignment', courseId: 1, timeToCompleteMinutes: 120 }),
      ];

      const result = calculateHistoricalAverage('assignment', 1, events);

      expect(result!.sampleSize).toBe(3);
    });
  });

  describe('calculateCourseMultiplier', () => {
    it('should return 1.0 for insufficient data', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ courseId: 1, timeToCompleteMinutes: 120 }),
      ];

      const result = calculateCourseMultiplier(1, events);
      expect(result).toBe(1.0);
    });

    it('should calculate multiplier based on actual vs expected time', () => {
      // Events where actual time is 2x expected
      const events: TaskCompletionEvent[] = Array(5)
        .fill(null)
        .map(() =>
          createEvent({
            courseId: 1,
            taskType: 'assignment',
            timeToCompleteMinutes: 180, // Expected is 90
          })
        );

      const result = calculateCourseMultiplier(1, events);

      expect(result).toBeGreaterThan(1.0);
      expect(result).toBe(2.0); // Clamped at 2.0
    });

    it('should clamp to valid range', () => {
      // Very fast completions
      const fastEvents: TaskCompletionEvent[] = Array(5)
        .fill(null)
        .map(() =>
          createEvent({
            courseId: 1,
            taskType: 'assignment',
            timeToCompleteMinutes: 10, // Much faster than expected 90
          })
        );

      const fastResult = calculateCourseMultiplier(1, fastEvents);
      expect(fastResult).toBeGreaterThanOrEqual(0.5);

      // Very slow completions
      const slowEvents: TaskCompletionEvent[] = Array(5)
        .fill(null)
        .map(() =>
          createEvent({
            courseId: 1,
            taskType: 'assignment',
            timeToCompleteMinutes: 500,
          })
        );

      const slowResult = calculateCourseMultiplier(1, slowEvents);
      expect(slowResult).toBeLessThanOrEqual(2.0);
    });
  });

  describe('estimateEffort', () => {
    it('should use default method when no historical data', () => {
      const task = createTask({ taskType: 'quiz', pointsPossible: null });
      const events: TaskCompletionEvent[] = [];

      const result = estimateEffort(task, events);

      expect(result.estimationMethod).toBe('default');
      expect(result.estimatedMinutes).toBe(30);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should use calibrated method with enough historical data', () => {
      const task = createTask({ taskType: 'assignment', courseId: 1 });
      const events: TaskCompletionEvent[] = Array(10)
        .fill(null)
        .map(() =>
          createEvent({
            taskType: 'assignment',
            courseId: 1,
            timeToCompleteMinutes: 120,
          })
        );

      const result = estimateEffort(task, events);

      expect(result.estimationMethod).toBe('calibrated');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should round to nearest 5 minutes', () => {
      const task = createTask();
      const result = estimateEffort(task, []);

      expect(result.estimatedMinutes % 5).toBe(0);
    });
  });

  describe('batchEstimateEffort', () => {
    it('should estimate effort for multiple tasks', () => {
      const tasks: TaskForPriority[] = [
        createTask({ id: 1, taskType: 'quiz' }),
        createTask({ id: 2, taskType: 'assignment' }),
        createTask({ id: 3, taskType: 'exam' }),
      ];

      const results = batchEstimateEffort(tasks, []);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.taskId)).toEqual([1, 2, 3]);
    });

    it('should use consistent course multipliers', () => {
      const tasks: TaskForPriority[] = [
        createTask({ id: 1, courseId: 1, taskType: 'assignment' }),
        createTask({ id: 2, courseId: 1, taskType: 'assignment' }),
      ];

      const events: TaskCompletionEvent[] = Array(10)
        .fill(null)
        .map(() =>
          createEvent({
            courseId: 1,
            taskType: 'assignment',
            timeToCompleteMinutes: 180,
          })
        );

      const results = batchEstimateEffort(tasks, events);

      // Both should have same multiplier applied
      expect(results[0].estimatedMinutes).toBe(results[1].estimatedMinutes);
    });
  });

  describe('calibrateEstimates', () => {
    it('should return empty map for insufficient data', () => {
      const data: EffortCalibrationInput[] = [
        { taskId: 1, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 25 },
      ];

      const result = calibrateEstimates(data);

      expect(result.size).toBe(0);
    });

    it('should calculate calibration multipliers', () => {
      const data: EffortCalibrationInput[] = [
        { taskId: 1, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 60 },
        { taskId: 2, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 60 },
        { taskId: 3, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 60 },
      ];

      const result = calibrateEstimates(data);

      expect(result.has('quiz')).toBe(true);
      expect(result.get('quiz')).toBe(2.0); // Actual is 2x estimated
    });
  });

  describe('calculateAccuracyMetrics', () => {
    it('should return perfect metrics for empty data', () => {
      const result = calculateAccuracyMetrics([]);

      expect(result.meanAbsoluteError).toBe(0);
      expect(result.accurateRate).toBe(1);
    });

    it('should calculate accuracy metrics correctly', () => {
      const data: EffortCalibrationInput[] = [
        { taskId: 1, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 30 }, // Perfect
        { taskId: 2, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 35 }, // Within 20%
        { taskId: 3, taskType: 'quiz', courseId: 1, estimatedMinutes: 30, actualMinutes: 60 }, // Underestimate
        { taskId: 4, taskType: 'quiz', courseId: 1, estimatedMinutes: 60, actualMinutes: 30 }, // Overestimate
      ];

      const result = calculateAccuracyMetrics(data);

      expect(result.accurateRate).toBe(50); // 2 out of 4 within 20%
      expect(result.underestimateRate).toBe(25); // 1 out of 4
      expect(result.overestimateRate).toBe(25); // 1 out of 4
    });
  });

  describe('formatEffortEstimate', () => {
    it('should format minutes only for < 60', () => {
      expect(formatEffortEstimate(30)).toBe('30 min');
      expect(formatEffortEstimate(45)).toBe('45 min');
    });

    it('should format hours for >= 60', () => {
      expect(formatEffortEstimate(60)).toBe('1h');
      expect(formatEffortEstimate(120)).toBe('2h');
    });

    it('should format hours and minutes', () => {
      expect(formatEffortEstimate(90)).toBe('1h 30m');
      expect(formatEffortEstimate(150)).toBe('2h 30m');
    });
  });

  describe('getEffortLevel', () => {
    it('should categorize effort levels correctly', () => {
      expect(getEffortLevel(10)).toBe('quick');
      expect(getEffortLevel(30)).toBe('short');
      expect(getEffortLevel(60)).toBe('medium');
      expect(getEffortLevel(180)).toBe('long');
      expect(getEffortLevel(300)).toBe('extended');
    });
  });
});
