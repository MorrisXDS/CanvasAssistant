/**
 * CourseDetailViewModel Tests
 *
 * Tests for the course detail view model computation.
 */

// Jest globals are available
import { computeCourseDetailViewModel } from '../../src/layers/l5-presentation/viewModels/CourseDetailViewModel';
import { StoreState, Course, Task } from '../../src/layers/l5-presentation/types';

// Helper to create a base store state
function createBaseState(overrides: Partial<StoreState> = {}): StoreState {
  return {
    courses: [],
    tasks: [],
    notifications: [],
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
    assessedGrade: 80,
    currentGrade: 78,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
    ...overrides,
  };
}

// Helper to create a task
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    externalId: 'task-1',
    courseId: 1,
    title: 'Assignment 1',
    description: 'First assignment',
    dueAt: null,
    weight: 10,
    grade: null,
    pointsPossible: 100,
    priorityScore: 50,
    isCompleted: false,
    completedAt: null,
    submissionStatus: null,
    taskType: null,
    taskGroupId: null,
    ...overrides,
  };
}

describe('CourseDetailViewModel', () => {
  describe('computeCourseDetailViewModel', () => {
    describe('course not found', () => {
      it('returns empty view model when course not found', () => {
        const state = createBaseState();
        const viewModel = computeCourseDetailViewModel(state, 999);

        expect(viewModel.course).toBeNull();
        expect(viewModel.tasks).toHaveLength(0);
        expect(viewModel.completionRate).toBe(0);
        expect(viewModel.upcomingCount).toBe(0);
        expect(viewModel.overdueCount).toBe(0);
      });
    });

    describe('basic course data', () => {
      it('returns course data correctly', () => {
        const course = createCourse({ id: 1, name: 'Test Course' });
        const state = createBaseState({ courses: [course] });

        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.course).not.toBeNull();
        expect(viewModel.course?.name).toBe('Test Course');
      });
    });

    describe('task view models', () => {
      it('filters tasks by course ID', () => {
        const course = createCourse({ id: 1 });
        const tasks = [
          createTask({ id: 1, courseId: 1 }),
          createTask({ id: 2, courseId: 1 }),
          createTask({ id: 3, courseId: 2 }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.tasks).toHaveLength(2);
      });

      it('sorts tasks by priority score descending', () => {
        const course = createCourse({ id: 1 });
        const tasks = [
          createTask({ id: 1, courseId: 1, priorityScore: 30 }),
          createTask({ id: 2, courseId: 1, priorityScore: 90 }),
          createTask({ id: 3, courseId: 1, priorityScore: 60 }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.tasks[0].task.id).toBe(2);
        expect(viewModel.tasks[1].task.id).toBe(3);
        expect(viewModel.tasks[2].task.id).toBe(1);
      });

      it('calculates effective grade from actual grade', () => {
        const course = createCourse({ id: 1 });
        const task = createTask({ id: 1, courseId: 1, grade: 85 });

        const state = createBaseState({ courses: [course], tasks: [task] });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.tasks[0].effectiveGrade).toBe(85);
        expect(viewModel.tasks[0].isSimulated).toBe(false);
      });

      it('calculates effective grade from simulation', () => {
        const course = createCourse({ id: 1 });
        const task = createTask({ id: 1, courseId: 1, grade: 70 });

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

        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.tasks[0].effectiveGrade).toBe(90);
        expect(viewModel.tasks[0].isSimulated).toBe(true);
        expect(viewModel.tasks[0].simulation?.simulatedGrade).toBe(90);
      });

      it('calculates grade impact', () => {
        const course = createCourse({ id: 1 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 25 }),
          createTask({ id: 2, courseId: 1, weight: 75 }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        const task1 = viewModel.tasks.find(t => t.task.id === 1);
        const task2 = viewModel.tasks.find(t => t.task.id === 2);

        expect(task1?.gradeImpact).toBe(25);
        expect(task2?.gradeImpact).toBe(75);
      });

      describe('urgency level', () => {
        it('returns low for completed tasks', () => {
          const course = createCourse({ id: 1 });
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const task = createTask({
            id: 1,
            courseId: 1,
            isCompleted: true,
            dueAt: yesterday.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('low');
        });

        it('returns critical for overdue tasks', () => {
          const course = createCourse({ id: 1 });
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: yesterday.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('critical');
        });

        it('returns critical for tasks due within 24 hours', () => {
          const course = createCourse({ id: 1 });
          const soonDue = new Date();
          soonDue.setHours(soonDue.getHours() + 12);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: soonDue.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('critical');
        });

        it('returns high for tasks due within 3 days', () => {
          const course = createCourse({ id: 1 });
          const twoDays = new Date();
          twoDays.setDate(twoDays.getDate() + 2);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: twoDays.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('high');
        });

        it('returns high for high priority tasks', () => {
          const course = createCourse({ id: 1 });
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 5);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: nextWeek.toISOString(),
            priorityScore: 75,
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('high');
        });

        it('returns medium for tasks due within a week', () => {
          const course = createCourse({ id: 1 });
          const fiveDays = new Date();
          fiveDays.setDate(fiveDays.getDate() + 5);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: fiveDays.toISOString(),
            priorityScore: 50,
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('medium');
        });

        it('returns low for tasks due far in the future', () => {
          const course = createCourse({ id: 1 });
          const farFuture = new Date();
          farFuture.setDate(farFuture.getDate() + 30);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: farFuture.toISOString(),
            priorityScore: 30,
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('low');
        });

        it('returns low for tasks with no due date', () => {
          const course = createCourse({ id: 1 });
          const task = createTask({ id: 1, courseId: 1, dueAt: null });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].urgencyLevel).toBe('low');
        });
      });

      describe('status label', () => {
        it('returns "Completed" for completed tasks', () => {
          const course = createCourse({ id: 1 });
          const task = createTask({ id: 1, courseId: 1, isCompleted: true });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].statusLabel).toBe('Completed');
        });

        it('returns "No due date" for tasks without due date', () => {
          const course = createCourse({ id: 1 });
          const task = createTask({ id: 1, courseId: 1, dueAt: null });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].statusLabel).toBe('No due date');
        });

        it('returns overdue message for overdue tasks', () => {
          const course = createCourse({ id: 1 });
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: twoDaysAgo.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].statusLabel).toBe('2 days overdue');
        });

        it('returns "Due today" for tasks due today', () => {
          const course = createCourse({ id: 1 });
          // Set to later today
          const today = new Date();
          today.setHours(23, 59, 0, 0);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: today.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].statusLabel).toBe('Due today');
        });

        it('returns "Due tomorrow" for tasks due tomorrow', () => {
          const course = createCourse({ id: 1 });
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(12, 0, 0, 0);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: tomorrow.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].statusLabel).toBe('Due tomorrow');
        });

        it('returns "Due in X days" for future tasks', () => {
          const course = createCourse({ id: 1 });
          const fiveDays = new Date();
          fiveDays.setDate(fiveDays.getDate() + 5);

          const task = createTask({
            id: 1,
            courseId: 1,
            dueAt: fiveDays.toISOString(),
          });

          const state = createBaseState({ courses: [course], tasks: [task] });
          const viewModel = computeCourseDetailViewModel(state, 1);

          expect(viewModel.tasks[0].statusLabel).toBe('Due in 5 days');
        });
      });
    });

    describe('grade breakdown', () => {
      it('calculates completed grade correctly', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 30, grade: 80 }),
          createTask({ id: 2, courseId: 1, weight: 70, grade: 90 }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.gradeBreakdown.completed.totalWeight).toBe(100);
        expect(viewModel.gradeBreakdown.completed.weightedSum).toBe(30 * 80 + 70 * 90);
        expect(viewModel.gradeBreakdown.completed.grade).toBe(87); // (30*80 + 70*90) / 100
      });

      it('calculates remaining weight correctly', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 30, grade: 80 }),
          createTask({ id: 2, courseId: 1, weight: 70, grade: null }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.gradeBreakdown.remaining.totalWeight).toBe(70);
      });

      it('calculates required average to hit target', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 50, grade: 80 }),
          createTask({ id: 2, courseId: 1, weight: 50, grade: null }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        // To get 90 average with 80 on first 50%, need 100 on remaining 50%
        // (90 * 100 - 80 * 50) / 50 = 100
        expect(viewModel.gradeBreakdown.remaining.requiredAverage).toBe(100);
      });

      it('caps required average at 100', () => {
        const course = createCourse({ id: 1, targetGrade: 95 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 50, grade: 70 }),
          createTask({ id: 2, courseId: 1, weight: 50, grade: null }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.gradeBreakdown.remaining.requiredAverage).toBe(100);
      });

      it('calculates simulated grade separately', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 50, grade: 70 }),
          createTask({ id: 2, courseId: 1, weight: 50, grade: null }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
          simulation: {
            isActive: true,
            startedAt: '2024-01-15T10:00:00Z',
            grades: [
              { taskId: 2, courseId: 1, originalGrade: null, simulatedGrade: 100, timestamp: '2024-01-15T10:00:00Z' },
            ],
          },
        });

        const viewModel = computeCourseDetailViewModel(state, 1);

        // Simulated: 70*50 + 100*50 = 8500, weight=100, grade=85
        expect(viewModel.gradeBreakdown.simulated.grade).toBe(85);
        // Completed: only the graded task
        expect(viewModel.gradeBreakdown.completed.grade).toBe(70);
      });
    });

    describe('course summary stats', () => {
      it('calculates effective assessed grade', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 100, grade: 80 }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.effectiveAssessedGrade).toBe(80);
      });

      it('calculates target delta', () => {
        const course = createCourse({ id: 1, targetGrade: 90 });
        const tasks = [
          createTask({ id: 1, courseId: 1, weight: 100, grade: 80 }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.targetDelta).toBe(10);
      });

      it('calculates completion rate', () => {
        const course = createCourse({ id: 1 });
        const tasks = [
          createTask({ id: 1, courseId: 1, isCompleted: true }),
          createTask({ id: 2, courseId: 1, isCompleted: true }),
          createTask({ id: 3, courseId: 1, isCompleted: false }),
          createTask({ id: 4, courseId: 1, isCompleted: false }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.completionRate).toBe(50);
      });

      it('counts upcoming tasks', () => {
        const course = createCourse({ id: 1 });
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tasks = [
          createTask({ id: 1, courseId: 1, dueAt: tomorrow.toISOString(), isCompleted: false }),
          createTask({ id: 2, courseId: 1, dueAt: tomorrow.toISOString(), isCompleted: false }),
          createTask({ id: 3, courseId: 1, dueAt: tomorrow.toISOString(), isCompleted: true }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.upcomingCount).toBe(2);
      });

      it('counts overdue tasks', () => {
        const course = createCourse({ id: 1 });
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const tasks = [
          createTask({ id: 1, courseId: 1, dueAt: yesterday.toISOString(), isCompleted: false }),
          createTask({ id: 2, courseId: 1, dueAt: yesterday.toISOString(), isCompleted: true }),
        ];

        const state = createBaseState({ courses: [course], tasks });
        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.overdueCount).toBe(1);
      });
    });

    describe('simulation tracking', () => {
      it('tracks simulation active state', () => {
        const course = createCourse({ id: 1 });
        const state = createBaseState({
          courses: [course],
          simulation: {
            isActive: true,
            startedAt: '2024-01-15T10:00:00Z',
            grades: [],
          },
        });

        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.simulationActive).toBe(true);
      });

      it('tracks simulated tasks', () => {
        const course = createCourse({ id: 1 });
        const tasks = [
          createTask({ id: 1, courseId: 1 }),
          createTask({ id: 2, courseId: 1 }),
          createTask({ id: 3, courseId: 1 }),
        ];

        const state = createBaseState({
          courses: [course],
          tasks,
          simulation: {
            isActive: true,
            startedAt: '2024-01-15T10:00:00Z',
            grades: [
              { taskId: 1, courseId: 1, originalGrade: null, simulatedGrade: 90, timestamp: '2024-01-15T10:00:00Z' },
              { taskId: 3, courseId: 1, originalGrade: null, simulatedGrade: 85, timestamp: '2024-01-15T10:00:00Z' },
            ],
          },
        });

        const viewModel = computeCourseDetailViewModel(state, 1);

        expect(viewModel.simulatedTasks).toHaveLength(2);
        expect(viewModel.simulatedTasks.map(t => t.task.id).sort()).toEqual([1, 3]);
      });
    });
  });
});
