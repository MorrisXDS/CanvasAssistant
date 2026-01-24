/**
 * BehaviorAnalytics Domain Service Tests
 */

import {
  analyzeWeeklyRhythm,
  calculateCourseDifficulty,
  identifyStrugglePatterns,
  predictOptimalWorkTime,
  getProductivityScore,
  analyzeCompletionTiming,
} from '../../../src/layers/l3-intelligence/domain/BehaviorAnalytics';
import {
  TaskCompletionEvent,
  CourseForPriority,
} from '../../../src/layers/l3-intelligence/types';

describe('BehaviorAnalytics', () => {
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
    dayOfWeek: 1, // Monday
    hourOfDay: 10,
    daysBeforeDue: 1,
    wasLate: false,
    scoreAchieved: 85,
    pointsPossible: 100,
    ...overrides,
  });

  const createCourse = (
    overrides: Partial<CourseForPriority> = {}
  ): CourseForPriority => ({
    id: 1,
    code: 'CS101',
    name: 'Intro to Computer Science',
    currentGrade: 85,
    targetGrade: 90,
    totalWeight: 100,
    ...overrides,
  });

  describe('analyzeWeeklyRhythm', () => {
    it('should return default rhythm for empty events', () => {
      const rhythm = analyzeWeeklyRhythm([]);

      expect(rhythm.sampleSize).toBe(0);
      expect(rhythm.confidence).toBe(0);
      expect(rhythm.productiveDays).toHaveLength(7);
      expect(rhythm.productiveHours).toHaveLength(24);
    });

    it('should calculate productive days from events', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ dayOfWeek: 1, hourOfDay: 10 }),
        createEvent({ dayOfWeek: 1, hourOfDay: 11 }),
        createEvent({ dayOfWeek: 1, hourOfDay: 14 }),
        createEvent({ dayOfWeek: 3, hourOfDay: 9 }),
        createEvent({ dayOfWeek: 3, hourOfDay: 15 }),
      ];

      const rhythm = analyzeWeeklyRhythm(events);

      expect(rhythm.sampleSize).toBe(5);
      expect(rhythm.peakDay).toBe(1); // Monday has most completions
      expect(rhythm.productiveDays[1].completionCount).toBe(3);
      expect(rhythm.productiveDays[3].completionCount).toBe(2);
    });

    it('should calculate productive hours from events', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ hourOfDay: 10 }),
        createEvent({ hourOfDay: 10 }),
        createEvent({ hourOfDay: 10 }),
        createEvent({ hourOfDay: 14 }),
      ];

      const rhythm = analyzeWeeklyRhythm(events);

      expect(rhythm.peakHour).toBe(10);
      expect(rhythm.productiveHours[10].completionCount).toBe(3);
      expect(rhythm.productiveHours[14].completionCount).toBe(1);
    });

    it('should calculate average scores', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ dayOfWeek: 1, scoreAchieved: 90, pointsPossible: 100 }),
        createEvent({ dayOfWeek: 1, scoreAchieved: 80, pointsPossible: 100 }),
      ];

      const rhythm = analyzeWeeklyRhythm(events);

      expect(rhythm.productiveDays[1].avgScore).toBe(85);
    });

    it('should increase confidence with more samples', () => {
      const fewEvents = Array(10).fill(null).map(() => createEvent());
      const manyEvents = Array(50).fill(null).map(() => createEvent());

      const fewRhythm = analyzeWeeklyRhythm(fewEvents);
      const manyRhythm = analyzeWeeklyRhythm(manyEvents);

      expect(manyRhythm.confidence).toBeGreaterThan(fewRhythm.confidence);
      expect(manyRhythm.confidence).toBe(1);
    });
  });

  describe('calculateCourseDifficulty', () => {
    it('should return empty array for no events', () => {
      const result = calculateCourseDifficulty([], [createCourse()]);
      expect(result).toEqual([]);
    });

    it('should calculate struggle score based on scores and late rate', () => {
      const course = createCourse({ id: 1 });
      const events: TaskCompletionEvent[] = [
        createEvent({ courseId: 1, scoreAchieved: 60, pointsPossible: 100, wasLate: true }),
        createEvent({ courseId: 1, scoreAchieved: 70, pointsPossible: 100, wasLate: false }),
        createEvent({ courseId: 1, scoreAchieved: 65, pointsPossible: 100, wasLate: true }),
      ];

      const result = calculateCourseDifficulty(events, [course]);

      expect(result).toHaveLength(1);
      expect(result[0].courseId).toBe(1);
      expect(result[0].avgScore).toBeCloseTo(65);
      expect(result[0].lateRate).toBeCloseTo(2 / 3);
      expect(result[0].struggleScore).toBeGreaterThan(0);
    });

    it('should sort courses by struggle score descending', () => {
      const courses = [
        createCourse({ id: 1, code: 'CS101' }),
        createCourse({ id: 2, code: 'MATH201' }),
      ];
      const events: TaskCompletionEvent[] = [
        // CS101: Good performance
        createEvent({ courseId: 1, scoreAchieved: 95, pointsPossible: 100, wasLate: false }),
        createEvent({ courseId: 1, scoreAchieved: 90, pointsPossible: 100, wasLate: false }),
        // MATH201: Poor performance
        createEvent({ courseId: 2, scoreAchieved: 50, pointsPossible: 100, wasLate: true }),
        createEvent({ courseId: 2, scoreAchieved: 55, pointsPossible: 100, wasLate: true }),
      ];

      const result = calculateCourseDifficulty(events, courses);

      expect(result[0].courseCode).toBe('MATH201');
      expect(result[0].struggleScore).toBeGreaterThan(result[1].struggleScore);
    });
  });

  describe('identifyStrugglePatterns', () => {
    it('should return empty array for no events', () => {
      const result = identifyStrugglePatterns([]);
      expect(result).toEqual([]);
    });

    it('should group by task type and calculate metrics', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ taskType: 'quiz', scoreAchieved: 90, pointsPossible: 100, wasLate: false }),
        createEvent({ taskType: 'quiz', scoreAchieved: 85, pointsPossible: 100, wasLate: false }),
        createEvent({ taskType: 'exam', scoreAchieved: 60, pointsPossible: 100, wasLate: true }),
        createEvent({ taskType: 'exam', scoreAchieved: 55, pointsPossible: 100, wasLate: true }),
      ];

      const result = identifyStrugglePatterns(events);

      expect(result).toHaveLength(2);

      const examPattern = result.find((p) => p.taskType === 'exam');
      const quizPattern = result.find((p) => p.taskType === 'quiz');

      expect(examPattern!.struggleScore).toBeGreaterThan(quizPattern!.struggleScore);
      expect(examPattern!.avgScore).toBeCloseTo(57.5);
      expect(quizPattern!.avgScore).toBeCloseTo(87.5);
    });

    it('should sort by struggle score descending', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ taskType: 'assignment', scoreAchieved: 95, pointsPossible: 100 }),
        createEvent({ taskType: 'project', scoreAchieved: 50, pointsPossible: 100, wasLate: true }),
      ];

      const result = identifyStrugglePatterns(events);

      expect(result[0].taskType).toBe('project');
    });
  });

  describe('predictOptimalWorkTime', () => {
    it('should return null for insufficient data', () => {
      const result = predictOptimalWorkTime('assignment', 1, [
        createEvent({ taskType: 'assignment', courseId: 1 }),
      ]);

      expect(result).toBeNull();
    });

    it('should predict based on successful completions', () => {
      const events: TaskCompletionEvent[] = Array(10)
        .fill(null)
        .map(() =>
          createEvent({
            taskType: 'assignment',
            courseId: 1,
            dayOfWeek: 2,
            hourOfDay: 14,
            wasLate: false,
            scoreAchieved: 85,
            pointsPossible: 100,
          })
        );

      const result = predictOptimalWorkTime('assignment', 1, events);

      expect(result).not.toBeNull();
      expect(result!.dayOfWeek).toBe(2);
      expect(result!.hourOfDay).toBe(14);
    });

    it('should fallback to general patterns if specific data insufficient', () => {
      const events: TaskCompletionEvent[] = [
        // Only 2 for specific task type + course
        createEvent({ taskType: 'quiz', courseId: 1, dayOfWeek: 2, hourOfDay: 10 }),
        createEvent({ taskType: 'quiz', courseId: 1, dayOfWeek: 2, hourOfDay: 10 }),
        // More general successful completions
        ...Array(10)
          .fill(null)
          .map(() =>
            createEvent({
              taskType: 'assignment',
              courseId: 2,
              dayOfWeek: 3,
              hourOfDay: 15,
              wasLate: false,
              scoreAchieved: 80,
              pointsPossible: 100,
            })
          ),
      ];

      const result = predictOptimalWorkTime('quiz', 1, events);

      // Should fall back to general patterns since quiz/course 1 has only 2 samples
      expect(result).not.toBeNull();
    });
  });

  describe('getProductivityScore', () => {
    it('should return 50 for empty rhythm', () => {
      const emptyRhythm = analyzeWeeklyRhythm([]);
      const score = getProductivityScore(1, 10, emptyRhythm);
      expect(score).toBe(50);
    });

    it('should return higher score for peak time', () => {
      const events: TaskCompletionEvent[] = Array(20)
        .fill(null)
        .map(() =>
          createEvent({
            dayOfWeek: 1,
            hourOfDay: 10,
          })
        );

      const rhythm = analyzeWeeklyRhythm(events);

      const peakScore = getProductivityScore(1, 10, rhythm);
      const offPeakScore = getProductivityScore(0, 0, rhythm);

      expect(peakScore).toBeGreaterThan(offPeakScore);
    });
  });

  describe('analyzeCompletionTiming', () => {
    it('should return defaults for empty events', () => {
      const result = analyzeCompletionTiming([]);

      expect(result.avgDaysBeforeDue).toBe(0);
      expect(result.percentOnTime).toBe(100);
      expect(result.percentLate).toBe(0);
    });

    it('should calculate timing statistics', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ daysBeforeDue: 3, wasLate: false }),
        createEvent({ daysBeforeDue: 2, wasLate: false }),
        createEvent({ daysBeforeDue: 0, wasLate: false }),
        createEvent({ daysBeforeDue: -1, wasLate: true }),
      ];

      const result = analyzeCompletionTiming(events);

      expect(result.avgDaysBeforeDue).toBe(1); // (3+2+0-1)/4
      expect(result.percentOnTime).toBe(75);
      expect(result.percentLate).toBe(25);
      expect(result.percentEarly).toBe(50); // 2 events > 1 day early
    });

    it('should calculate median correctly', () => {
      const events: TaskCompletionEvent[] = [
        createEvent({ daysBeforeDue: 1 }),
        createEvent({ daysBeforeDue: 2 }),
        createEvent({ daysBeforeDue: 10 }),
      ];

      const result = analyzeCompletionTiming(events);

      expect(result.medianDaysBeforeDue).toBe(2);
    });
  });
});
