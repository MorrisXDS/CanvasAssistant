/**
 * DashboardViewModel Tests
 *
 * Tests for the dashboard view model computation.
 */

// Jest globals are available
import { computeDashboardViewModel } from '../../src/layers/l5-presentation/viewModels/DashboardViewModel';
import { StoreState, Course, Task, SimulationState } from '../../src/layers/l5-presentation/types';

// Helper to create a base store state
function createBaseState(overrides: Partial<StoreState> = {}): StoreState {
  return {
    courses: [],
    tasks: [],
    notifications: [],
    policies: [],
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
    ...overrides,
  };
}

// Helper to create a task
function createTask(overrides: Partial<Task> = {}): Task {
  // Default due date is 3 days from now to ensure tasks appear in priority queue
  const defaultDueAt = new Date();
  defaultDueAt.setDate(defaultDueAt.getDate() + 3);

  return {
    id: 1,
    externalId: 'task-1',
    courseId: 1,
    title: 'Assignment 1',
    description: 'First assignment',
    dueAt: defaultDueAt.toISOString(),
    dueTimeKnown: true,
    weight: 10,
    grade: null,
    pointsPossible: 100,
    priorityScore: 50,
    isCompleted: false,
    isOptional: false,
    completedAt: null,
    submissionStatus: null,
    userSubmissionStatus: null,
    effectiveSubmissionStatus: null,
    taskType: null,
    taskGroupId: null,
    calendarEventId: null,
    ...overrides,
  };
}

describe('DashboardViewModel', () => {
  describe('computeDashboardViewModel', () => {
    describe('empty state', () => {
      it('returns empty view model for empty state', () => {
        const state = createBaseState();
        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue).toHaveLength(0);
        expect(viewModel.courseSummaries).toHaveLength(0);
        expect(viewModel.simulationActive).toBe(false);
        expect(viewModel.simulationCount).toBe(0);
        expect(viewModel.stats.totalCourses).toBe(0);
        expect(viewModel.stats.totalTasks).toBe(0);
        expect(viewModel.stats.averageGrade).toBeNull();
      });
    });

    describe('priority queue', () => {
      it('includes only incomplete tasks', () => {
        const course = createCourse();
        const incompleteTask = createTask({ id: 1, priorityScore: 80, isCompleted: false });
        const completedTask = createTask({ id: 2, priorityScore: 90, isCompleted: true });

        const state = createBaseState({
          courses: [course],
          tasks: [incompleteTask, completedTask],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue).toHaveLength(1);
        expect(viewModel.priorityQueue[0].task.id).toBe(1);
      });

      it('sorts by priority score descending when prioritySortingEnabled', () => {
        const course = createCourse();
        const lowPriority = createTask({ id: 1, priorityScore: 30 });
        const highPriority = createTask({ id: 2, priorityScore: 90 });
        const mediumPriority = createTask({ id: 3, priorityScore: 60 });

        const state = createBaseState({
          courses: [course],
          tasks: [lowPriority, highPriority, mediumPriority],
        });

        // Must enable priority sorting to sort by priorityScore
        const viewModel = computeDashboardViewModel(state, { prioritySortingEnabled: true });

        expect(viewModel.priorityQueue[0].task.id).toBe(2); // High priority
        expect(viewModel.priorityQueue[1].task.id).toBe(3); // Medium priority
        expect(viewModel.priorityQueue[2].task.id).toBe(1); // Low priority
      });

      it('excludes tasks without a matching course', () => {
        const course = createCourse({ id: 1 });
        const taskWithCourse = createTask({ id: 1, courseId: 1 });
        const taskWithoutCourse = createTask({ id: 2, courseId: 999 });

        const state = createBaseState({
          courses: [course],
          tasks: [taskWithCourse, taskWithoutCourse],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue).toHaveLength(1);
        expect(viewModel.priorityQueue[0].task.id).toBe(1);
      });

      it('calculates urgency level for overdue tasks', () => {
        const course = createCourse();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const overdueTask = createTask({
          id: 1,
          dueAt: yesterday.toISOString(),
        });

        const state = createBaseState({
          courses: [course],
          tasks: [overdueTask],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue[0].urgencyLevel).toBe('critical');
      });

      it('calculates urgency level for tasks due today', () => {
        const course = createCourse();
        const soon = new Date();
        soon.setHours(soon.getHours() + 6);

        const soonTask = createTask({
          id: 1,
          dueAt: soon.toISOString(),
        });

        const state = createBaseState({
          courses: [course],
          tasks: [soonTask],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue[0].urgencyLevel).toBe('critical');
      });

      it('calculates urgency level for high priority tasks', () => {
        const course = createCourse();
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 5);

        const highPriorityTask = createTask({
          id: 1,
          dueAt: nextWeek.toISOString(),
          priorityScore: 75,
        });

        const state = createBaseState({
          courses: [course],
          tasks: [highPriorityTask],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue[0].urgencyLevel).toBe('high');
      });

      it('calculates days until due', () => {
        const course = createCourse();
        const threeDays = new Date();
        threeDays.setDate(threeDays.getDate() + 3);

        const task = createTask({
          id: 1,
          dueAt: threeDays.toISOString(),
        });

        const state = createBaseState({
          courses: [course],
          tasks: [task],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue[0].daysUntilDue).toBe(3);
      });

      it('excludes tasks without due date from priority queue', () => {
        const course = createCourse();
        const taskWithDue = createTask({ id: 1 }); // Has default dueAt
        const taskWithoutDue = createTask({ id: 2, dueAt: null });

        const state = createBaseState({
          courses: [course],
          tasks: [taskWithDue, taskWithoutDue],
        });

        const viewModel = computeDashboardViewModel(state);

        // Only task with due date should be in priority queue
        expect(viewModel.priorityQueue).toHaveLength(1);
        expect(viewModel.priorityQueue[0].task.id).toBe(1);
      });
    });

    describe('course summaries', () => {
      it('excludes hidden courses', () => {
        const visibleCourse = createCourse({ id: 1, isHidden: false });
        const hiddenCourse = createCourse({ id: 2, isHidden: true });

        const state = createBaseState({
          courses: [visibleCourse, hiddenCourse],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries).toHaveLength(1);
        expect(viewModel.courseSummaries[0].course.id).toBe(1);
      });

      it('counts tasks correctly', () => {
        const course = createCourse({ id: 1 });
        const tasks = [
          createTask({ id: 1, courseId: 1, isCompleted: false }),
          createTask({ id: 2, courseId: 1, isCompleted: true }),
          createTask({ id: 3, courseId: 1, isCompleted: false }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries[0].taskCount).toBe(3);
        expect(viewModel.courseSummaries[0].completedCount).toBe(1);
      });

      it('counts upcoming tasks', () => {
        const course = createCourse({ id: 1 });
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tasks = [
          createTask({ id: 1, courseId: 1, dueAt: tomorrow.toISOString(), isCompleted: false }),
          createTask({ id: 2, courseId: 1, dueAt: tomorrow.toISOString(), isCompleted: true }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries[0].upcomingCount).toBe(1);
      });

      it('counts overdue tasks', () => {
        const course = createCourse({ id: 1 });
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const tasks = [
          createTask({ id: 1, courseId: 1, dueAt: yesterday.toISOString(), isCompleted: false }),
          createTask({ id: 2, courseId: 1, dueAt: yesterday.toISOString(), isCompleted: true }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries[0].overdueCount).toBe(1);
      });

      it('calculates effective assessed grade', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 50, grade: 80 }),
          createTask({ id: 2, courseId: 1, weight: 50, grade: 90 }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries[0].effectiveAssessedGrade).toBe(85);
      });

      it('calculates target delta', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 100, grade: 80 }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries[0].targetDelta).toBe(10);
      });

      it('uses target grade as delta when no assessed grade', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });

        const state = createBaseState({
          courses: [course],
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.courseSummaries[0].targetDelta).toBe(90);
      });
    });

    describe('statistics', () => {
      it('calculates total courses and tasks', () => {
        const courses = [
          createCourse({ id: 1 }),
          createCourse({ id: 2 }),
        ];
        const tasks = [
          createTask({ id: 1, courseId: 1 }),
          createTask({ id: 2, courseId: 2 }),
          createTask({ id: 3, courseId: 2 }),
        ];

        const state = createBaseState({ courses, tasks });
        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.stats.totalCourses).toBe(2);
        expect(viewModel.stats.totalTasks).toBe(3);
      });

      it('calculates completed, upcoming, and overdue counts', () => {
        const course = createCourse({ id: 1 });
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tasks = [
          createTask({ id: 1, courseId: 1, isCompleted: true }),
          createTask({ id: 2, courseId: 1, dueAt: tomorrow.toISOString() }),
          createTask({ id: 3, courseId: 1, dueAt: yesterday.toISOString() }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.stats.completedTasks).toBe(1);
        expect(viewModel.stats.upcomingTasks).toBe(1);
        expect(viewModel.stats.overdueTasks).toBe(1);
      });

      it('calculates average grade across courses', () => {
        const courses = [
          createCourse({ id: 1, targetGrade: 90 }),
          createCourse({ id: 2, targetGrade: 80 }),
        ];
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 100, grade: 90 }),
          createTask({ id: 2, courseId: 2, weight: 100, grade: 80 }),
        ];

        const state = createBaseState({ courses, tasks });
        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.stats.averageGrade).toBe(85);
      });

      it('returns null average grade when no grades', () => {
        const courses = [createCourse({ id: 1 })];

        const state = createBaseState({ courses });
        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.stats.averageGrade).toBeNull();
      });
    });

    describe('simulation state', () => {
      it('reflects simulation active state', () => {
        const state = createBaseState({
          simulation: {
            isActive: true,
            startedAt: '2024-01-15T10:00:00Z',
            grades: [],
          },
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.simulationActive).toBe(true);
      });

      it('counts simulated grades', () => {
        const state = createBaseState({
          simulation: {
            isActive: true,
            startedAt: '2024-01-15T10:00:00Z',
            grades: [
              { taskId: 1, courseId: 1, originalGrade: null, simulatedGrade: 85, timestamp: '2024-01-15T10:00:00Z' },
              { taskId: 2, courseId: 1, originalGrade: 80, simulatedGrade: 90, timestamp: '2024-01-15T10:00:00Z' },
            ],
          },
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.simulationCount).toBe(2);
      });

      it('uses simulated grade in effective grade calculation', () => {
        const course = createCourse({ id: 1 });
        const task = createTask({ id: 1, courseId: 1, weight: 100, grade: 70 });

        const state = createBaseState({
          courses: [course],
          tasks: [task],
          simulation: {
            isActive: true,
            startedAt: '2024-01-15T10:00:00Z',
            grades: [
              { taskId: 1, courseId: 1, originalGrade: 70, simulatedGrade: 90, timestamp: '2024-01-15T10:00:00Z' },
            ],
          },
        });

        const viewModel = computeDashboardViewModel(state);

        expect(viewModel.priorityQueue[0].effectiveGrade).toBe(90);
        expect(viewModel.courseSummaries[0].effectiveAssessedGrade).toBe(90);
      });
    });
  });
});
