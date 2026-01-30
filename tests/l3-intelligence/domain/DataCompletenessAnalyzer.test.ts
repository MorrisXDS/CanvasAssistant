/**
 * DataCompletenessAnalyzer Tests
 *
 * Tests for the L3 data completeness analysis functions.
 * These are pure functions with no database dependencies.
 */

import {
  analyzeCourseCompleteness,
  analyzeTaskCompleteness,
  generateDataCompletenessInsights,
  getDataCompletenessSummary,
  MissingFieldNotification,
} from '../../../src/layers/l3-intelligence/domain/DataCompletenessAnalyzer';
import type { CourseForPriority, TaskForPriority } from '../../../src/layers/l3-intelligence/types';

describe('DataCompletenessAnalyzer', () => {
  // Helper to create a minimal course
  const createCourse = (overrides: Partial<CourseForPriority> = {}): CourseForPriority => ({
    id: 1,
    code: 'TEST101',
    name: 'Test Course',
    currentGrade: 75,
    targetGrade: 85, // Non-default value
    totalWeight: 100,
    ...overrides,
  });

  // Helper to create a minimal task
  const createTask = (overrides: Partial<TaskForPriority> = {}): TaskForPriority => ({
    id: 1,
    courseId: 1,
    title: 'Test Assignment',
    dueAt: new Date('2025-01-30T23:59:00Z'),
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

  describe('analyzeCourseCompleteness', () => {
    it('should return empty array for complete courses', () => {
      const courses = [
        createCourse({ id: 1, targetGrade: 85, currentGrade: 78 }),
        createCourse({ id: 2, targetGrade: 90, currentGrade: 82 }),
      ];

      const notifications = analyzeCourseCompleteness(courses);

      expect(notifications).toEqual([]);
    });

    it('should flag course with default target grade and no current grade', () => {
      const courses = [
        createCourse({ id: 1, code: 'CS101', targetGrade: 80, currentGrade: null }),
      ];

      const notifications = analyzeCourseCompleteness(courses);

      expect(notifications).toHaveLength(2); // Both target grade and current grade issues
      const targetNotification = notifications.find((n) => n.fieldName === 'targetGrade');
      expect(targetNotification).toBeDefined();
      expect(targetNotification?.importance).toBe('critical');
      expect(targetNotification?.entityName).toBe('CS101');
    });

    it('should flag missing current grade as recommended', () => {
      const courses = [
        createCourse({ id: 1, code: 'CS101', targetGrade: 90, currentGrade: null }),
      ];

      const notifications = analyzeCourseCompleteness(courses);

      expect(notifications).toHaveLength(1);
      expect(notifications[0].fieldName).toBe('currentGrade');
      expect(notifications[0].importance).toBe('recommended');
    });

    it('should not flag default target grade if current grade exists', () => {
      const courses = [
        createCourse({ id: 1, targetGrade: 80, currentGrade: 75 }),
      ];

      const notifications = analyzeCourseCompleteness(courses);

      // Should not flag target grade because current grade exists
      const targetNotification = notifications.find((n) => n.fieldName === 'targetGrade');
      expect(targetNotification).toBeUndefined();
    });

    it('should generate correct action for target grade notification', () => {
      const courses = [
        createCourse({ id: 42, code: 'TEST', targetGrade: 80, currentGrade: null }),
      ];

      const notifications = analyzeCourseCompleteness(courses);
      const notification = notifications.find((n) => n.fieldName === 'targetGrade');

      expect(notification?.action.type).toBe('navigate');
      expect(notification?.action.target).toBe('/course/42');
    });
  });

  describe('analyzeTaskCompleteness', () => {
    it('should return empty array when all tasks complete', () => {
      const tasks = [
        createTask({ id: 1, isCompleted: true, weight: null }),
        createTask({ id: 2, isCompleted: true, dueAt: null }),
      ];
      const courses = new Map<number, CourseForPriority>();
      courses.set(1, createCourse({ id: 1 }));

      const notifications = analyzeTaskCompleteness(tasks, courses);

      expect(notifications).toEqual([]);
    });

    it('should skip completed tasks', () => {
      const tasks = [
        createTask({ id: 1, isCompleted: true, weight: null, dueAt: null }),
      ];
      const courses = new Map<number, CourseForPriority>();

      const notifications = analyzeTaskCompleteness(tasks, courses);

      expect(notifications).toEqual([]);
    });

    it('should aggregate tasks missing weight when >= 3 total', () => {
      const course = createCourse({ id: 1, code: 'CS101' });
      const tasks = [
        createTask({ id: 1, courseId: 1, weight: null, isCompleted: false }),
        createTask({ id: 2, courseId: 1, weight: 0, isCompleted: false }),
        createTask({ id: 3, courseId: 1, weight: null, isCompleted: false }),
      ];
      const courses = new Map<number, CourseForPriority>();
      courses.set(1, course);

      const notifications = analyzeTaskCompleteness(tasks, courses);

      const weightNotification = notifications.find((n) => n.fieldName === 'weight');
      expect(weightNotification).toBeDefined();
      expect(weightNotification?.title).toContain('3 Tasks Missing Weight');
    });

    it('should not aggregate weight issues when fewer than 3', () => {
      const course = createCourse({ id: 1 });
      const tasks = [
        createTask({ id: 1, courseId: 1, weight: null, isCompleted: false }),
        createTask({ id: 2, courseId: 1, weight: null, isCompleted: false }),
      ];
      const courses = new Map<number, CourseForPriority>();
      courses.set(1, course);

      const notifications = analyzeTaskCompleteness(tasks, courses);

      // Should be empty because < 3 tasks and < 2 per course
      expect(notifications).toEqual([]);
    });

    it('should flag tasks without due dates when >= 5', () => {
      const tasks = Array.from({ length: 5 }, (_, i) =>
        createTask({ id: i + 1, dueAt: null, isCompleted: false })
      );
      const courses = new Map<number, CourseForPriority>();

      const notifications = analyzeTaskCompleteness(tasks, courses);

      const dueDateNotification = notifications.find((n) => n.fieldName === 'dueAt');
      expect(dueDateNotification).toBeDefined();
      expect(dueDateNotification?.importance).toBe('critical');
      expect(dueDateNotification?.title).toBe('5 Tasks Have No Due Date');
    });

    it('should not flag due date issues when fewer than 5', () => {
      const tasks = Array.from({ length: 4 }, (_, i) =>
        createTask({ id: i + 1, dueAt: null, isCompleted: false })
      );
      const courses = new Map<number, CourseForPriority>();

      const notifications = analyzeTaskCompleteness(tasks, courses);

      const dueDateNotification = notifications.find((n) => n.fieldName === 'dueAt');
      expect(dueDateNotification).toBeUndefined();
    });
  });

  describe('generateDataCompletenessInsights', () => {
    const currentTime = new Date('2025-01-25T12:00:00Z');

    it('should convert notifications to insights', () => {
      const courseNotifications: MissingFieldNotification[] = [
        {
          fieldKey: 'course:1:targetGrade',
          entityType: 'course',
          entityId: 1,
          entityName: 'CS101',
          fieldName: 'targetGrade',
          importance: 'critical',
          title: 'Set Target Grade for CS101',
          description: 'Setting a target grade enables priority scoring.',
          action: { label: 'Set Target', type: 'navigate', target: '/course/1' },
        },
      ];

      const insights = generateDataCompletenessInsights(
        courseNotifications,
        [],
        new Set(),
        currentTime
      );

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('data_completeness');
      expect(insights[0].title).toBe('Set Target Grade for CS101');
      expect(insights[0].severity).toBe('warning'); // critical importance -> warning severity
    });

    it('should filter out suppressed notifications', () => {
      const notifications: MissingFieldNotification[] = [
        {
          fieldKey: 'course:1:targetGrade',
          entityType: 'course',
          entityId: 1,
          entityName: 'CS101',
          fieldName: 'targetGrade',
          importance: 'critical',
          title: 'Set Target Grade',
          description: 'Test',
          action: { label: 'Set', type: 'navigate', target: '/course/1' },
        },
      ];
      const suppressedKeys = new Set(['course:1:targetGrade']);

      const insights = generateDataCompletenessInsights(
        notifications,
        [],
        suppressedKeys,
        currentTime
      );

      expect(insights).toHaveLength(0);
    });

    it('should limit to top 3 notifications', () => {
      const notifications: MissingFieldNotification[] = Array.from({ length: 5 }, (_, i) => ({
        fieldKey: `course:${i}:targetGrade`,
        entityType: 'course' as const,
        entityId: i,
        entityName: `CS${i}`,
        fieldName: 'targetGrade',
        importance: 'critical' as const,
        title: `Set Target Grade ${i}`,
        description: 'Test',
        action: { label: 'Set', type: 'navigate' as const, target: `/course/${i}` },
      }));

      const insights = generateDataCompletenessInsights(
        notifications,
        [],
        new Set(),
        currentTime
      );

      expect(insights).toHaveLength(3);
    });

    it('should map recommended importance to info severity', () => {
      const notifications: MissingFieldNotification[] = [
        {
          fieldKey: 'course:1:currentGrade',
          entityType: 'course',
          entityId: 1,
          entityName: 'CS101',
          fieldName: 'currentGrade',
          importance: 'recommended',
          title: 'Missing Current Grade',
          description: 'Test',
          action: { label: 'Sync', type: 'navigate', target: '/course/1' },
        },
      ];

      const insights = generateDataCompletenessInsights(
        notifications,
        [],
        new Set(),
        currentTime
      );

      expect(insights[0].severity).toBe('info');
    });

    it('should set expiration 1 week from current time', () => {
      const notifications: MissingFieldNotification[] = [
        {
          fieldKey: 'course:1:targetGrade',
          entityType: 'course',
          entityId: 1,
          entityName: 'CS101',
          fieldName: 'targetGrade',
          importance: 'critical',
          title: 'Test',
          description: 'Test',
          action: { label: 'Set', type: 'navigate', target: '/course/1' },
        },
      ];

      const insights = generateDataCompletenessInsights(
        notifications,
        [],
        new Set(),
        currentTime
      );

      const expectedExpiry = new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000);
      expect(insights[0].expiresAt?.getTime()).toBe(expectedExpiry.getTime());
    });
  });

  describe('getDataCompletenessSummary', () => {
    it('should calculate correct counts', () => {
      const courses = [
        createCourse({ id: 1, targetGrade: 85, currentGrade: 78 }),
        createCourse({ id: 2, targetGrade: 80, currentGrade: null }), // Default target, no current
        createCourse({ id: 3, targetGrade: 90, currentGrade: 85 }),
      ];
      const tasks = [
        createTask({ id: 1, weight: 10, dueAt: new Date(), isCompleted: false }),
        createTask({ id: 2, weight: null, dueAt: new Date(), isCompleted: false }),
        createTask({ id: 3, weight: 15, dueAt: null, isCompleted: false }),
        createTask({ id: 4, weight: 20, dueAt: new Date(), isCompleted: true }), // Completed - excluded
      ];

      const summary = getDataCompletenessSummary(courses, tasks);

      expect(summary.totalCourses).toBe(3);
      expect(summary.coursesWithTargetGrade).toBe(2); // Courses 1 and 3
      expect(summary.coursesWithCurrentGrade).toBe(2); // Courses 1 and 3
      expect(summary.totalTasks).toBe(3); // Excludes completed
      expect(summary.tasksWithWeight).toBe(2); // Tasks 1 and 3
      expect(summary.tasksWithDueDate).toBe(2); // Tasks 1 and 2
    });

    it('should calculate overall score', () => {
      const courses = [
        createCourse({ id: 1, targetGrade: 85, currentGrade: 78 }),
      ];
      const tasks = [
        createTask({ id: 1, weight: 10, dueAt: new Date(), isCompleted: false }),
      ];

      const summary = getDataCompletenessSummary(courses, tasks);

      // All fields complete = 100% score
      expect(summary.overallScore).toBe(100);
    });

    it('should handle empty courses', () => {
      const courses: CourseForPriority[] = [];
      const tasks: TaskForPriority[] = [];

      const summary = getDataCompletenessSummary(courses, tasks);

      expect(summary.totalCourses).toBe(0);
      expect(summary.totalTasks).toBe(0);
      expect(summary.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle all completed tasks', () => {
      const courses = [createCourse({ id: 1, targetGrade: 85, currentGrade: 78 })];
      const tasks = [
        createTask({ id: 1, isCompleted: true }),
        createTask({ id: 2, isCompleted: true }),
      ];

      const summary = getDataCompletenessSummary(courses, tasks);

      expect(summary.totalTasks).toBe(0); // All completed
    });

    it('should consider course with currentGrade as having target set', () => {
      // A course with default targetGrade (80) but a currentGrade is considered "set enough"
      const courses = [
        createCourse({ id: 1, targetGrade: 80, currentGrade: 75 }),
      ];
      const tasks: TaskForPriority[] = [];

      const summary = getDataCompletenessSummary(courses, tasks);

      expect(summary.coursesWithTargetGrade).toBe(1);
    });

    it('should treat zero weight as missing', () => {
      const courses = [createCourse({ id: 1 })];
      const tasks = [
        createTask({ id: 1, weight: 0, isCompleted: false }),
        createTask({ id: 2, weight: null, isCompleted: false }),
      ];

      const summary = getDataCompletenessSummary(courses, tasks);

      expect(summary.tasksWithWeight).toBe(0);
    });
  });
});
