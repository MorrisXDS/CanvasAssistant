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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    if (event.scoreAchieved !== null && event.pointsPossible && event.pointsPossible > 0) {
      dayData.totalScore += (event.scoreAchieved / event.pointsPossible) * 100;
    }

    const hourData = hourStats.get(event.hourOfDay)!;
    hourData.count++;
    if (event.scoreAchieved !== null && event.pointsPossible && event.pointsPossible > 0) {
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
      if (event.scoreAchieved !== null && event.pointsPossible && event.pointsPossible > 0) {
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
    const struggleScore = Math.min(100, Math.max(0,
      (100 - avgScore) * 0.6 + // Low scores contribute
      lateRate * 100 * 0.4 // Late submissions contribute
    ));

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
export function identifyStrugglePatterns(events: TaskCompletionEvent[]): StrugglePattern[] {
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
      if (event.scoreAchieved !== null && event.pointsPossible && event.pointsPossible > 0) {
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
    const struggleScore = Math.min(100, Math.max(0,
      (100 - avgScore) * 0.5 +
      (1 - onTimeRate) * 100 * 0.3 +
      Math.max(0, -avgDaysEarly) * 10 * 0.2 // Negative days = submitted after due
    ));

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
  const hourScore = maxHourCount > 0 ? (hourData.completionCount / maxHourCount) * 100 : 50;

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
