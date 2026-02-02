/**
 * WorkloadPredictionService - Pure Domain Functions for Workload Forecasting
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Extends WorkloadAnalyzer with FORECASTING capabilities:
 * - Weekly workload predictions
 * - Crunch period detection
 * - Preemptive action suggestions
 */

import { TaskForPriority, EffortEstimate } from '../types';

/**
 * Workload forecast for a specific week
 */
export interface WorkloadForecast {
  /** Start of the week (Monday) */
  weekStart: Date;
  /** End of the week (Sunday) */
  weekEnd: Date;
  /** Predicted hours of work */
  predictedHours: number;
  /** Number of tasks due this week */
  taskCount: number;
  /** Total weight of assessments */
  totalWeight: number;
  /** Workload severity level */
  severity: 'light' | 'normal' | 'heavy' | 'crunch';
  /** Tasks due this week */
  tasks: WorkloadTask[];
  /** Suggestions for managing the workload */
  suggestions: string[];
}

/**
 * Task info for workload analysis
 */
export interface WorkloadTask {
  id: number;
  title: string;
  courseCode: string;
  courseId: number;
  dueAt: Date;
  estimatedMinutes: number;
  weight: number | null;
  taskType: string;
}

/**
 * Detected crunch period (overlapping high workload)
 */
export interface CrunchPeriod {
  /** Start date of crunch period */
  startDate: Date;
  /** End date of crunch period */
  endDate: Date;
  /** Number of days in crunch */
  durationDays: number;
  /** Total estimated hours */
  totalHours: number;
  /** Number of tasks in this period */
  taskCount: number;
  /** Tasks contributing to the crunch */
  tasks: WorkloadTask[];
  /** Severity of the crunch */
  severity: 'moderate' | 'severe' | 'extreme';
  /** Recommended actions */
  recommendations: string[];
}

/**
 * Preemptive action suggestion
 */
export interface PreemptiveAction {
  /** Type of action */
  type: 'start_early' | 'spread_work' | 'request_extension' | 'skip_optional';
  /** Task this action applies to */
  taskId: number;
  /** Task title */
  taskTitle: string;
  /** Description of the action */
  description: string;
  /** Why this action is recommended */
  reasoning: string;
  /** Priority (0-100) */
  priority: number;
  /** When to take this action by */
  suggestedByDate: Date;
}

// ============================================================================
// Workload Forecasting Functions
// ============================================================================

/**
 * Forecast weekly workload for upcoming weeks
 */
export function forecastWeeklyWorkload(
  tasks: TaskForPriority[],
  effortEstimates: Map<number, EffortEstimate>,
  courseMap: Map<number, { code: string; name: string }>,
  currentTime: Date,
  weeksAhead: number = 4
): WorkloadForecast[] {
  const forecasts: WorkloadForecast[] = [];

  // Get Monday of current week
  const currentMonday = getMonday(currentTime);

  for (let week = 0; week < weeksAhead; week++) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(weekStart.getDate() + week * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Find tasks due this week
    const weekTasks = tasks.filter((t) => {
      if (t.isCompleted || !t.dueAt) return false;
      return t.dueAt >= weekStart && t.dueAt <= weekEnd;
    });

    // Build workload tasks with estimates
    const workloadTasks: WorkloadTask[] = weekTasks.map((t) => {
      const estimate = effortEstimates.get(t.id);
      const course = courseMap.get(t.courseId);
      return {
        id: t.id,
        title: t.title,
        courseCode: course?.code ?? 'Unknown',
        courseId: t.courseId,
        dueAt: t.dueAt!,
        estimatedMinutes: estimate?.estimatedMinutes ?? 60,
        weight: t.weight,
        taskType: t.taskType,
      };
    });

    // Calculate totals
    const predictedMinutes = workloadTasks.reduce(
      (sum, t) => sum + t.estimatedMinutes,
      0
    );
    const predictedHours = Math.round((predictedMinutes / 60) * 10) / 10;
    const totalWeight = workloadTasks.reduce((sum, t) => sum + (t.weight ?? 0), 0);

    // Determine severity
    const severity = determineSeverity(predictedHours, weekTasks.length, totalWeight);

    // Generate suggestions
    const suggestions = generateWeekSuggestions(workloadTasks, severity, week);

    forecasts.push({
      weekStart,
      weekEnd,
      predictedHours,
      taskCount: weekTasks.length,
      totalWeight,
      severity,
      tasks: workloadTasks.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
      suggestions,
    });
  }

  return forecasts;
}

/**
 * Get Monday of the week containing the given date
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Determine workload severity
 */
function determineSeverity(
  hours: number,
  taskCount: number,
  totalWeight: number
): WorkloadForecast['severity'] {
  // Thresholds based on reasonable study expectations
  // Light: <10 hours, Normal: 10-20 hours, Heavy: 20-30 hours, Crunch: >30 hours

  if (hours >= 30 || taskCount >= 7 || totalWeight >= 40) {
    return 'crunch';
  }
  if (hours >= 20 || taskCount >= 5 || totalWeight >= 25) {
    return 'heavy';
  }
  if (hours >= 10 || taskCount >= 3 || totalWeight >= 10) {
    return 'normal';
  }
  return 'light';
}

/**
 * Generate suggestions for a week's workload
 */
function generateWeekSuggestions(
  tasks: WorkloadTask[],
  severity: WorkloadForecast['severity'],
  weekOffset: number
): string[] {
  const suggestions: string[] = [];

  if (severity === 'crunch') {
    suggestions.push(
      'This is a very heavy week - start working on tasks now if possible'
    );
    if (weekOffset > 0) {
      suggestions.push(`Consider starting high-effort tasks ${weekOffset} week(s) early`);
    }
  } else if (severity === 'heavy') {
    suggestions.push('Plan your time carefully to manage this workload');
    if (tasks.length > 3) {
      suggestions.push('Focus on one task at a time to maintain quality');
    }
  }

  // Check for deadline clusters
  const dailyCounts = new Map<string, number>();
  for (const task of tasks) {
    const dayKey = task.dueAt.toDateString();
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
  }

  for (const [day, count] of dailyCounts) {
    if (count >= 3) {
      suggestions.push(
        `${count} tasks due on ${new Date(day).toLocaleDateString('en-US', { weekday: 'long' })} - consider spreading your work`
      );
      break;
    }
  }

  // High-weight tasks
  const highWeightTasks = tasks.filter((t) => (t.weight ?? 0) >= 15);
  if (highWeightTasks.length > 0) {
    const taskNames = highWeightTasks
      .map((t) => t.title)
      .slice(0, 2)
      .join(', ');
    suggestions.push(`Prioritize high-weight assessments: ${taskNames}`);
  }

  return suggestions;
}

/**
 * Detect crunch periods (consecutive days of high workload)
 */
export function detectCrunchPeriods(
  tasks: TaskForPriority[],
  effortEstimates: Map<number, EffortEstimate>,
  courseMap: Map<number, { code: string; name: string }>,
  currentTime: Date,
  lookAheadDays: number = 30
): CrunchPeriod[] {
  const crunchPeriods: CrunchPeriod[] = [];

  // Calculate daily workload
  const dailyWorkload = new Map<string, { hours: number; tasks: WorkloadTask[] }>();

  const endDate = new Date(currentTime);
  endDate.setDate(endDate.getDate() + lookAheadDays);

  // Initialize all days
  for (let d = new Date(currentTime); d <= endDate; d.setDate(d.getDate() + 1)) {
    dailyWorkload.set(d.toDateString(), { hours: 0, tasks: [] });
  }

  // Assign tasks to their due dates
  for (const task of tasks) {
    if (task.isCompleted || !task.dueAt) continue;
    if (task.dueAt < currentTime || task.dueAt > endDate) continue;

    const dayKey = task.dueAt.toDateString();
    const entry = dailyWorkload.get(dayKey);
    if (!entry) continue;

    const estimate = effortEstimates.get(task.id);
    const course = courseMap.get(task.courseId);

    const workloadTask: WorkloadTask = {
      id: task.id,
      title: task.title,
      courseCode: course?.code ?? 'Unknown',
      courseId: task.courseId,
      dueAt: task.dueAt,
      estimatedMinutes: estimate?.estimatedMinutes ?? 60,
      weight: task.weight,
      taskType: task.taskType,
    };

    entry.hours += workloadTask.estimatedMinutes / 60;
    entry.tasks.push(workloadTask);
  }

  // Find consecutive high-workload days
  const sortedDays = Array.from(dailyWorkload.entries())
    .map(([dateStr, data]) => ({ date: new Date(dateStr), ...data }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const DAILY_THRESHOLD = 4; // 4+ hours in a day is significant

  let crunchStart: Date | null = null;
  let crunchTasks: WorkloadTask[] = [];
  let crunchHours = 0;

  for (let i = 0; i < sortedDays.length; i++) {
    const day = sortedDays[i];

    if (day.hours >= DAILY_THRESHOLD) {
      if (!crunchStart) {
        crunchStart = day.date;
        crunchTasks = [];
        crunchHours = 0;
      }
      crunchHours += day.hours;
      crunchTasks.push(...day.tasks);
    } else if (crunchStart) {
      // End of crunch period
      if (crunchTasks.length >= 3 && crunchHours >= 10) {
        const endDate = sortedDays[i - 1].date;
        crunchPeriods.push(
          buildCrunchPeriod(crunchStart, endDate, crunchTasks, crunchHours)
        );
      }
      crunchStart = null;
      crunchTasks = [];
      crunchHours = 0;
    }
  }

  // Handle crunch at end of period
  if (crunchStart && crunchTasks.length >= 3 && crunchHours >= 10) {
    const endDate = sortedDays[sortedDays.length - 1].date;
    crunchPeriods.push(buildCrunchPeriod(crunchStart, endDate, crunchTasks, crunchHours));
  }

  return crunchPeriods;
}

/**
 * Build a crunch period object
 */
function buildCrunchPeriod(
  startDate: Date,
  endDate: Date,
  tasks: WorkloadTask[],
  totalHours: number
): CrunchPeriod {
  const durationDays =
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let severity: CrunchPeriod['severity'] = 'moderate';
  if (totalHours >= 30 || tasks.length >= 8) {
    severity = 'extreme';
  } else if (totalHours >= 20 || tasks.length >= 5) {
    severity = 'severe';
  }

  const recommendations: string[] = [];

  if (severity === 'extreme') {
    recommendations.push('Start working on tasks immediately');
    recommendations.push('Consider requesting extensions for lower-priority tasks');
    recommendations.push('Block off dedicated study time in your calendar');
  } else if (severity === 'severe') {
    recommendations.push('Begin working on high-weight tasks now');
    recommendations.push('Plan your schedule in advance to distribute workload');
  } else {
    recommendations.push('Start early on larger tasks to avoid last-minute stress');
  }

  // Add specific task recommendations
  const highWeight = tasks.filter((t) => (t.weight ?? 0) >= 15);
  if (highWeight.length > 0) {
    recommendations.push(
      `Focus on high-stakes items first: ${highWeight
        .map((t) => t.title)
        .slice(0, 2)
        .join(', ')}`
    );
  }

  return {
    startDate,
    endDate,
    durationDays,
    totalHours: Math.round(totalHours * 10) / 10,
    taskCount: tasks.length,
    tasks,
    severity,
    recommendations,
  };
}

/**
 * Suggest preemptive actions based on workload forecast
 */
export function suggestPreemptiveActions(
  forecasts: WorkloadForecast[],
  currentWeek: WorkloadForecast,
  currentTime: Date
): PreemptiveAction[] {
  const actions: PreemptiveAction[] = [];

  // Look for heavy weeks ahead
  for (let i = 1; i < forecasts.length; i++) {
    const futureWeek = forecasts[i];
    if (futureWeek.severity === 'crunch' || futureWeek.severity === 'heavy') {
      // Suggest starting tasks from future heavy week now if current week is light
      if (currentWeek.severity === 'light' || currentWeek.severity === 'normal') {
        // Find high-effort tasks in the heavy week
        const highEffortTasks = futureWeek.tasks
          .filter((t) => t.estimatedMinutes >= 120 || (t.weight ?? 0) >= 15)
          .slice(0, 3);

        for (const task of highEffortTasks) {
          const daysUntilDue = Math.ceil(
            (task.dueAt.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
          );

          actions.push({
            type: 'start_early',
            taskId: task.id,
            taskTitle: task.title,
            description: `Start "${task.title}" early to avoid crunch in week ${i + 1}`,
            reasoning: `This task takes ~${Math.round(task.estimatedMinutes / 60)} hours and week ${i + 1} has ${Math.round(futureWeek.predictedHours)} hours of work`,
            priority: 70 + (task.weight ?? 0),
            suggestedByDate: new Date(currentTime.getTime() + 2 * 24 * 60 * 60 * 1000),
          });
        }
      }
    }
  }

  // Check for deadline clusters in current week
  if (currentWeek.tasks.length >= 3) {
    const dailyClusters = new Map<string, WorkloadTask[]>();
    for (const task of currentWeek.tasks) {
      const dayKey = task.dueAt.toDateString();
      const existing = dailyClusters.get(dayKey) ?? [];
      existing.push(task);
      dailyClusters.set(dayKey, existing);
    }

    for (const [dayKey, dayTasks] of dailyClusters) {
      if (dayTasks.length >= 3) {
        // Suggest spreading work
        const lowestPriority = dayTasks.sort(
          (a, b) => (a.weight ?? 0) - (b.weight ?? 0)
        )[0];

        actions.push({
          type: 'spread_work',
          taskId: lowestPriority.id,
          taskTitle: lowestPriority.title,
          description: `Start "${lowestPriority.title}" a day early to reduce ${new Date(dayKey).toLocaleDateString('en-US', { weekday: 'long' })}'s load`,
          reasoning: `${dayTasks.length} tasks are due on the same day`,
          priority: 60,
          suggestedByDate: new Date(new Date(dayKey).getTime() - 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  // Sort by priority
  actions.sort((a, b) => b.priority - a.priority);

  return actions.slice(0, 5); // Return top 5 actions
}

/**
 * Calculate workload balance score
 * Returns 0-100, higher = more balanced distribution
 */
export function calculateWorkloadBalance(forecasts: WorkloadForecast[]): number {
  if (forecasts.length < 2) return 100;

  const hours = forecasts.map((f) => f.predictedHours);
  const avg = hours.reduce((sum, h) => sum + h, 0) / hours.length;

  if (avg === 0) return 100;

  // Calculate coefficient of variation (CV)
  const variance = hours.reduce((sum, h) => sum + Math.pow(h - avg, 2), 0) / hours.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / avg;

  // Convert CV to 0-100 score (lower CV = higher balance)
  // CV of 0 = perfect balance (100), CV of 1 = poor balance (0)
  const balanceScore = Math.max(0, Math.min(100, (1 - cv) * 100));

  return Math.round(balanceScore);
}
