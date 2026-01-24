/**
 * RecommendationEngine - Pure Domain Functions for Task Recommendations
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Generates context-aware task suggestions based on current state,
 * user patterns, and workload analysis.
 */

import {
  Recommendation,
  RecommendationType,
  RecommendationContext,
  TaskForPriority,
  CourseForPriority,
  EffortEstimate,
  WeeklyRhythm,
  CoursePerformance,
  StrugglePattern,
  TaskCompletionEvent,
} from '../types';
import { getProductivityScore } from './BehaviorAnalytics';

/**
 * Recommendation validity duration in hours
 */
const RECOMMENDATION_VALIDITY: Record<RecommendationType, number> = {
  work_now: 4,
  start_early: 24,
  take_break: 2,
  course_focus: 12,
  redistribute: 24,
};

/**
 * Generate "work on X now" recommendation based on context
 */
export function generateWorkNowRecommendation(
  tasks: TaskForPriority[],
  courses: Map<number, CourseForPriority>,
  effortEstimates: Map<number, EffortEstimate>,
  context: RecommendationContext
): Recommendation | null {
  const { currentTime, availableMinutes } = context;

  // Filter to incomplete tasks with due dates
  const availableTasks = tasks.filter(
    (t) => !t.isCompleted && t.dueAt && t.dueAt > currentTime
  );

  if (availableTasks.length === 0) return null;

  // Score each task for "work now" suitability
  const scoredTasks = availableTasks.map((task) => {
    const estimate = effortEstimates.get(task.id);
    const estimatedMinutes = estimate?.estimatedMinutes ?? 60;
    const hoursUntilDue = (task.dueAt!.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    let score = 0;

    // Time pressure: higher score for closer deadlines
    if (hoursUntilDue <= 6) score += 50;
    else if (hoursUntilDue <= 12) score += 40;
    else if (hoursUntilDue <= 24) score += 30;
    else if (hoursUntilDue <= 48) score += 20;
    else if (hoursUntilDue <= 72) score += 10;

    // Effort fit: boost if task fits available time
    if (estimatedMinutes <= availableMinutes) {
      score += 20;
      // Extra boost if it's a good fit (70-100% of available time)
      if (estimatedMinutes >= availableMinutes * 0.7) {
        score += 10;
      }
    }

    // Weight importance
    if (task.weight && task.weight >= 10) score += 15;
    if (task.weight && task.weight >= 20) score += 10;

    // Task type priority
    const highPriorityTypes = ['final', 'midterm', 'exam', 'project'];
    if (highPriorityTypes.includes(task.taskType?.toLowerCase())) {
      score += 10;
    }

    return { task, score, estimatedMinutes };
  });

  // Sort by score descending
  scoredTasks.sort((a, b) => b.score - a.score);

  const bestTask = scoredTasks[0];
  if (!bestTask || bestTask.score < 20) return null;

  const course = courses.get(bestTask.task.courseId);
  const courseName = course?.code || 'Unknown Course';

  // Generate reasoning
  const hoursUntilDue = (bestTask.task.dueAt!.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
  let reasoning = '';

  if (hoursUntilDue <= 24) {
    reasoning = `Due in ${Math.round(hoursUntilDue)} hours. `;
  }
  if (bestTask.estimatedMinutes <= availableMinutes) {
    reasoning += `Fits your available time (~${bestTask.estimatedMinutes} min). `;
  }
  if (bestTask.task.weight && bestTask.task.weight >= 15) {
    reasoning += `High grade impact (${bestTask.task.weight}% weight).`;
  }

  return {
    type: 'work_now',
    taskId: bestTask.task.id,
    courseId: bestTask.task.courseId,
    title: `Work on ${bestTask.task.title}`,
    description: `This ${bestTask.task.taskType} for ${courseName} is a good fit for your current time slot.`,
    reasoning: reasoning.trim(),
    priorityScore: bestTask.score,
    validFrom: currentTime,
    validUntil: new Date(currentTime.getTime() + RECOMMENDATION_VALIDITY.work_now * 60 * 60 * 1000),
    dismissedAt: null,
    actedOnAt: null,
  };
}

/**
 * Generate "start early" recommendation for difficult or high-weight tasks
 */
export function generateStartEarlyRecommendation(
  tasks: TaskForPriority[],
  courses: Map<number, CourseForPriority>,
  effortEstimates: Map<number, EffortEstimate>,
  strugglePatterns: StrugglePattern[],
  courseDifficulty: CoursePerformance[],
  currentTime: Date
): Recommendation | null {
  // Look for high-stakes tasks 3-7 days out
  const minHoursAhead = 72; // 3 days
  const maxHoursAhead = 168; // 7 days

  const candidateTasks = tasks.filter((t) => {
    if (t.isCompleted || !t.dueAt) return false;
    const hoursUntilDue = (t.dueAt.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    return hoursUntilDue >= minHoursAhead && hoursUntilDue <= maxHoursAhead;
  });

  if (candidateTasks.length === 0) return null;

  // Build lookup maps
  const struggleMap = new Map(strugglePatterns.map((p) => [p.taskType, p.struggleScore]));
  const difficultyMap = new Map(courseDifficulty.map((c) => [c.courseId, c.struggleScore]));

  // Score each task for early start suitability
  const scoredTasks = candidateTasks.map((task) => {
    const estimate = effortEstimates.get(task.id);
    const estimatedMinutes = estimate?.estimatedMinutes ?? 60;

    let score = 0;
    const reasons: string[] = [];

    // High effort tasks
    if (estimatedMinutes >= 180) {
      score += 30;
      reasons.push('High effort task');
    } else if (estimatedMinutes >= 120) {
      score += 20;
      reasons.push('Significant effort required');
    }

    // High weight tasks
    if (task.weight && task.weight >= 15) {
      score += 25;
      reasons.push(`Worth ${task.weight}% of grade`);
    }

    // Task type struggle
    const typeStruggle = struggleMap.get(task.taskType) ?? 0;
    if (typeStruggle >= 50) {
      score += 20;
      reasons.push(`You often struggle with ${task.taskType}s`);
    }

    // Course difficulty
    const courseStruggle = difficultyMap.get(task.courseId) ?? 0;
    if (courseStruggle >= 50) {
      score += 15;
      reasons.push('Challenging course');
    }

    // High-stakes task types
    const highStakesTypes = ['final', 'midterm', 'exam', 'project'];
    if (highStakesTypes.includes(task.taskType?.toLowerCase())) {
      score += 15;
      reasons.push('Major assessment');
    }

    return { task, score, reasons, estimatedMinutes };
  });

  // Get highest scoring task
  scoredTasks.sort((a, b) => b.score - a.score);
  const best = scoredTasks[0];

  if (!best || best.score < 30) return null;

  const course = courses.get(best.task.courseId);
  const courseName = course?.code || 'Unknown Course';
  const daysUntilDue = Math.round(
    (best.task.dueAt!.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    type: 'start_early',
    taskId: best.task.id,
    courseId: best.task.courseId,
    title: `Start ${best.task.title} Early`,
    description: `This ${best.task.taskType} for ${courseName} is due in ${daysUntilDue} days. Starting early will help you avoid stress.`,
    reasoning: best.reasons.join('. '),
    priorityScore: best.score,
    validFrom: currentTime,
    validUntil: new Date(currentTime.getTime() + RECOMMENDATION_VALIDITY.start_early * 60 * 60 * 1000),
    dismissedAt: null,
    actedOnAt: null,
  };
}

/**
 * Generate "take a break" recommendation based on recent activity
 */
export function generateBreakRecommendation(
  recentActivity: TaskCompletionEvent[],
  currentTime: Date
): Recommendation | null {
  // Look at activity in last 4 hours
  const fourHoursAgo = new Date(currentTime.getTime() - 4 * 60 * 60 * 1000);
  const recentCompletions = recentActivity.filter(
    (e) => e.completedAt >= fourHoursAgo
  );

  // Check for signs of overwork
  let workMinutes = 0;
  for (const event of recentCompletions) {
    workMinutes += event.timeToCompleteMinutes ?? 30;
  }

  // Recommend break if worked 3+ hours in last 4 hours
  if (workMinutes < 180) return null;

  const hoursWorked = Math.round(workMinutes / 60 * 10) / 10;

  return {
    type: 'take_break',
    taskId: null,
    courseId: null,
    title: 'Take a Break',
    description: `You've been working for about ${hoursWorked} hours. A short break will help you stay focused.`,
    reasoning: `Research shows productivity decreases after 90-120 minutes of continuous work. Take 10-15 minutes to rest.`,
    priorityScore: 60,
    validFrom: currentTime,
    validUntil: new Date(currentTime.getTime() + RECOMMENDATION_VALIDITY.take_break * 60 * 60 * 1000),
    dismissedAt: null,
    actedOnAt: null,
  };
}

/**
 * Generate "course focus" recommendation for neglected courses
 */
export function generateCourseFocusRecommendation(
  tasks: TaskForPriority[],
  courses: Map<number, CourseForPriority>,
  recentActivity: TaskCompletionEvent[],
  currentTime: Date
): Recommendation | null {
  // Find courses with no recent activity but pending tasks
  const oneWeekAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get course activity in last week
  const courseActivity: Map<number, number> = new Map();
  for (const event of recentActivity) {
    if (event.completedAt >= oneWeekAgo) {
      courseActivity.set(event.courseId, (courseActivity.get(event.courseId) || 0) + 1);
    }
  }

  // Find courses with pending tasks but no activity
  const neglectedCourses: Array<{
    courseId: number;
    pendingCount: number;
    upcomingDeadlines: number;
  }> = [];

  const courseIds = new Set(tasks.filter((t) => !t.isCompleted).map((t) => t.courseId));

  for (const courseId of courseIds) {
    const activity = courseActivity.get(courseId) || 0;
    if (activity > 0) continue; // Has recent activity

    const courseTasks = tasks.filter((t) => t.courseId === courseId && !t.isCompleted);
    const nextWeek = new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = courseTasks.filter(
      (t) => t.dueAt && t.dueAt >= currentTime && t.dueAt <= nextWeek
    ).length;

    if (courseTasks.length > 0) {
      neglectedCourses.push({
        courseId,
        pendingCount: courseTasks.length,
        upcomingDeadlines,
      });
    }
  }

  if (neglectedCourses.length === 0) return null;

  // Sort by urgency (upcoming deadlines first, then pending count)
  neglectedCourses.sort((a, b) => {
    if (b.upcomingDeadlines !== a.upcomingDeadlines) {
      return b.upcomingDeadlines - a.upcomingDeadlines;
    }
    return b.pendingCount - a.pendingCount;
  });

  const topCourse = neglectedCourses[0];
  const course = courses.get(topCourse.courseId);

  if (!course) return null;

  const taskText = topCourse.pendingCount === 1 ? 'task' : 'tasks';
  const deadlineText = topCourse.upcomingDeadlines > 0
    ? `, ${topCourse.upcomingDeadlines} due this week`
    : '';

  return {
    type: 'course_focus',
    taskId: null,
    courseId: topCourse.courseId,
    title: `Focus on ${course.code}`,
    description: `You haven't worked on ${course.code} recently. ${topCourse.pendingCount} ${taskText} pending${deadlineText}.`,
    reasoning: 'Balanced attention across courses helps maintain consistent progress and prevents last-minute cramming.',
    priorityScore: 50 + topCourse.upcomingDeadlines * 10,
    validFrom: currentTime,
    validUntil: new Date(currentTime.getTime() + RECOMMENDATION_VALIDITY.course_focus * 60 * 60 * 1000),
    dismissedAt: null,
    actedOnAt: null,
  };
}

/**
 * Generate all relevant recommendations based on current context
 */
export function generateAllRecommendations(
  tasks: TaskForPriority[],
  courses: Map<number, CourseForPriority>,
  effortEstimates: Map<number, EffortEstimate>,
  recentActivity: TaskCompletionEvent[],
  strugglePatterns: StrugglePattern[],
  courseDifficulty: CoursePerformance[],
  context: RecommendationContext
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Generate each type
  const workNow = generateWorkNowRecommendation(tasks, courses, effortEstimates, context);
  if (workNow) recommendations.push(workNow);

  const startEarly = generateStartEarlyRecommendation(
    tasks,
    courses,
    effortEstimates,
    strugglePatterns,
    courseDifficulty,
    context.currentTime
  );
  if (startEarly) recommendations.push(startEarly);

  const takeBreak = generateBreakRecommendation(recentActivity, context.currentTime);
  if (takeBreak) recommendations.push(takeBreak);

  const courseFocus = generateCourseFocusRecommendation(
    tasks,
    courses,
    recentActivity,
    context.currentTime
  );
  if (courseFocus) recommendations.push(courseFocus);

  // Sort by priority score
  recommendations.sort((a, b) => b.priorityScore - a.priorityScore);

  return recommendations;
}

/**
 * Check if a recommendation is still valid
 */
export function isRecommendationValid(
  recommendation: Recommendation,
  currentTime: Date
): boolean {
  if (recommendation.dismissedAt !== null) return false;
  if (recommendation.actedOnAt !== null) return false;
  if (currentTime < recommendation.validFrom) return false;
  if (currentTime > recommendation.validUntil) return false;
  return true;
}

/**
 * Filter to active (valid) recommendations
 */
export function getActiveRecommendations(
  recommendations: Recommendation[],
  currentTime: Date
): Recommendation[] {
  return recommendations.filter((r) => isRecommendationValid(r, currentTime));
}
