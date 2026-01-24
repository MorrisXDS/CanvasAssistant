/**
 * WorkloadAnalyzer Domain Service Tests
 */

import {
  calculateClusteringScore,
  analyzeWorkloadDistribution,
  suggestRedistribution,
  detectNeglectedCourses,
  calculateCourseBalanceScore,
  getDailyWorkloadSummary,
  identifyDeadlineClusters,
} from '../../../src/layers/l3-intelligence/domain/WorkloadAnalyzer';
import {
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
  TaskCompletionEvent,
} from '../../../src/layers/l3-intelligence/types';

describe('WorkloadAnalyzer', () => {
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

  describe('calculateClusteringScore', () => {
    it('should return 0 for empty tasks', () => {
      const score = calculateClusteringScore([], 7);
      expect(score).toBe(0);
    });

    it('should return 0 for single task', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasks = [createTask({ dueAt: tomorrow })];
      const score = calculateClusteringScore(tasks, 7);

      expect(score).toBe(0);
    });

    it('should return high score for clustered deadlines', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // All tasks due on same day
      const tasks = Array(5)
        .fill(null)
        .map((_, i) =>
          createTask({
            id: i + 1,
            dueAt: tomorrow,
          })
        );

      const score = calculateClusteringScore(tasks, 7);

      expect(score).toBeGreaterThan(0.5);
    });

    it('should return low score for spread deadlines', () => {
      const tasks = Array(7)
        .fill(null)
        .map((_, i) => {
          const due = new Date();
          due.setDate(due.getDate() + i + 1);
          return createTask({ id: i + 1, dueAt: due });
        });

      const score = calculateClusteringScore(tasks, 7);

      expect(score).toBeLessThan(0.3);
    });

    it('should exclude completed tasks', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasks = [
        createTask({ id: 1, dueAt: tomorrow, isCompleted: false }),
        createTask({ id: 2, dueAt: tomorrow, isCompleted: true }),
        createTask({ id: 3, dueAt: tomorrow, isCompleted: true }),
      ];

      const score = calculateClusteringScore(tasks, 7);

      // Only 1 incomplete task should count
      expect(score).toBe(0);
    });
  });

  describe('analyzeWorkloadDistribution', () => {
    it('should create daily snapshots for date range', () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 6); // 7 days

      const result = analyzeWorkloadDistribution(
        [],
        startDate,
        endDate,
        new Map()
      );

      expect(result.dailySnapshots.length).toBe(7);
      expect(result.startDate).toEqual(startDate);
      expect(result.endDate).toEqual(endDate);
    });

    it('should identify peak day', () => {
      const peakDay = new Date();
      peakDay.setDate(peakDay.getDate() + 3);
      peakDay.setHours(12, 0, 0, 0);

      const tasks = [
        createTask({ id: 1, dueAt: peakDay }),
        createTask({ id: 2, dueAt: peakDay }),
        createTask({ id: 3, dueAt: peakDay }),
      ];

      const estimates = new Map<number, EffortEstimate>();
      estimates.set(1, createEstimate(1, 60));
      estimates.set(2, createEstimate(2, 60));
      estimates.set(3, createEstimate(3, 60));

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const result = analyzeWorkloadDistribution(
        tasks,
        startDate,
        endDate,
        estimates
      );

      expect(result.peakMinutes).toBe(180);
      expect(result.peakDay).not.toBeNull();
    });

    it('should calculate balance score', () => {
      const result = analyzeWorkloadDistribution(
        [],
        new Date(),
        new Date(),
        new Map()
      );

      // No clustering = high balance
      expect(result.balanceScore).toBeGreaterThanOrEqual(0);
      expect(result.balanceScore).toBeLessThanOrEqual(100);
    });
  });

  describe('suggestRedistribution', () => {
    it('should return empty for balanced workload', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasks = [createTask({ id: 1, dueAt: tomorrow })];
      const estimates = new Map<number, EffortEstimate>();
      estimates.set(1, createEstimate(1, 60));

      const suggestions = suggestRedistribution(tasks, 4, estimates);

      expect(suggestions).toEqual([]);
    });

    it('should suggest moving tasks when day is overloaded', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      // 6 hours of work on one day, but only 4 hours available
      const tasks = [
        createTask({ id: 1, dueAt: tomorrow }),
        createTask({ id: 2, dueAt: tomorrow }),
        createTask({ id: 3, dueAt: tomorrow }),
      ];

      const estimates = new Map<number, EffortEstimate>();
      estimates.set(1, createEstimate(1, 120));
      estimates.set(2, createEstimate(2, 120));
      estimates.set(3, createEstimate(3, 120));

      const suggestions = suggestRedistribution(tasks, 4, estimates);

      expect(suggestions.length).toBeGreaterThan(0);
      suggestions.forEach((s) => {
        expect(s.suggestedDate.getTime()).toBeLessThan(s.currentDueDate.getTime());
      });
    });
  });

  describe('detectNeglectedCourses', () => {
    it('should return empty for active courses', () => {
      const courses = [createCourse({ id: 1 })];
      const tasks = [createTask({ courseId: 1 })];
      const events: TaskCompletionEvent[] = [
        {
          taskId: 1,
          courseId: 1,
          taskType: 'assignment',
          startedAt: null,
          completedAt: new Date(),
          dueAt: null,
          timeToCompleteMinutes: 60,
          dayOfWeek: 1,
          hourOfDay: 10,
          daysBeforeDue: 1,
          wasLate: false,
          scoreAchieved: 85,
          pointsPossible: 100,
        },
      ];

      const result = detectNeglectedCourses(tasks, events, courses, 14);

      // Course has recent activity and task, shouldn't be flagged as neglected
      // unless the neglect score is high enough
      expect(result.length).toBe(0);
    });

    it('should flag courses with no recent activity', () => {
      const courses = [createCourse({ id: 1 })];

      const futureTask = new Date();
      futureTask.setDate(futureTask.getDate() + 5);

      const tasks = [createTask({ courseId: 1, dueAt: futureTask })];

      // Event from 20 days ago
      const oldEvent = new Date();
      oldEvent.setDate(oldEvent.getDate() - 20);

      const events: TaskCompletionEvent[] = [
        {
          taskId: 1,
          courseId: 1,
          taskType: 'assignment',
          startedAt: null,
          completedAt: oldEvent,
          dueAt: null,
          timeToCompleteMinutes: 60,
          dayOfWeek: 1,
          hourOfDay: 10,
          daysBeforeDue: 1,
          wasLate: false,
          scoreAchieved: 85,
          pointsPossible: 100,
        },
      ];

      const result = detectNeglectedCourses(tasks, events, courses, 14);

      expect(result.length).toBe(1);
      expect(result[0].courseId).toBe(1);
      expect(result[0].daysSinceActivity).toBeGreaterThanOrEqual(14);
    });
  });

  describe('calculateCourseBalanceScore', () => {
    it('should return 100 for single course', () => {
      const courses = [createCourse({ id: 1 })];
      const tasks = [createTask({ courseId: 1 })];

      const score = calculateCourseBalanceScore(tasks, courses);

      expect(score).toBe(100);
    });

    it('should return 100 for no tasks', () => {
      const courses = [createCourse({ id: 1 }), createCourse({ id: 2 })];

      const score = calculateCourseBalanceScore([], courses);

      expect(score).toBe(100);
    });

    it('should return high score for balanced distribution', () => {
      const courses = [
        createCourse({ id: 1 }),
        createCourse({ id: 2 }),
      ];
      const tasks = [
        createTask({ id: 1, courseId: 1 }),
        createTask({ id: 2, courseId: 1 }),
        createTask({ id: 3, courseId: 2 }),
        createTask({ id: 4, courseId: 2 }),
      ];

      const score = calculateCourseBalanceScore(tasks, courses);

      expect(score).toBe(100);
    });

    it('should return low score for imbalanced distribution', () => {
      const courses = [
        createCourse({ id: 1 }),
        createCourse({ id: 2 }),
      ];
      const tasks = [
        createTask({ id: 1, courseId: 1 }),
        createTask({ id: 2, courseId: 1 }),
        createTask({ id: 3, courseId: 1 }),
        createTask({ id: 4, courseId: 1 }),
        createTask({ id: 5, courseId: 1 }),
        // Only course 1 has tasks
      ];

      const score = calculateCourseBalanceScore(tasks, courses);

      expect(score).toBeLessThan(50);
    });
  });

  describe('getDailyWorkloadSummary', () => {
    it('should summarize workload for a day', () => {
      const today = new Date();
      const todayNoon = new Date(today);
      todayNoon.setHours(12, 0, 0, 0);

      const tasks = [
        createTask({ id: 1, dueAt: todayNoon }),
        createTask({ id: 2, dueAt: todayNoon }),
      ];

      const estimates = new Map<number, EffortEstimate>();
      estimates.set(1, createEstimate(1, 60));
      estimates.set(2, createEstimate(2, 90));

      const summary = getDailyWorkloadSummary(tasks, estimates, today);

      expect(summary.totalTasks).toBe(2);
      expect(summary.totalMinutes).toBe(150);
    });

    it('should set overload warning when exceeding capacity', () => {
      const today = new Date();
      const todayNoon = new Date(today);
      todayNoon.setHours(12, 0, 0, 0);

      // 10 hours of work
      const tasks = Array(10)
        .fill(null)
        .map((_, i) => createTask({ id: i + 1, dueAt: todayNoon }));

      const estimates = new Map<number, EffortEstimate>();
      tasks.forEach((t) => estimates.set(t.id, createEstimate(t.id, 60)));

      const summary = getDailyWorkloadSummary(tasks, estimates, today);

      expect(summary.overloadWarning).toBe(true);
    });
  });

  describe('identifyDeadlineClusters', () => {
    it('should return empty for no clusters', () => {
      const tasks = Array(5)
        .fill(null)
        .map((_, i) => {
          const due = new Date();
          due.setHours(due.getHours() + i * 12); // 12 hours apart
          return createTask({ id: i + 1, dueAt: due });
        });

      const clusters = identifyDeadlineClusters(tasks, 48);

      // Tasks 12 hours apart should form cluster if within 4 hours
      // With 12 hour spacing, no clusters
      expect(clusters.length).toBe(0);
    });

    it('should identify tasks within 4 hours as cluster', () => {
      const now = new Date();
      const soonDue = new Date(now);
      soonDue.setHours(soonDue.getHours() + 6);

      const tasks = [
        createTask({ id: 1, dueAt: soonDue }),
        createTask({ id: 2, dueAt: new Date(soonDue.getTime() + 60 * 60 * 1000) }), // +1 hour
        createTask({ id: 3, dueAt: new Date(soonDue.getTime() + 120 * 60 * 1000) }), // +2 hours
      ];

      const clusters = identifyDeadlineClusters(tasks, 48);

      expect(clusters.length).toBe(1);
      expect(clusters[0].tasks.length).toBe(3);
    });

    it('should set severity based on task count', () => {
      const now = new Date();
      const soonDue = new Date(now);
      soonDue.setHours(soonDue.getHours() + 6);

      // 5 tasks in cluster = critical
      const tasks = Array(5)
        .fill(null)
        .map((_, i) =>
          createTask({
            id: i + 1,
            dueAt: new Date(soonDue.getTime() + i * 30 * 60 * 1000), // 30 min apart
          })
        );

      const clusters = identifyDeadlineClusters(tasks, 48);

      expect(clusters[0].severity).toBe('critical');
    });
  });
});
