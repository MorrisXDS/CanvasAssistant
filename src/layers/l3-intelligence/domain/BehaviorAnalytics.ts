/**
 * BehaviorAnalytics - Pure Domain Functions for User Behavior Analysis
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Analyzes task completion patterns to understand user behavior and
 * predict optimal work times.
 */

import {
  TaskCompletionEvent,
  WeeklyRhythm,
  CoursePerformance,
  StrugglePattern,
  CourseForPriority,
} from '../types';
import { DAY_NAMES, BEHAVIOR_THRESHOLDS } from './Constants';

/**
 * Analyze weekly rhythm from completion events
 * Identifies productive days and hours based on historical patterns
 */
export function analyzeWeeklyRhythm(events: TaskCompletionEvent[]): WeeklyRhythm {
  if (events.length === 0) {
    return {
      productiveDays: DAY_NAMES.map((name, i) => ({
        dayOfWeek: i,
        dayName: name,
        completionCount: 0,
        avgScore: 0,
      })),
      productiveHours: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        completionCount: 0,
        avgScore: 0,
      })),
      peakDay: 0,
      peakHour: 0,
      sampleSize: 0,
      confidence: 0,
    };
  }

  // Aggregate by day of week
  const dayStats: Map<number, { count: number; totalScore: number }> = new Map();
  for (let i = 0; i < 7; i++) {
    dayStats.set(i, { count: 0, totalScore: 0 });
  }

  // Aggregate by hour of day
  const hourStats: Map<number, { count: number; totalScore: number }> = new Map();
  for (let i = 0; i < 24; i++) {
    hourStats.set(i, { count: 0, totalScore: 0 });
  }

  for (const event of events) {
    const dayData = dayStats.get(event.dayOfWeek)!;
    dayData.count++;
    if (
      event.scoreAchieved !== null &&
      event.pointsPossible &&
      event.pointsPossible > 0
    ) {
      dayData.totalScore += (event.scoreAchieved / event.pointsPossible) * 100;
    }

    const hourData = hourStats.get(event.hourOfDay)!;
    hourData.count++;
    if (
      event.scoreAchieved !== null &&
      event.pointsPossible &&
      event.pointsPossible > 0
    ) {
      hourData.totalScore += (event.scoreAchieved / event.pointsPossible) * 100;
    }
  }

  // Build results
  const productiveDays = Array.from(dayStats.entries())
    .map(([dayOfWeek, stats]) => ({
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      completionCount: stats.count,
      avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const productiveHours = Array.from(hourStats.entries())
    .map(([hour, stats]) => ({
      hour,
      completionCount: stats.count,
      avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
    }))
    .sort((a, b) => a.hour - b.hour);

  // Find peaks
  const peakDayEntry = productiveDays.reduce((max, day) =>
    day.completionCount > max.completionCount ? day : max
  );
  const peakHourEntry = productiveHours.reduce((max, hour) =>
    hour.completionCount > max.completionCount ? hour : max
  );

  // Calculate confidence based on sample size
  const confidence = Math.min(1, events.length / 50); // Full confidence at 50+ events

  return {
    productiveDays,
    productiveHours,
    peakDay: peakDayEntry.dayOfWeek,
    peakHour: peakHourEntry.hour,
    sampleSize: events.length,
    confidence,
  };
}

/**
 * Calculate course difficulty/performance rankings
 * Identifies which courses the user struggles with most
 */
export function calculateCourseDifficulty(
  events: TaskCompletionEvent[],
  courses: CourseForPriority[]
): CoursePerformance[] {
  // Group events by course
  const courseEvents: Map<number, TaskCompletionEvent[]> = new Map();
  for (const event of events) {
    const existing = courseEvents.get(event.courseId) || [];
    existing.push(event);
    courseEvents.set(event.courseId, existing);
  }

  // Build course map for lookup
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const results: CoursePerformance[] = [];

  for (const [courseId, courseEventList] of courseEvents) {
    const course = courseMap.get(courseId);
    if (!course) continue;

    const totalTasks = courseEventList.length;
    let totalScore = 0;
    let scoredCount = 0;
    let onTimeCount = 0;
    let lateCount = 0;

    for (const event of courseEventList) {
      if (
        event.scoreAchieved !== null &&
        event.pointsPossible &&
        event.pointsPossible > 0
      ) {
        totalScore += (event.scoreAchieved / event.pointsPossible) * 100;
        scoredCount++;
      }
      if (event.wasLate) {
        lateCount++;
      } else {
        onTimeCount++;
      }
    }

    const avgScore = scoredCount > 0 ? totalScore / scoredCount : 50;
    const onTimeRate = totalTasks > 0 ? onTimeCount / totalTasks : 1;
    const lateRate = totalTasks > 0 ? lateCount / totalTasks : 0;
    const missedRate = 0; // Would need more data to calculate

    // Struggle score: higher = more difficulty
    // Based on: lower scores, higher late rate
    const struggleScore = Math.min(
      100,
      Math.max(
        0,
        (100 - avgScore) * 0.6 + // Low scores contribute
          lateRate * 100 * 0.4 // Late submissions contribute
      )
    );

    results.push({
      courseId,
      courseCode: course.code,
      courseName: course.name,
      avgScore,
      onTimeRate,
      lateRate,
      missedRate,
      totalTasks,
      struggleScore,
    });
  }

  // Sort by struggle score descending (most difficult first)
  return results.sort((a, b) => b.struggleScore - a.struggleScore);
}

/**
 * Identify struggle patterns by task type
 * Shows which task types the user has most difficulty with
 */
export function identifyStrugglePatterns(
  events: TaskCompletionEvent[]
): StrugglePattern[] {
  // Group by task type
  const typeEvents: Map<string, TaskCompletionEvent[]> = new Map();
  for (const event of events) {
    const existing = typeEvents.get(event.taskType) || [];
    existing.push(event);
    typeEvents.set(event.taskType, existing);
  }

  const results: StrugglePattern[] = [];

  for (const [taskType, typeEventList] of typeEvents) {
    const sampleSize = typeEventList.length;
    let totalScore = 0;
    let scoredCount = 0;
    let onTimeCount = 0;
    let totalDaysEarly = 0;
    let daysEarlyCount = 0;

    for (const event of typeEventList) {
      if (
        event.scoreAchieved !== null &&
        event.pointsPossible &&
        event.pointsPossible > 0
      ) {
        totalScore += (event.scoreAchieved / event.pointsPossible) * 100;
        scoredCount++;
      }
      if (!event.wasLate) {
        onTimeCount++;
      }
      if (event.daysBeforeDue !== null && event.daysBeforeDue >= 0) {
        totalDaysEarly += event.daysBeforeDue;
        daysEarlyCount++;
      }
    }

    const avgScore = scoredCount > 0 ? totalScore / scoredCount : 50;
    const onTimeRate = sampleSize > 0 ? onTimeCount / sampleSize : 1;
    const avgDaysEarly = daysEarlyCount > 0 ? totalDaysEarly / daysEarlyCount : 0;

    // Struggle score calculation
    const struggleScore = Math.min(
      100,
      Math.max(
        0,
        (100 - avgScore) * 0.5 +
          (1 - onTimeRate) * 100 * 0.3 +
          Math.max(0, -avgDaysEarly) * 10 * 0.2 // Negative days = submitted after due
      )
    );

    results.push({
      taskType,
      avgScore,
      onTimeRate,
      avgDaysEarly,
      struggleScore,
      sampleSize,
    });
  }

  // Sort by struggle score descending
  return results.sort((a, b) => b.struggleScore - a.struggleScore);
}

/**
 * Predict optimal work time for a given task type and course
 * Based on historical patterns of successful completions
 */
export function predictOptimalWorkTime(
  taskType: string,
  courseId: number,
  events: TaskCompletionEvent[]
): { dayOfWeek: number; hourOfDay: number } | null {
  // Filter to relevant events (same task type and course, successful completions)
  const relevantEvents = events.filter(
    (e) =>
      e.taskType === taskType &&
      e.courseId === courseId &&
      !e.wasLate &&
      e.scoreAchieved !== null &&
      e.pointsPossible !== null &&
      e.pointsPossible > 0 &&
      e.scoreAchieved / e.pointsPossible >= 0.7 // 70%+ score
  );

  // Fall back to all successful completions if not enough specific data
  const eventsToAnalyze =
    relevantEvents.length >= 5
      ? relevantEvents
      : events.filter(
          (e) =>
            !e.wasLate &&
            e.scoreAchieved !== null &&
            e.pointsPossible !== null &&
            e.pointsPossible > 0 &&
            e.scoreAchieved / e.pointsPossible >= 0.7
        );

  if (eventsToAnalyze.length < 3) {
    return null; // Not enough data
  }

  // Find most common day/hour combination for successful completions
  const dayHourCounts: Map<string, number> = new Map();
  for (const event of eventsToAnalyze) {
    const key = `${event.dayOfWeek}-${event.hourOfDay}`;
    dayHourCounts.set(key, (dayHourCounts.get(key) || 0) + 1);
  }

  let maxCount = 0;
  let bestKey = '0-12'; // Default to Sunday noon

  for (const [key, count] of dayHourCounts) {
    if (count > maxCount) {
      maxCount = count;
      bestKey = key;
    }
  }

  const [dayStr, hourStr] = bestKey.split('-');
  return {
    dayOfWeek: parseInt(dayStr, 10),
    hourOfDay: parseInt(hourStr, 10),
  };
}

/**
 * Get productivity score for a specific time slot
 * Returns 0-100 indicating how productive this time typically is
 */
export function getProductivityScore(
  dayOfWeek: number,
  hourOfDay: number,
  rhythm: WeeklyRhythm
): number {
  if (rhythm.sampleSize === 0) return 50; // Default neutral score

  const dayData = rhythm.productiveDays.find((d) => d.dayOfWeek === dayOfWeek);
  const hourData = rhythm.productiveHours.find((h) => h.hour === hourOfDay);

  if (!dayData || !hourData) return 50;

  // Normalize completion counts to 0-100 scale
  const maxDayCount = Math.max(...rhythm.productiveDays.map((d) => d.completionCount));
  const maxHourCount = Math.max(...rhythm.productiveHours.map((h) => h.completionCount));

  const dayScore = maxDayCount > 0 ? (dayData.completionCount / maxDayCount) * 100 : 50;
  const hourScore =
    maxHourCount > 0 ? (hourData.completionCount / maxHourCount) * 100 : 50;

  // Weighted average: hour is more specific so weight it higher
  return dayScore * 0.3 + hourScore * 0.7;
}

/**
 * Analyze completion timing patterns
 * Returns insights about when users typically complete tasks relative to due dates
 */
export function analyzeCompletionTiming(events: TaskCompletionEvent[]): {
  avgDaysBeforeDue: number;
  medianDaysBeforeDue: number;
  percentOnTime: number;
  percentEarly: number; // > 1 day before
  percentLastMinute: number; // < 1 day before
  percentLate: number;
} {
  if (events.length === 0) {
    return {
      avgDaysBeforeDue: 0,
      medianDaysBeforeDue: 0,
      percentOnTime: 100,
      percentEarly: 0,
      percentLastMinute: 0,
      percentLate: 0,
    };
  }

  const daysBeforeDue: number[] = [];
  let earlyCount = 0;
  let lastMinuteCount = 0;
  let lateCount = 0;
  let onTimeCount = 0;

  for (const event of events) {
    if (event.daysBeforeDue !== null) {
      daysBeforeDue.push(event.daysBeforeDue);
    }

    if (event.wasLate) {
      lateCount++;
    } else {
      onTimeCount++;
      if (event.daysBeforeDue !== null) {
        if (event.daysBeforeDue > 1) {
          earlyCount++;
        } else {
          lastMinuteCount++;
        }
      }
    }
  }

  // Calculate average and median
  const avgDaysBeforeDue =
    daysBeforeDue.length > 0
      ? daysBeforeDue.reduce((sum, d) => sum + d, 0) / daysBeforeDue.length
      : 0;

  const sortedDays = [...daysBeforeDue].sort((a, b) => a - b);
  const medianDaysBeforeDue =
    sortedDays.length > 0
      ? sortedDays.length % 2 === 0
        ? (sortedDays[sortedDays.length / 2 - 1] + sortedDays[sortedDays.length / 2]) / 2
        : sortedDays[Math.floor(sortedDays.length / 2)]
      : 0;

  const total = events.length;

  return {
    avgDaysBeforeDue,
    medianDaysBeforeDue,
    percentOnTime: (onTimeCount / total) * 100,
    percentEarly: (earlyCount / total) * 100,
    percentLastMinute: (lastMinuteCount / total) * 100,
    percentLate: (lateCount / total) * 100,
  };
}

// ============================================================================
// Submission Timing Analysis
// ============================================================================
// Note: We can only analyze WHEN tasks were submitted relative to deadlines.
// We cannot make claims about when users started working or if they
// "procrastinated" since we don't track work-start times.

/**
 * Submission timing pattern for a task type
 * Based on observable data: when tasks were submitted relative to due dates
 */
export interface SubmissionTimingPattern {
  taskType: string;
  /** Average days before due when work was submitted (negative = late) */
  avgDaysBeforeDue: number;
  /** Percentage of tasks submitted last-minute (< 1 day before due) */
  lastMinuteRate: number;
  /** Conditions associated with late/last-minute submissions */
  riskFactors: string[];
  /** Risk level for deadline stress with this task type */
  deadlineRisk: 'low' | 'medium' | 'high';
  /** Sample size for this pattern */
  sampleSize: number;
}

/**
 * Deadline risk assessment for a specific task
 * Based on historical submission patterns and task characteristics
 */
export interface DeadlineRiskAssessment {
  taskId: number;
  taskType: string;
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number; // 0-100
  riskFactors: string[];
  suggestions: string[];
}

/**
 * Analyze submission timing patterns from completion events
 * Identifies task types where submissions tend to be close to deadlines
 *
 * Note: This analyzes WHEN tasks were submitted, not when work started.
 */
export function analyzeSubmissionPatterns(
  events: TaskCompletionEvent[]
): SubmissionTimingPattern[] {
  // Group events by task type
  const typeEvents: Map<string, TaskCompletionEvent[]> = new Map();
  for (const event of events) {
    const existing = typeEvents.get(event.taskType) || [];
    existing.push(event);
    typeEvents.set(event.taskType, existing);
  }

  const patterns: SubmissionTimingPattern[] = [];

  for (const [taskType, typeEventList] of typeEvents) {
    if (typeEventList.length < 3) continue; // Need enough data

    // Calculate submission timing stats
    const daysBeforeDueList: number[] = [];
    let lastMinuteCount = 0;
    let lateCount = 0;

    for (const event of typeEventList) {
      if (event.daysBeforeDue !== null) {
        daysBeforeDueList.push(event.daysBeforeDue);
        if (event.daysBeforeDue < 1 && !event.wasLate) {
          lastMinuteCount++;
        }
      }
      if (event.wasLate) {
        lateCount++;
      }
    }

    if (daysBeforeDueList.length === 0) continue;

    const avgDaysBeforeDue =
      daysBeforeDueList.reduce((sum, d) => sum + d, 0) / daysBeforeDueList.length;
    const lastMinuteRate = lastMinuteCount / typeEventList.length;
    const lateRate = lateCount / typeEventList.length;

    // Identify risk factors based on observable patterns
    const riskFactors: string[] = [];

    if (lastMinuteRate >= 0.5) {
      riskFactors.push('Frequently submitted last minute');
    }
    if (lateRate >= 0.3) {
      riskFactors.push('High late submission rate');
    }
    if (avgDaysBeforeDue < 1 && avgDaysBeforeDue >= 0) {
      riskFactors.push('Typically submitted day-of');
    }

    // Check for weight correlation
    const weightedEvents = typeEventList.filter(
      (e) => e.pointsPossible && e.pointsPossible > 0
    );
    if (weightedEvents.length >= 3) {
      const highPointEvents = weightedEvents.filter((e) => (e.pointsPossible ?? 0) >= 50);
      if (highPointEvents.length > 0) {
        const highPointLastMinute = highPointEvents.filter(
          (e) => (e.daysBeforeDue ?? 0) < 1
        ).length;
        if (highPointLastMinute / highPointEvents.length > 0.5) {
          riskFactors.push('High-weight tasks often submitted last minute');
        }
      }
    }

    // Determine deadline risk level
    let deadlineRisk: SubmissionTimingPattern['deadlineRisk'] = 'low';
    if (avgDaysBeforeDue < 0.5 || lateRate >= 0.4) {
      deadlineRisk = 'high';
    } else if (avgDaysBeforeDue < 1 || lateRate >= 0.2 || lastMinuteRate >= 0.5) {
      deadlineRisk = 'medium';
    }

    patterns.push({
      taskType,
      avgDaysBeforeDue,
      lastMinuteRate,
      riskFactors,
      deadlineRisk,
      sampleSize: typeEventList.length,
    });
  }

  // Sort by risk level (high first)
  const riskOrder: Record<SubmissionTimingPattern['deadlineRisk'], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  patterns.sort((a, b) => riskOrder[a.deadlineRisk] - riskOrder[b.deadlineRisk]);

  return patterns;
}

/**
 * Assess deadline risk for a specific task
 * Based on historical submission patterns and task characteristics
 */
export function assessDeadlineRisk(
  task: {
    id: number;
    taskType: string;
    dueAt: Date | null;
    weight: number | null;
    courseId: number;
  },
  patterns: SubmissionTimingPattern[],
  coursePerformance: CoursePerformance[],
  currentTime: Date
): DeadlineRiskAssessment {
  const riskFactors: string[] = [];
  let riskScore = 0;

  // Check submission pattern for this task type
  const typePattern = patterns.find((p) => p.taskType === task.taskType);
  if (typePattern) {
    if (typePattern.deadlineRisk === 'high') {
      riskScore += 40;
      riskFactors.push(`${task.taskType}s often submitted close to deadline`);
    } else if (typePattern.deadlineRisk === 'medium') {
      riskScore += 25;
      riskFactors.push(`${task.taskType}s sometimes submitted last minute`);
    }

    // Add specific factors from pattern
    for (const factor of typePattern.riskFactors) {
      if (!riskFactors.includes(factor)) {
        riskFactors.push(factor);
      }
    }
  }

  // Check time until due
  if (task.dueAt) {
    const daysUntilDue =
      (task.dueAt.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilDue <= 2 && daysUntilDue > 0) {
      riskScore += 30;
      riskFactors.push('Due very soon');
    } else if (daysUntilDue <= 5 && daysUntilDue > 2) {
      riskScore += 15;
      riskFactors.push('Due within a week');
    }
  }

  // Check task weight
  if (task.weight && task.weight >= 20) {
    riskScore += 15;
    riskFactors.push('High-weight task');
  } else if (task.weight && task.weight >= 10) {
    riskScore += 10;
    riskFactors.push('Significant weight');
  }

  // Check course difficulty
  const courseDifficulty = coursePerformance.find((c) => c.courseId === task.courseId);
  if (courseDifficulty && courseDifficulty.struggleScore >= 50) {
    riskScore += 15;
    riskFactors.push('Challenging course');
  }

  // Determine overall risk level
  let riskLevel: DeadlineRiskAssessment['riskLevel'] = 'low';
  if (riskScore >= 60) {
    riskLevel = 'high';
  } else if (riskScore >= 35) {
    riskLevel = 'medium';
  }

  // Generate suggestions based on observable data
  const suggestions: string[] = [];
  if (riskLevel === 'high') {
    suggestions.push('This task has multiple risk factors');
    suggestions.push('Consider prioritizing this task');
  } else if (riskLevel === 'medium') {
    suggestions.push('Plan time for this task');
  }

  if (task.weight && task.weight >= 15) {
    suggestions.push('High grade impact');
  }

  return {
    taskId: task.id,
    taskType: task.taskType,
    riskLevel,
    riskScore: Math.min(100, riskScore),
    riskFactors,
    suggestions,
  };
}

/**
 * Identify common submission timing patterns across all events
 * Based on observable data: when tasks were submitted relative to deadlines
 */
export function identifySubmissionPatterns(events: TaskCompletionEvent[]): string[] {
  const patterns: string[] = [];

  if (events.length < 10) return patterns;

  // Analyze timing patterns
  const timing = analyzeCompletionTiming(events);

  if (timing.percentLastMinute >= 40) {
    patterns.push('Many tasks submitted last minute');
  }

  if (timing.percentLate >= 25) {
    patterns.push('Frequent late submissions');
  }

  // Analyze day of week patterns
  const dayLateRates = new Map<number, { total: number; late: number }>();
  for (let i = 0; i < 7; i++) {
    dayLateRates.set(i, { total: 0, late: 0 });
  }

  for (const event of events) {
    const data = dayLateRates.get(event.dayOfWeek)!;
    data.total++;
    if (event.wasLate) data.late++;
  }

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  for (let i = 0; i < 7; i++) {
    const data = dayLateRates.get(i)!;
    if (data.total >= 5 && data.late / data.total >= 0.4) {
      patterns.push(`Higher late rate on ${dayNames[i]}s`);
    }
  }

  // Analyze task type patterns
  const strugglePatterns = identifyStrugglePatterns(events);
  const highStruggleTypes = strugglePatterns
    .filter((p) => p.struggleScore >= 50)
    .slice(0, 2);

  for (const pattern of highStruggleTypes) {
    patterns.push(`Lower scores on ${pattern.taskType}s`);
  }

  return patterns;
}
