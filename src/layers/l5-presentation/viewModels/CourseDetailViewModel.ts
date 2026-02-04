/**
 * CourseDetailViewModel - Computed data for the course detail view
 *
 * Transforms store state into view-ready data for individual course pages.
 */

import { StoreState, Course, Task, SimulatedGrade } from '../types';

/**
 * Task with computed display fields
 */
export interface TaskViewModel {
  task: Task;
  effectiveGrade: number | null;
  isSimulated: boolean;
  simulation: SimulatedGrade | null;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  daysUntilDue: number | null;
  statusLabel: string;
  gradeImpact: number | null; // How much this task affects the course grade
}

/**
 * Grade breakdown for visualization
 */
export interface GradeBreakdown {
  completed: {
    weightedSum: number;
    totalWeight: number;
    grade: number | null;
  };
  remaining: {
    totalWeight: number;
    requiredAverage: number | null; // Average needed on remaining to hit target
  };
  simulated: {
    weightedSum: number;
    totalWeight: number;
    grade: number | null;
  };
}

/**
 * Complete course detail view model
 */
export interface CourseDetailViewModel {
  course: Course | null;
  tasks: TaskViewModel[];
  gradeBreakdown: GradeBreakdown;
  effectiveAssessedGrade: number | null;
  targetDelta: number;
  completionRate: number;
  upcomingCount: number;
  overdueCount: number;
  simulationActive: boolean;
  simulatedTasks: TaskViewModel[];
}

/**
 * Determine urgency level
 */
function getUrgencyLevel(task: Task): 'critical' | 'high' | 'medium' | 'low' {
  if (task.isCompleted) return 'low';
  if (!task.dueAt) return 'low';

  const now = new Date();
  const due = new Date(task.dueAt);
  const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilDue < 0) return 'critical';
  if (hoursUntilDue < 24) return 'critical';
  if (hoursUntilDue < 72) return 'high';
  if (hoursUntilDue < 168) return 'medium';
  return 'low';
}

/**
 * Calculate days until due (using calendar days, not 24-hour periods)
 */
function getDaysUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;
  const now = new Date();
  const due = new Date(dueAt);

  // Compare dates at midnight to get calendar days
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueDate.getTime() - nowDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get status label for display
 */
function getStatusLabel(task: Task): string {
  if (task.isCompleted) return 'Completed';
  if (!task.dueAt) return 'No due date';

  const days = getDaysUntilDue(task.dueAt);
  if (days === null) return 'No due date';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/**
 * Create task view models for a course
 */
function createTaskViewModels(
  courseTasks: Task[],
  simulations: SimulatedGrade[],
  totalWeight: number
): TaskViewModel[] {
  return courseTasks.map((task) => {
    const simulation = simulations.find((s) => s.taskId === task.id) ?? null;
    const effectiveGrade = simulation?.simulatedGrade ?? task.grade;

    // Calculate grade impact (how much this task affects course grade)
    const gradeImpact =
      totalWeight > 0 && task.weight > 0 ? (task.weight / totalWeight) * 100 : null;

    return {
      task,
      effectiveGrade,
      isSimulated: simulation !== null,
      simulation,
      urgencyLevel: getUrgencyLevel(task),
      daysUntilDue: getDaysUntilDue(task.dueAt),
      statusLabel: getStatusLabel(task),
      gradeImpact,
    };
  });
}

/**
 * Calculate grade breakdown for a course
 */
function calculateGradeBreakdown(
  tasks: Task[],
  simulations: SimulatedGrade[],
  targetGrade: number
): GradeBreakdown {
  let completedWeightedSum = 0;
  let completedTotalWeight = 0;
  let simulatedWeightedSum = 0;
  let simulatedTotalWeight = 0;
  let remainingWeight = 0;

  for (const task of tasks) {
    const simulation = simulations.find((s) => s.taskId === task.id);
    const effectiveGrade = simulation?.simulatedGrade ?? task.grade;

    if (task.weight > 0) {
      // Track simulated grades separately
      if (effectiveGrade !== null) {
        simulatedWeightedSum += effectiveGrade * task.weight;
        simulatedTotalWeight += task.weight;
      }

      // Track completed (actual) grades
      if (task.grade !== null) {
        completedWeightedSum += task.grade * task.weight;
        completedTotalWeight += task.weight;
      }

      // Track remaining weight (tasks without grades)
      if (task.grade === null) {
        remainingWeight += task.weight;
      }
    }
  }

  const completedGrade =
    completedTotalWeight > 0 ? completedWeightedSum / completedTotalWeight : null;

  const simulatedGrade =
    simulatedTotalWeight > 0 ? simulatedWeightedSum / simulatedTotalWeight : null;

  // Calculate required average on remaining work to hit target
  let requiredAverage: number | null = null;
  if (remainingWeight > 0 && completedTotalWeight > 0) {
    // Formula: (targetGrade * totalWeight - completedSum) / remainingWeight
    const totalWeight = completedTotalWeight + remainingWeight;
    const neededPoints = targetGrade * totalWeight - completedWeightedSum;
    requiredAverage = neededPoints / remainingWeight;
    // Cap at reasonable bounds - allow values > 100 for bonus/extra credit scenarios
    requiredAverage = Math.max(0, Math.min(150, requiredAverage));
  }

  return {
    completed: {
      weightedSum: completedWeightedSum,
      totalWeight: completedTotalWeight,
      grade: completedGrade,
    },
    remaining: {
      totalWeight: remainingWeight,
      requiredAverage,
    },
    simulated: {
      weightedSum: simulatedWeightedSum,
      totalWeight: simulatedTotalWeight,
      grade: simulatedGrade,
    },
  };
}

/**
 * Compute the course detail view model from store state
 */
export function computeCourseDetailViewModel(
  state: StoreState,
  courseId: number
): CourseDetailViewModel {
  const { courses, tasks, simulation } = state;

  const course = courses.find((c) => c.id === courseId) ?? null;
  if (!course) {
    return {
      course: null,
      tasks: [],
      gradeBreakdown: {
        completed: { weightedSum: 0, totalWeight: 0, grade: null },
        remaining: { totalWeight: 0, requiredAverage: null },
        simulated: { weightedSum: 0, totalWeight: 0, grade: null },
      },
      effectiveAssessedGrade: null,
      targetDelta: 0,
      completionRate: 0,
      upcomingCount: 0,
      overdueCount: 0,
      simulationActive: false,
      simulatedTasks: [],
    };
  }

  const courseTasks = tasks.filter((t) => t.courseId === courseId);
  const courseSimulations = simulation.grades.filter((g) => g.courseId === courseId);
  const totalWeight = courseTasks.reduce((sum, t) => sum + t.weight, 0);

  const taskViewModels = createTaskViewModels(
    courseTasks,
    courseSimulations,
    totalWeight
  );
  const gradeBreakdown = calculateGradeBreakdown(
    courseTasks,
    courseSimulations,
    course.targetGrade
  );

  const effectiveAssessedGrade = gradeBreakdown.simulated.grade;
  const targetDelta =
    effectiveAssessedGrade !== null
      ? Math.max(0, course.targetGrade - effectiveAssessedGrade)
      : course.targetGrade;

  const now = new Date();
  const completedCount = courseTasks.filter((t) => t.isCompleted).length;
  const upcomingCount = courseTasks.filter((t) => {
    if (t.isCompleted || !t.dueAt) return false;
    return new Date(t.dueAt) > now;
  }).length;
  const overdueCount = courseTasks.filter((t) => {
    if (t.isCompleted || !t.dueAt) return false;
    return new Date(t.dueAt) < now;
  }).length;

  const completionRate =
    courseTasks.length > 0 ? (completedCount / courseTasks.length) * 100 : 0;

  const simulatedTasks = taskViewModels.filter((t) => t.isSimulated);

  // Sort by due date (earliest first), then by title
  const sortedTasks = taskViewModels.sort((a, b) => {
    const aDue = a.task.dueAt ? new Date(a.task.dueAt).getTime() : Infinity;
    const bDue = b.task.dueAt ? new Date(b.task.dueAt).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return a.task.title.localeCompare(b.task.title);
  });

  return {
    course,
    tasks: sortedTasks,
    gradeBreakdown,
    effectiveAssessedGrade,
    targetDelta,
    completionRate,
    upcomingCount,
    overdueCount,
    simulationActive: simulation.isActive,
    simulatedTasks,
  };
}

/**
 * React hook for course detail view model
 */
export function useCourseDetailViewModel(
  state: StoreState,
  courseId: number
): CourseDetailViewModel {
  return computeCourseDetailViewModel(state, courseId);
}
