/**
 * L5 Selectors Tests
 *
 * Tests for the Zustand store selectors.
 */

// Jest globals are available
import { selectors } from '../../src/layers/l5-presentation/store';
import {
  StoreState,
  Course,
  Task,
  Notification,
} from '../../src/layers/l5-presentation/types';

// Helper to create a base store state
function createBaseState(overrides: Partial<StoreState> = {}): StoreState {
  return {
    courses: [],
    tasks: [],
    notifications: [],
    taskQueue: [],
    taskQueueCount: 0,
    simulation: {
      isActive: false,
      startedAt: null,
      grades: [],
    },
    syncStatus: 'idle',
    syncMessage: null,
    isAutoSync: false,
    lastSyncedAt: null,
    lastSyncResult: null,
    systemState: null,
    healthStatus: null,
    isAuthenticated: true,
    isInitialized: true,
    lastError: null,
    importedCalendars: [],
    calendarEvents: [],
    syncConflicts: [],
    authError: null,
    syncUpdates: {
      totalUnseen: 0,
      conflictCount: 0,
      informationalCount: 0,
      actionRequiredCount: 0,
      updates: [],
      lastFetchedAt: null,
    },
    ...overrides,
  };
}

// Helper to create a course
function createCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    externalId: 'ext-1',
    code: 'CS101',
    name: 'Intro to Computer Science',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: 80,
    currentGrade: 78,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
    archivedAt: null,
    archiveSource: null,
    credits: 1.0,
    ...overrides,
  };
}

// Helper to create a task
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    externalId: 'task-1',
    sourceType: 'canvas',
    courseId: 1,
    title: 'Assignment 1',
    description: 'First assignment',
    unlockAt: null,
    dueAt: null,
    dueTimeKnown: true,
    weight: 10,
    grade: null,
    pointsPossible: 100,
    priorityScore: 50,
    isCompleted: false,
    isOptional: false,
    completedAt: null,
    submissionStatus: null,
    notes: null,
    taskType: null,
    taskGroupId: null,
    calendarEventId: null,
    location: null,
    ...overrides,
  };
}

// Helper to create a notification
function createNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    sourceType: 'announcement',
    sourceId: 'ann-1',
    courseId: 1,
    title: 'Test Notification',
    message: 'This is a test notification',
    messageHtml: null,
    publishedAt: '2024-01-15T10:00:00Z',
    dismissedAt: null,
    url: null,
    ...overrides,
  };
}

describe('L5 Selectors', () => {
  describe('visibleCourses', () => {
    it('returns only non-hidden courses', () => {
      const courses = [
        createCourse({ id: 1, isHidden: false }),
        createCourse({ id: 2, isHidden: true }),
        createCourse({ id: 3, isHidden: false }),
      ];

      const state = createBaseState({ courses });
      const visible = selectors.visibleCourses(state);

      expect(visible).toHaveLength(2);
      expect(visible.map((c) => c.id)).toEqual([1, 3]);
    });

    it('returns empty array when all courses are hidden', () => {
      const courses = [
        createCourse({ id: 1, isHidden: true }),
        createCourse({ id: 2, isHidden: true }),
      ];

      const state = createBaseState({ courses });
      const visible = selectors.visibleCourses(state);

      expect(visible).toHaveLength(0);
    });

    it('returns all courses when none are hidden', () => {
      const courses = [
        createCourse({ id: 1, isHidden: false }),
        createCourse({ id: 2, isHidden: false }),
      ];

      const state = createBaseState({ courses });
      const visible = selectors.visibleCourses(state);

      expect(visible).toHaveLength(2);
    });
  });

  describe('courseTasks', () => {
    it('filters tasks by course ID', () => {
      const tasks = [
        createTask({ id: 1, courseId: 1 }),
        createTask({ id: 2, courseId: 2 }),
        createTask({ id: 3, courseId: 1 }),
      ];

      const state = createBaseState({ tasks });
      const course1Tasks = selectors.courseTasks(1)(state);

      expect(course1Tasks).toHaveLength(2);
      expect(course1Tasks.map((t) => t.id)).toEqual([1, 3]);
    });

    it('returns empty array when no tasks match', () => {
      const tasks = [
        createTask({ id: 1, courseId: 1 }),
        createTask({ id: 2, courseId: 2 }),
      ];

      const state = createBaseState({ tasks });
      const course3Tasks = selectors.courseTasks(3)(state);

      expect(course3Tasks).toHaveLength(0);
    });
  });

  describe('priorityTasks', () => {
    it('excludes completed tasks', () => {
      const tasks = [
        createTask({ id: 1, isCompleted: false, priorityScore: 80 }),
        createTask({ id: 2, isCompleted: true, priorityScore: 90 }),
        createTask({ id: 3, isCompleted: false, priorityScore: 70 }),
      ];

      const state = createBaseState({ tasks });
      const priority = selectors.priorityTasks(state);

      expect(priority).toHaveLength(2);
      expect(priority.map((t) => t.id)).not.toContain(2);
    });

    it('sorts by due date ascending (earliest first)', () => {
      const tasks = [
        createTask({ id: 1, dueAt: '2024-03-01T00:00:00Z' }),
        createTask({ id: 2, dueAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: 3, dueAt: '2024-02-01T00:00:00Z' }),
      ];

      const state = createBaseState({ tasks });
      const priority = selectors.priorityTasks(state);

      expect(priority[0].id).toBe(2);
      expect(priority[1].id).toBe(3);
      expect(priority[2].id).toBe(1);
    });

    it('returns empty array when all tasks are completed', () => {
      const tasks = [
        createTask({ id: 1, isCompleted: true }),
        createTask({ id: 2, isCompleted: true }),
      ];

      const state = createBaseState({ tasks });
      const priority = selectors.priorityTasks(state);

      expect(priority).toHaveLength(0);
    });
  });

  describe('activeNotifications', () => {
    it('excludes dismissed notifications', () => {
      const notifications = [
        createNotification({ id: 1, dismissedAt: null }),
        createNotification({ id: 2, dismissedAt: '2024-01-15T12:00:00Z' }),
        createNotification({ id: 3, dismissedAt: null }),
      ];

      const state = createBaseState({ notifications });
      const active = selectors.activeNotifications(state);

      expect(active).toHaveLength(2);
      expect(active.map((n) => n.id)).toEqual([1, 3]);
    });

    it('returns empty array when all notifications are dismissed', () => {
      const notifications = [
        createNotification({ id: 1, dismissedAt: '2024-01-15T12:00:00Z' }),
        createNotification({ id: 2, dismissedAt: '2024-01-15T12:00:00Z' }),
      ];

      const state = createBaseState({ notifications });
      const active = selectors.activeNotifications(state);

      expect(active).toHaveLength(0);
    });
  });

  describe('simulatedGrade', () => {
    it('returns simulated grade when present', () => {
      const state = createBaseState({
        simulation: {
          isActive: true,
          startedAt: '2024-01-15T10:00:00Z',
          grades: [
            {
              taskId: 1,
              courseId: 1,
              originalGrade: 70,
              simulatedGrade: 90,
              timestamp: '2024-01-15T10:00:00Z',
            },
            {
              taskId: 2,
              courseId: 1,
              originalGrade: null,
              simulatedGrade: 85,
              timestamp: '2024-01-15T10:00:00Z',
            },
          ],
        },
      });

      expect(selectors.simulatedGrade(1)(state)).toBe(90);
      expect(selectors.simulatedGrade(2)(state)).toBe(85);
    });

    it('returns null when no simulation for task', () => {
      const state = createBaseState({
        simulation: {
          isActive: true,
          startedAt: '2024-01-15T10:00:00Z',
          grades: [
            {
              taskId: 1,
              courseId: 1,
              originalGrade: 70,
              simulatedGrade: 90,
              timestamp: '2024-01-15T10:00:00Z',
            },
          ],
        },
      });

      expect(selectors.simulatedGrade(999)(state)).toBeNull();
    });

    it('returns null when simulation is empty', () => {
      const state = createBaseState();

      expect(selectors.simulatedGrade(1)(state)).toBeNull();
    });
  });

  describe('effectiveGrade', () => {
    it('returns simulated grade when present', () => {
      const tasks = [createTask({ id: 1, grade: 70 })];
      const state = createBaseState({
        tasks,
        simulation: {
          isActive: true,
          startedAt: '2024-01-15T10:00:00Z',
          grades: [
            {
              taskId: 1,
              courseId: 1,
              originalGrade: 70,
              simulatedGrade: 90,
              timestamp: '2024-01-15T10:00:00Z',
            },
          ],
        },
      });

      expect(selectors.effectiveGrade(1)(state)).toBe(90);
    });

    it('returns actual grade when no simulation', () => {
      const tasks = [createTask({ id: 1, grade: 75 })];
      const state = createBaseState({ tasks });

      expect(selectors.effectiveGrade(1)(state)).toBe(75);
    });

    it('returns null when task has no grade and no simulation', () => {
      const tasks = [createTask({ id: 1, grade: null })];
      const state = createBaseState({ tasks });

      expect(selectors.effectiveGrade(1)(state)).toBeNull();
    });

    it('returns null when task does not exist', () => {
      const state = createBaseState();

      expect(selectors.effectiveGrade(999)(state)).toBeNull();
    });

    it('returns simulated grade even when task has null actual grade', () => {
      const tasks = [createTask({ id: 1, grade: null })];
      const state = createBaseState({
        tasks,
        simulation: {
          isActive: true,
          startedAt: '2024-01-15T10:00:00Z',
          grades: [
            {
              taskId: 1,
              courseId: 1,
              originalGrade: null,
              simulatedGrade: 85,
              timestamp: '2024-01-15T10:00:00Z',
            },
          ],
        },
      });

      expect(selectors.effectiveGrade(1)(state)).toBe(85);
    });
  });

  describe('visibleNotifications', () => {
    it('excludes notifications whose course is not in state.courses (staleness defense)', () => {
      // The IPC handler already filters to visible courses, but there is a brief
      // window between `fetchCourses` and `fetchNotifications` re-fetches after a
      // visibility change where `state.notifications` may contain entries for a
      // course that's no longer in `state.courses`. The selector closes that gap.
      const courses = [createCourse({ id: 1 })];
      const notifications = [
        createNotification({ id: 10, courseId: 1 }),
        createNotification({ id: 11, courseId: 999 }), // course not in state
      ];
      const state = createBaseState({ courses, notifications });

      const result = selectors.visibleNotifications(state);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(10);
    });

    it('passes through system notifications (courseId === null)', () => {
      // System notifications aren't course-scoped — they're surfaced regardless
      // of which courses are visible.
      const courses: Course[] = []; // no visible courses
      const notifications = [
        createNotification({ id: 10, courseId: null }),
        createNotification({ id: 11, courseId: 1 }), // would be filtered (course not in state)
      ];
      const state = createBaseState({ courses, notifications });

      const result = selectors.visibleNotifications(state);

      expect(result.map((n) => n.id)).toEqual([10]);
    });

    it('handles a mixed batch — keeps visible-course and system entries, drops the rest', () => {
      // Both branches of the OR-predicate (`courseId === null || courseIds.has(...)`)
      // exercised in the same call. A future regression that decouples the branches
      // (e.g. accidental AND, or dropping the null guard) gets caught here.
      const courses = [createCourse({ id: 1 })];
      const notifications = [
        createNotification({ id: 10, courseId: 1 }), // kept (course is in state)
        createNotification({ id: 11, courseId: 2 }), // dropped (course not in state)
        createNotification({ id: 12, courseId: null }), // kept (system notification)
        createNotification({ id: 13, courseId: 999 }), // dropped (course not in state)
      ];
      const state = createBaseState({ courses, notifications });

      const result = selectors.visibleNotifications(state);

      expect(result.map((n) => n.id)).toEqual([10, 12]);
    });

    it('returns [] (not undefined, not throws) when state is fully empty', () => {
      // Locks the empty-state contract — downstream `.map`/`.filter` callsites
      // depend on always getting an array. A future "optimization" early-returning
      // null would break them silently.
      const state = createBaseState({ courses: [], notifications: [] });

      const result = selectors.visibleNotifications(state);

      expect(result).toEqual([]);
    });
  });

  describe('visibleTasks', () => {
    it('excludes tasks whose course is not in state.courses (staleness defense)', () => {
      const courses = [createCourse({ id: 1 })];
      const tasks = [
        createTask({ id: 10, courseId: 1 }),
        createTask({ id: 11, courseId: 999 }), // course not in state
      ];
      const state = createBaseState({ courses, tasks });

      const result = selectors.visibleTasks(state);

      expect(result.map((t) => t.id)).toEqual([10]);
    });
  });
});
