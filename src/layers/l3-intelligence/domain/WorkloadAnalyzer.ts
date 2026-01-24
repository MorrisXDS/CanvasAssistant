/**
 * WorkloadAnalyzer - Pure Domain Functions for Workload Analysis
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Analyzes deadline distribution and workload balance to help users
 * manage their time effectively.
 */

import {
  WorkloadSnapshot,
  WorkloadDistribution,
  RedistributionSuggestion,
  NeglectedCourse,
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
  TaskCompletionEvent,
} from '../types';

/**
 * Calculate deadline clustering score for a set of tasks
 * Returns 0-1 where higher = more clustered deadlines
 */
export function calculateClusteringScore(
  tasks: TaskForPriority[],
  windowDays: number = 7
): number {
  // Filter to tasks with due dates within window
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const tasksInWindow = tasks.filter(
    (t) => t.dueAt && t.dueAt >= now && t.dueAt <= windowEnd && !t.isCompleted
  );

  if (tasksInWindow.length <= 1) {
    return 0; // No clustering possible with 0-1 tasks
  }

  // Group tasks by day
  const tasksByDay: Map<string, number> = new Map();
  for (const task of tasksInWindow) {
    if (!task.dueAt) continue;
    const dayKey = task.dueAt.toISOString().split('T')[0];
    tasksByDay.set(dayKey, (tasksByDay.get(dayKey) || 0) + 1);
  }

  // Calculate variance in daily task counts
  const counts = Array.from(tasksByDay.values());
  const totalDays = windowDays;
  const avgPerDay = tasksInWindow.length / totalDays;

  // Fill in zero days
  while (counts.length < totalDays) {
    counts.push(0);
  }

  // Calculate variance
  const variance =
    counts.reduce((sum, count) => sum + Math.pow(count - avgPerDay, 2), 0) / counts.length;

  // Normalize variance to 0-1 scale
  // Max clustering: all tasks on one day
  const maxVariance = Math.pow(tasksInWindow.length - avgPerDay, 2) * (1 / totalDays) +
    Math.pow(avgPerDay, 2) * ((totalDays - 1) / totalDays);

  if (maxVariance === 0) return 0;

  return Math.min(1, variance / maxVariance);
}

/**
 * Analyze workload distribution over a date range
 */
export function analyzeWorkloadDistribution(
  tasks: TaskForPriority[],
  startDate: Date,
  endDate: Date,
  effortEstimates: Map<number, EffortEstimate>
): WorkloadDistribution {
  const dailySnapshots: WorkloadSnapshot[] = [];
  let peakDay: Date | null = null;
  let peakMinutes = 0;
  let totalMinutes = 0;
  let totalDays = 0;

  // Iterate through each day in range
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate) {
    const dayStart = new Date(currentDate);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Find tasks due on this day
    const tasksDueToday = tasks.filter(
      (t) => t.dueAt && t.dueAt >= dayStart && t.dueAt <= dayEnd && !t.isCompleted
    );

    // Calculate totals
    let dayMinutes = 0;
    const tasksByCourse: Record<number, number> = {};
    const tasksByUrgency: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const task of tasksDueToday) {
      const estimate = effortEstimates.get(task.id);
      const minutes = estimate?.estimatedMinutes ?? 60;
      dayMinutes += minutes;

      // Track by course
      tasksByCourse[task.courseId] = (tasksByCourse[task.courseId] || 0) + 1;

      // Track by urgency based on time remaining
      const hoursUntilDue = task.dueAt
        ? (task.dueAt.getTime() - new Date().getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursUntilDue <= 24) {
        tasksByUrgency.critical++;
      } else if (hoursUntilDue <= 48) {
        tasksByUrgency.high++;
      } else if (hoursUntilDue <= 168) {
        tasksByUrgency.medium++;
      } else {
        tasksByUrgency.low++;
      }
    }

    const snapshot: WorkloadSnapshot = {
      snapshotDate: new Date(currentDate),
      totalTasksDue: tasksDueToday.length,
      totalEstimatedMinutes: dayMinutes,
      tasksByCourse,
      tasksByUrgency,
      deadlineClusteringScore: 0, // Will be calculated globally
    };

    dailySnapshots.push(snapshot);

    // Track peak
    if (dayMinutes > peakMinutes) {
      peakMinutes = dayMinutes;
      peakDay = new Date(currentDate);
    }

    totalMinutes += dayMinutes;
    totalDays++;

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const avgDailyMinutes = totalDays > 0 ? totalMinutes / totalDays : 0;
  const clusteringScore = calculateClusteringScore(tasks, totalDays);

  // Calculate balance score (inverse of clustering)
  const balanceScore = Math.round((1 - clusteringScore) * 100);

  return {
    startDate,
    endDate,
    dailySnapshots,
    peakDay,
    peakMinutes,
    avgDailyMinutes,
    clusteringScore,
    balanceScore,
  };
}

/**
 * Suggest task redistribution to reduce clustering
 */
export function suggestRedistribution(
  tasks: TaskForPriority[],
  availableHoursPerDay: number = 4,
  effortEstimates: Map<number, EffortEstimate>
): RedistributionSuggestion[] {
  const suggestions: RedistributionSuggestion[] = [];
  const availableMinutesPerDay = availableHoursPerDay * 60;

  // Find days with excessive workload
  const now = new Date();
  const tasksByDay: Map<string, TaskForPriority[]> = new Map();

  for (const task of tasks) {
    if (!task.dueAt || task.isCompleted) continue;
    const dayKey = task.dueAt.toISOString().split('T')[0];
    const existing = tasksByDay.get(dayKey) || [];
    existing.push(task);
    tasksByDay.set(dayKey, existing);
  }

  // Check each day for overload
  for (const [dayKey, dayTasks] of tasksByDay) {
    const totalMinutes = dayTasks.reduce((sum, t) => {
      const estimate = effortEstimates.get(t.id);
      return sum + (estimate?.estimatedMinutes ?? 60);
    }, 0);

    if (totalMinutes <= availableMinutesPerDay) continue;

    // Sort by flexibility (can we move it earlier?)
    const sortedTasks = [...dayTasks].sort((a, b) => {
      // Prefer to move tasks with higher effort
      const effortA = effortEstimates.get(a.id)?.estimatedMinutes ?? 60;
      const effortB = effortEstimates.get(b.id)?.estimatedMinutes ?? 60;
      return effortB - effortA;
    });

    // Suggest moving tasks to earlier days
    let excessMinutes = totalMinutes - availableMinutesPerDay;

    for (const task of sortedTasks) {
      if (excessMinutes <= 0) break;

      const estimate = effortEstimates.get(task.id);
      const taskMinutes = estimate?.estimatedMinutes ?? 60;

      // Find an earlier day with capacity
      const currentDue = new Date(task.dueAt!);
      const suggestedDate = new Date(currentDue);
      suggestedDate.setDate(suggestedDate.getDate() - 1);

      // Only suggest if it's still in the future
      if (suggestedDate > now) {
        suggestions.push({
          taskId: task.id,
          taskTitle: task.title,
          currentDueDate: currentDue,
          suggestedDate,
          reason: `Reduce workload on ${dayKey}`,
          timeGained: taskMinutes,
        });

        excessMinutes -= taskMinutes;
      }
    }
  }

  return suggestions;
}

/**
 * Detect neglected courses based on activity patterns
 */
export function detectNeglectedCourses(
  tasks: TaskForPriority[],
  events: TaskCompletionEvent[],
  courses: CourseForPriority[],
  windowDays: number = 14
): NeglectedCourse[] {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const results: NeglectedCourse[] = [];

  for (const course of courses) {
    // Find last activity in this course
    const courseEvents = events.filter((e) => e.courseId === course.id);
    const lastEvent = courseEvents
      .filter((e) => e.completedAt)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];

    const daysSinceActivity = lastEvent
      ? Math.floor((now.getTime() - lastEvent.completedAt.getTime()) / (1000 * 60 * 60 * 24))
      : windowDays; // Assume max if no activity found

    // Count pending tasks
    const pendingTasks = tasks.filter(
      (t) => t.courseId === course.id && !t.isCompleted
    );

    // Count upcoming deadlines (within next 7 days)
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = pendingTasks.filter(
      (t) => t.dueAt && t.dueAt >= now && t.dueAt <= nextWeek
    ).length;

    // Calculate neglect score
    // Higher score = more neglected
    const neglectScore = Math.min(100, Math.max(0,
      // Days since activity contributes
      (daysSinceActivity / windowDays) * 50 +
      // Pending task count contributes
      Math.min(pendingTasks.length, 10) * 3 +
      // Upcoming deadlines contribute more heavily
      upcomingDeadlines * 10
    ));

    // Only include if actually showing signs of neglect
    if (neglectScore >= 30 && (daysSinceActivity >= 3 || upcomingDeadlines >= 1)) {
      results.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        daysSinceActivity,
        pendingTaskCount: pendingTasks.length,
        upcomingDeadlines,
        neglectScore,
      });
    }
  }

  // Sort by neglect score descending
  return results.sort((a, b) => b.neglectScore - a.neglectScore);
}

/**
 * Calculate workload balance score across courses
 * Returns 0-100 where higher = more balanced
 */
export function calculateCourseBalanceScore(
  tasks: TaskForPriority[],
  courses: CourseForPriority[]
): number {
  if (courses.length <= 1) return 100; // Can't be imbalanced with one course

  // Count pending tasks per course
  const taskCounts: Map<number, number> = new Map();
  for (const course of courses) {
    taskCounts.set(course.id, 0);
  }

  for (const task of tasks) {
    if (task.isCompleted) continue;
    const count = taskCounts.get(task.courseId) || 0;
    taskCounts.set(task.courseId, count + 1);
  }

  const counts = Array.from(taskCounts.values());
  const totalTasks = counts.reduce((sum, c) => sum + c, 0);

  if (totalTasks === 0) return 100; // No tasks = perfectly balanced

  const avgPerCourse = totalTasks / courses.length;

  // Calculate variance
  const variance =
    counts.reduce((sum, count) => sum + Math.pow(count - avgPerCourse, 2), 0) / counts.length;

  // Calculate coefficient of variation
  const stdDev = Math.sqrt(variance);
  const cv = avgPerCourse > 0 ? stdDev / avgPerCourse : 0;

  // Convert to balance score (lower CV = higher balance)
  // CV of 0 = perfect balance (100), CV of 1 = poor balance (0)
  return Math.round(Math.max(0, 100 - cv * 100));
}

/**
 * Get daily workload summary for today
 */
export function getDailyWorkloadSummary(
  tasks: TaskForPriority[],
  effortEstimates: Map<number, EffortEstimate>,
  targetDate: Date = new Date()
): {
  totalTasks: number;
  totalMinutes: number;
  byUrgency: Record<string, number>;
  overloadWarning: boolean;
  recommendedFocusTime: number;
} {
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const tasksDueToday = tasks.filter(
    (t) => t.dueAt && t.dueAt >= dayStart && t.dueAt <= dayEnd && !t.isCompleted
  );

  let totalMinutes = 0;
  const byUrgency: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const task of tasksDueToday) {
    const estimate = effortEstimates.get(task.id);
    totalMinutes += estimate?.estimatedMinutes ?? 60;

    // Categorize by urgency
    const hoursUntilDue = task.dueAt
      ? (task.dueAt.getTime() - new Date().getTime()) / (1000 * 60 * 60)
      : 999;

    if (hoursUntilDue <= 4) {
      byUrgency.critical++;
    } else if (hoursUntilDue <= 8) {
      byUrgency.high++;
    } else if (hoursUntilDue <= 16) {
      byUrgency.medium++;
    } else {
      byUrgency.low++;
    }
  }

  // Assume 8 hours of available work time
  const availableMinutes = 8 * 60;
  const overloadWarning = totalMinutes > availableMinutes;

  // Recommend focus time based on total workload
  const recommendedFocusTime = Math.min(
    availableMinutes,
    Math.ceil(totalMinutes * 1.2) // Add 20% buffer
  );

  return {
    totalTasks: tasksDueToday.length,
    totalMinutes,
    byUrgency,
    overloadWarning,
    recommendedFocusTime,
  };
}

/**
 * Identify upcoming deadline clusters (multiple tasks due close together)
 */
export function identifyDeadlineClusters(
  tasks: TaskForPriority[],
  windowHours: number = 48
): Array<{
  startTime: Date;
  endTime: Date;
  tasks: TaskForPriority[];
  totalMinutes: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

  // Filter and sort tasks by due date
  const upcomingTasks = tasks
    .filter((t) => t.dueAt && t.dueAt >= now && t.dueAt <= windowEnd && !t.isCompleted)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  if (upcomingTasks.length < 2) return [];

  const clusters: Array<{
    startTime: Date;
    endTime: Date;
    tasks: TaskForPriority[];
    totalMinutes: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }> = [];

  // Find clusters (tasks within 4 hours of each other)
  let currentCluster: TaskForPriority[] = [];
  let clusterStart: Date | null = null;

  for (const task of upcomingTasks) {
    if (currentCluster.length === 0) {
      currentCluster.push(task);
      clusterStart = task.dueAt!;
    } else {
      const lastTask = currentCluster[currentCluster.length - 1];
      const hoursBetween =
        (task.dueAt!.getTime() - lastTask.dueAt!.getTime()) / (1000 * 60 * 60);

      if (hoursBetween <= 4) {
        currentCluster.push(task);
      } else {
        // Save current cluster if it has multiple tasks
        if (currentCluster.length >= 2) {
          const totalMinutes = currentCluster.length * 60; // Simplified estimate
          clusters.push({
            startTime: clusterStart!,
            endTime: lastTask.dueAt!,
            tasks: [...currentCluster],
            totalMinutes,
            severity: getSeverity(currentCluster.length, totalMinutes),
          });
        }
        // Start new cluster
        currentCluster = [task];
        clusterStart = task.dueAt!;
      }
    }
  }

  // Don't forget the last cluster
  if (currentCluster.length >= 2) {
    const lastTask = currentCluster[currentCluster.length - 1];
    const totalMinutes = currentCluster.length * 60;
    clusters.push({
      startTime: clusterStart!,
      endTime: lastTask.dueAt!,
      tasks: [...currentCluster],
      totalMinutes,
      severity: getSeverity(currentCluster.length, totalMinutes),
    });
  }

  return clusters;
}

function getSeverity(
  taskCount: number,
  totalMinutes: number
): 'low' | 'medium' | 'high' | 'critical' {
  if (taskCount >= 5 || totalMinutes >= 480) return 'critical';
  if (taskCount >= 4 || totalMinutes >= 360) return 'high';
  if (taskCount >= 3 || totalMinutes >= 240) return 'medium';
  return 'low';
}
