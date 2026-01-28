/**
 * RecommendationEngine Domain Service Tests
 */

import {
  generateWorkNowRecommendation,
  generateStartEarlyRecommendation,
  generateBreakRecommendation,
  generateCourseFocusRecommendation,
  generateAllRecommendations,
  isRecommendationValid,
  getActiveRecommendations,
} from '../../../src/layers/l3-intelligence/domain/RecommendationEngine';
import {
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
  TaskCompletionEvent,
  StrugglePattern,
  CoursePerformance,
  Recommendation,
  RecommendationContext,
} from '../../../src/layers/l3-intelligence/types';

describe('RecommendationEngine', () => {
  // Helper to create mock tasks
  const createTask = (overrides: Partial<TaskForPriority> = {}): TaskForPriority => ({
    id: 1,
    courseId: 1,
    title: 'Test Task',
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
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
  });

  const createCourse = (
    overrides: Partial<CourseForPriority> = {}
  ): CourseForPriority => ({
    id: 1,
    code: 'CS101',
    name: 'Intro to CS',
    currentGrade: 85,
    targetGrade: 90,
    totalWeight: 100,
    ...overrides,
  });

  const createEstimate = (
    taskId: number,
    minutes: number = 60
  ): EffortEstimate => ({
    taskId,
    courseId: 1,
    taskType: 'assignment',
    pointsPossible: 100,
    estimatedMinutes: minutes,
    actualMinutes: null,
    estimationMethod: 'default',
    confidence: 0.5,
  });

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

  const createContext = (
    overrides: Partial<RecommendationContext> = {}
  ): RecommendationContext => ({
    currentTime: new Date(),
    availableMinutes: 120,
    recentActivity: [],
    userPatterns: [],
    ...overrides,
  });

  describe('generateWorkNowRecommendation', () => {
    it('should return null for no tasks', () => {
      const result = generateWorkNowRecommendation(
        [],
        new Map(),
        new Map(),
        createContext()
      );

      expect(result).toBeNull();
    });

    it('should return null for all completed tasks', () => {
      const tasks = [createTask({ isCompleted: true })];
      const courses = new Map([[1, createCourse()]]);

      const result = generateWorkNowRecommendation(
        tasks,
        courses,
        new Map(),
        createContext()
      );

      expect(result).toBeNull();
    });

    it('should recommend task due soon', () => {
      const soon = new Date();
      soon.setHours(soon.getHours() + 6);

      const tasks = [createTask({ id: 1, dueAt: soon })];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([[1, createEstimate(1, 60)]]);

      const result = generateWorkNowRecommendation(
        tasks,
        courses,
        estimates,
        createContext({ availableMinutes: 120 })
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe('work_now');
      expect(result!.taskId).toBe(1);
    });

    it('should prefer tasks that fit available time', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasks = [
        createTask({ id: 1, dueAt: tomorrow }), // 60 min estimate
        createTask({ id: 2, dueAt: tomorrow }), // 90 min estimate
      ];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([
        [1, createEstimate(1, 60)],
        [2, createEstimate(2, 90)],
      ]);

      const result = generateWorkNowRecommendation(
        tasks,
        courses,
        estimates,
        createContext({ availableMinutes: 90 })
      );

      expect(result).not.toBeNull();
      // Should prefer task 2 as it better fits available time
      expect(result!.taskId).toBe(2);
    });

    it('should include reasoning in recommendation', () => {
      const soon = new Date();
      soon.setHours(soon.getHours() + 12);

      const tasks = [createTask({ id: 1, dueAt: soon, weight: 20 })];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([[1, createEstimate(1, 60)]]);

      const result = generateWorkNowRecommendation(
        tasks,
        courses,
        estimates,
        createContext()
      );

      expect(result!.reasoning).toBeTruthy();
      expect(result!.description).toContain('CS101');
    });
  });

  describe('generateStartEarlyRecommendation', () => {
    it('should return null for no upcoming high-stakes tasks', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasks = [createTask({ dueAt: tomorrow })]; // Too soon
      const courses = new Map([[1, createCourse()]]);

      const result = generateStartEarlyRecommendation(
        tasks,
        courses,
        new Map(),
        [],
        [],
        new Date()
      );

      expect(result).toBeNull();
    });

    it('should recommend high-effort tasks 3-7 days out', () => {
      const fiveDays = new Date();
      fiveDays.setDate(fiveDays.getDate() + 5);

      const tasks = [
        createTask({
          id: 1,
          dueAt: fiveDays,
          taskType: 'project',
          weight: 20,
        }),
      ];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([[1, createEstimate(1, 300)]]); // High effort

      const result = generateStartEarlyRecommendation(
        tasks,
        courses,
        estimates,
        [],
        [],
        new Date()
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe('start_early');
      expect(result!.taskId).toBe(1);
    });

    it('should prioritize tasks with high struggle patterns', () => {
      const fiveDays = new Date();
      fiveDays.setDate(fiveDays.getDate() + 5);

      const tasks = [
        createTask({ id: 1, dueAt: fiveDays, taskType: 'exam' }),
      ];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([[1, createEstimate(1, 120)]]);
      const strugglePatterns: StrugglePattern[] = [
        {
          taskType: 'exam',
          avgScore: 60,
          onTimeRate: 0.5,
          avgDaysEarly: 0,
          struggleScore: 60,
          sampleSize: 10,
        },
      ];

      const result = generateStartEarlyRecommendation(
        tasks,
        courses,
        estimates,
        strugglePatterns,
        [],
        new Date()
      );

      expect(result).not.toBeNull();
      expect(result!.reasoning).toContain('exam');
    });
  });

  describe('generateBreakRecommendation', () => {
    it('should return null for little recent activity', () => {
      const result = generateBreakRecommendation([], new Date());

      expect(result).toBeNull();
    });

    it('should recommend break after 3+ hours of work', () => {
      const now = new Date();
      const recentEvents: TaskCompletionEvent[] = [
        createEvent({
          completedAt: new Date(now.getTime() - 30 * 60 * 1000),
          timeToCompleteMinutes: 90,
        }),
        createEvent({
          completedAt: new Date(now.getTime() - 60 * 60 * 1000),
          timeToCompleteMinutes: 60,
        }),
        createEvent({
          completedAt: new Date(now.getTime() - 120 * 60 * 1000),
          timeToCompleteMinutes: 60,
        }),
      ];

      const result = generateBreakRecommendation(recentEvents, now);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('take_break');
      expect(result!.description).toContain('hours');
    });

    it('should not recommend break for sparse activity', () => {
      const now = new Date();
      const events: TaskCompletionEvent[] = [
        createEvent({
          completedAt: new Date(now.getTime() - 60 * 60 * 1000),
          timeToCompleteMinutes: 30,
        }),
      ];

      const result = generateBreakRecommendation(events, now);

      expect(result).toBeNull();
    });
  });

  describe('generateCourseFocusRecommendation', () => {
    it('should return null for active courses', () => {
      const tasks = [createTask({ courseId: 1 })];
      const courses = new Map([[1, createCourse()]]);
      const recentEvents = [createEvent({ courseId: 1 })];

      const result = generateCourseFocusRecommendation(
        tasks,
        courses,
        recentEvents,
        new Date()
      );

      expect(result).toBeNull();
    });

    it('should recommend neglected course with pending tasks', () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 5);

      const tasks = [
        createTask({ id: 1, courseId: 1, dueAt: nextWeek }),
        createTask({ id: 2, courseId: 1, dueAt: nextWeek }),
      ];
      const courses = new Map([[1, createCourse()]]);
      const recentEvents: TaskCompletionEvent[] = []; // No activity

      const result = generateCourseFocusRecommendation(
        tasks,
        courses,
        recentEvents,
        new Date()
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe('course_focus');
      expect(result!.courseId).toBe(1);
    });

    it('should prioritize course with upcoming deadlines', () => {
      const threeDays = new Date();
      threeDays.setDate(threeDays.getDate() + 3);

      const tasks = [
        createTask({ id: 1, courseId: 1, dueAt: threeDays }),
        createTask({ id: 2, courseId: 1, dueAt: threeDays }),
      ];
      const courses = new Map([[1, createCourse()]]);
      const recentEvents: TaskCompletionEvent[] = [];

      const result = generateCourseFocusRecommendation(
        tasks,
        courses,
        recentEvents,
        new Date()
      );

      expect(result).not.toBeNull();
      expect(result!.description).toContain('due this week');
    });
  });

  describe('generateAllRecommendations', () => {
    it('should generate multiple recommendation types', () => {
      const soon = new Date();
      soon.setHours(soon.getHours() + 6);

      const fiveDays = new Date();
      fiveDays.setDate(fiveDays.getDate() + 5);

      const tasks = [
        createTask({ id: 1, dueAt: soon }),
        createTask({ id: 2, dueAt: fiveDays, taskType: 'project', weight: 20 }),
      ];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([
        [1, createEstimate(1, 60)],
        [2, createEstimate(2, 300)],
      ]);

      const results = generateAllRecommendations(
        tasks,
        courses,
        estimates,
        [],
        [],
        [],
        createContext()
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should sort recommendations by priority score', () => {
      const soon = new Date();
      soon.setHours(soon.getHours() + 6);

      const tasks = [
        createTask({ id: 1, dueAt: soon, weight: 30 }),
        createTask({ id: 2, dueAt: soon, weight: 5 }),
      ];
      const courses = new Map([[1, createCourse()]]);
      const estimates = new Map([
        [1, createEstimate(1, 60)],
        [2, createEstimate(2, 60)],
      ]);

      const results = generateAllRecommendations(
        tasks,
        courses,
        estimates,
        [],
        [],
        [],
        createContext()
      );

      // Should be sorted by priority score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].priorityScore).toBeGreaterThanOrEqual(
          results[i].priorityScore
        );
      }
    });
  });

  describe('isRecommendationValid', () => {
    it('should return false for dismissed recommendations', () => {
      const rec: Recommendation = {
        type: 'work_now',
        taskId: 1,
        courseId: 1,
        title: 'Test',
        description: 'Test',
        reasoning: 'Test',
        priorityScore: 50,
        validFrom: new Date(Date.now() - 1000),
        validUntil: new Date(Date.now() + 60000),
        dismissedAt: new Date(),
        actedOnAt: null,
      };

      expect(isRecommendationValid(rec, new Date())).toBe(false);
    });

    it('should return false for acted-on recommendations', () => {
      const rec: Recommendation = {
        type: 'work_now',
        taskId: 1,
        courseId: 1,
        title: 'Test',
        description: 'Test',
        reasoning: 'Test',
        priorityScore: 50,
        validFrom: new Date(Date.now() - 1000),
        validUntil: new Date(Date.now() + 60000),
        dismissedAt: null,
        actedOnAt: new Date(),
      };

      expect(isRecommendationValid(rec, new Date())).toBe(false);
    });

    it('should return false for expired recommendations', () => {
      const rec: Recommendation = {
        type: 'work_now',
        taskId: 1,
        courseId: 1,
        title: 'Test',
        description: 'Test',
        reasoning: 'Test',
        priorityScore: 50,
        validFrom: new Date(Date.now() - 60000),
        validUntil: new Date(Date.now() - 1000), // Expired
        dismissedAt: null,
        actedOnAt: null,
      };

      expect(isRecommendationValid(rec, new Date())).toBe(false);
    });

    it('should return true for valid recommendations', () => {
      const rec: Recommendation = {
        type: 'work_now',
        taskId: 1,
        courseId: 1,
        title: 'Test',
        description: 'Test',
        reasoning: 'Test',
        priorityScore: 50,
        validFrom: new Date(Date.now() - 1000),
        validUntil: new Date(Date.now() + 60000),
        dismissedAt: null,
        actedOnAt: null,
      };

      expect(isRecommendationValid(rec, new Date())).toBe(true);
    });
  });

  describe('getActiveRecommendations', () => {
    it('should filter to valid recommendations only', () => {
      const now = new Date();
      const recommendations: Recommendation[] = [
        {
          type: 'work_now',
          taskId: 1,
          courseId: 1,
          title: 'Valid',
          description: 'Test',
          reasoning: 'Test',
          priorityScore: 50,
          validFrom: new Date(now.getTime() - 1000),
          validUntil: new Date(now.getTime() + 60000),
          dismissedAt: null,
          actedOnAt: null,
        },
        {
          type: 'work_now',
          taskId: 2,
          courseId: 1,
          title: 'Dismissed',
          description: 'Test',
          reasoning: 'Test',
          priorityScore: 50,
          validFrom: new Date(now.getTime() - 1000),
          validUntil: new Date(now.getTime() + 60000),
          dismissedAt: new Date(),
          actedOnAt: null,
        },
        {
          type: 'work_now',
          taskId: 3,
          courseId: 1,
          title: 'Expired',
          description: 'Test',
          reasoning: 'Test',
          priorityScore: 50,
          validFrom: new Date(now.getTime() - 60000),
          validUntil: new Date(now.getTime() - 1000),
          dismissedAt: null,
          actedOnAt: null,
        },
      ];

      const active = getActiveRecommendations(recommendations, now);

      expect(active).toHaveLength(1);
      expect(active[0].title).toBe('Valid');
    });
  });
});
