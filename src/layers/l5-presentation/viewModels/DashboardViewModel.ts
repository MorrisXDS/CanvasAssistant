/**
 * DashboardViewModel - Computed data for the main dashboard view
 *
 * Transforms store state into view-ready data for the dashboard.
 */

import { DateTime } from 'luxon';
import { StoreState, Course, Task, PriorityItem, CourseSummary } from '../types';
import { isPriorityTask, isOverdueTask, isUpcomingTask } from '../selectors';
import { getEffectiveTimezone } from '../settings';

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  totalCourses: number;
  totalTasks: number;
  completedTasks: number;
  upcomingTasks: number;
  overdueTasks: number;
  averageGrade: number | null;
  simulationActive: boolean;
}

/**
 * Complete dashboard view model
 */
export interface DashboardViewModel {
  /** Top priority tasks with course context */
  priorityQueue: PriorityItem[];
  /** Course summaries for cards */
  courseSummaries: CourseSummary[];
  /** Overall statistics */
  stats: DashboardStats;
  /** Whether there's an active simulation */
  simulationActive: boolean;
  /** Count of active simulations */
  simulationCount: number;
}

/**
 * Determine urgency level based on due date and priority score
 * Uses timezone-aware calculations via luxon with user's timezone preference
 */
function getUrgencyLevel(task: Task): 'critical' | 'high' | 'medium' | 'low' {
  if (!task.dueAt) return 'low';

  const tz = getEffectiveTimezone();
  const now = DateTime.now().setZone(tz);
  const due = DateTime.fromISO(task.dueAt).setZone(tz);
  if (!due.isValid) return 'low';

  const hoursUntilDue = due.diff(now, 'hours').hours;

  if (hoursUntilDue < 0) return 'critical'; // Overdue
  if (hoursUntilDue < 24) return 'critical'; // Due within 24 hours
  if (hoursUntilDue < 72) return 'high'; // Due within 3 days
  if (task.priorityScore > 70) return 'high'; // High priority score
  if (hoursUntilDue < 168) return 'medium'; // Due within a week
  return 'low';
}

/**
 * Calculate days until due using calendar days (timezone-aware via luxon)
 * Returns 0 for "due today", 1 for "due tomorrow", -1 for "1 day overdue", etc.
 */
function getDaysUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;

  const tz = getEffectiveTimezone();
  const now = DateTime.now().setZone(tz).startOf('day');
  const due = DateTime.fromISO(dueAt).setZone(tz).startOf('day');

  if (!due.isValid) return null;

  return Math.round(due.diff(now, 'days').days);
}

/**
 * Get effective grade for a task (simulated if exists, else actual)
 */
function getEffectiveGrade(task: Task, state: StoreState): number | null {
  const simulation = state.simulation.grades.find((g) => g.taskId === task.id);
  return simulation?.simulatedGrade ?? task.grade;
}

/**
 * Calculate simulated assessed grade for a course
 */
function calculateEffectiveAssessedGrade(
  course: Course,
  tasks: Task[],
  state: StoreState
): number | null {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const task of courseTasks) {
    const grade = getEffectiveGrade(task, state);
    if (grade !== null && task.weight > 0) {
      weightedSum += grade * task.weight;
      totalWeight += task.weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Create priority items from tasks
 * Sorts by due date (ascending - earliest first)
 */
function createPriorityItems(state: StoreState): PriorityItem[] {
  const { tasks, courses } = state;
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  return tasks
    .filter(isPriorityTask)
    .map((task) => {
      const course = courseMap.get(task.courseId);
      if (!course) return null;

      return {
        task,
        course,
        urgencyLevel: getUrgencyLevel(task),
        daysUntilDue: getDaysUntilDue(task.dueAt),
        effectiveGrade: getEffectiveGrade(task, state),
      };
    })
    .filter((item): item is PriorityItem => item !== null)
    .sort((a, b) => {
      // Sort by due date (ascending - earliest first)
      const aDue = a.task.dueAt ? new Date(a.task.dueAt).getTime() : Infinity;
      const bDue = b.task.dueAt ? new Date(b.task.dueAt).getTime() : Infinity;
      return aDue - bDue;
    });
}

/**
 * Create course summaries
 */
function createCourseSummaries(state: StoreState): CourseSummary[] {
  const { courses, tasks } = state;
  const now = new Date();

  return courses
    .filter((course) => !course.isHidden)
    .map((course) => {
      const courseTasks = tasks.filter((t) => t.courseId === course.id);
      const completedCount = courseTasks.filter((t) => t.isCompleted).length;

      const upcomingCount = courseTasks.filter((t) => {
        if (t.isCompleted || !t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due > now;
      }).length;

      const overdueCount = courseTasks.filter((t) => {
        if (t.isCompleted || !t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due < now;
      }).length;

      const effectiveAssessedGrade = calculateEffectiveAssessedGrade(
        course,
        tasks,
        state
      );
      const targetDelta =
        effectiveAssessedGrade !== null
          ? Math.max(0, course.targetGrade - effectiveAssessedGrade)
          : course.targetGrade;

      return {
        course,
        taskCount: courseTasks.length,
        completedCount,
        upcomingCount,
        overdueCount,
        effectiveAssessedGrade,
        targetDelta,
      };
    });
}

/**
 * Calculate dashboard statistics
 */
function calculateStats(
  state: StoreState,
  courseSummaries: CourseSummary[]
): DashboardStats {
  const { tasks, courses, simulation } = state;

  // Only count tasks from visible (non-hidden) courses
  // This ensures archived courses' tasks don't appear in stats
  const visibleCourseIds = new Set(courses.filter((c) => !c.isHidden).map((c) => c.id));
  const visibleTasks = tasks.filter((t) => visibleCourseIds.has(t.courseId));

  const completedTasks = visibleTasks.filter((t) => t.isCompleted).length;
  const upcomingTasks = visibleTasks.filter(isUpcomingTask).length;
  const overdueTasks = visibleTasks.filter(isOverdueTask).length;

  // Calculate weighted average grade across courses (weighted by credits)
  let totalWeightedGrade = 0;
  let totalCredits = 0;

  for (const summary of courseSummaries) {
    if (summary.effectiveAssessedGrade !== null) {
      const credits = summary.course.credits ?? 1.0;
      totalWeightedGrade += summary.effectiveAssessedGrade * credits;
      totalCredits += credits;
    }
  }

  const averageGrade = totalCredits > 0 ? totalWeightedGrade / totalCredits : null;

  return {
    totalCourses: courseSummaries.length,
    totalTasks: visibleTasks.length,
    completedTasks,
    upcomingTasks,
    overdueTasks,
    averageGrade,
    simulationActive: simulation.isActive,
  };
}

/**
 * Compute the complete dashboard view model from store state
 */
export function computeDashboardViewModel(state: StoreState): DashboardViewModel {
  const priorityQueue = createPriorityItems(state);
  const courseSummaries = createCourseSummaries(state);
  const stats = calculateStats(state, courseSummaries);

  return {
    priorityQueue,
    courseSummaries,
    stats,
    simulationActive: state.simulation.isActive,
    simulationCount: state.simulation.grades.length,
  };
}

/**
 * React hook for dashboard view model
 * Uses selector pattern for optimal re-renders
 */
export function useDashboardViewModel(state: StoreState): DashboardViewModel {
  return computeDashboardViewModel(state);
}
