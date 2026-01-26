/**
 * InsightGenerator - Pure Domain Functions for User Insights
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Generates actionable insight cards based on user patterns,
 * performance trends, and workload analysis.
 */

import {
  Insight,
  InsightType,
  InsightSeverity,
  TaskCompletionEvent,
  CoursePerformance,
  WeeklyRhythm,
  WorkloadDistribution,
  TaskForPriority,
} from '../types';

/**
 * Default insight expiration in hours
 *
 * All insights are based on observable data (submission timing, grades, due dates).
 */
const INSIGHT_EXPIRATION: Record<InsightType, number> = {
  deadline_pattern: 168, // 1 week
  course_struggle: 168, // 1 week
  productivity_window: 336, // 2 weeks
  workload_warning: 48, // 2 days
  streak: 24, // 1 day
  improvement: 168, // 1 week
  data_completeness: 168, // 1 week
  grade_at_risk: 72, // 3 days
  grade_trend: 168, // 1 week
  crunch_period: 48, // 2 days
  unset_weight: 168, // 1 week
  guessed_due_date: 168, // 1 week
};

/**
 * Generate deadline pattern insight
 * Identifies patterns in late submissions by day of week
 */
export function generateDeadlinePatternInsight(
  events: TaskCompletionEvent[],
  currentTime: Date
): Insight | null {
  if (events.length < 10) return null; // Need enough data

  // Group late submissions by day of week
  const lateByDay: Map<number, number> = new Map();
  const totalByDay: Map<number, number> = new Map();

  for (let i = 0; i < 7; i++) {
    lateByDay.set(i, 0);
    totalByDay.set(i, 0);
  }

  for (const event of events) {
    if (!event.dueAt) continue;
    const dueDay = event.dueAt.getDay();
    totalByDay.set(dueDay, (totalByDay.get(dueDay) || 0) + 1);
    if (event.wasLate) {
      lateByDay.set(dueDay, (lateByDay.get(dueDay) || 0) + 1);
    }
  }

  // Find day with highest late rate
  let worstDay = -1;
  let worstRate = 0;
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
    const total = totalByDay.get(i) || 0;
    const late = lateByDay.get(i) || 0;
    if (total >= 3) {
      // Need at least 3 samples
      const rate = late / total;
      if (rate > worstRate && rate >= 0.3) {
        // At least 30% late
        worstRate = rate;
        worstDay = i;
      }
    }
  }

  if (worstDay === -1) return null;

  const dayName = dayNames[worstDay];
  const percentLate = Math.round(worstRate * 100);

  return {
    type: 'deadline_pattern',
    title: `${dayName} Deadline Trouble`,
    description: `You tend to miss ${dayName} deadlines - ${percentLate}% of tasks due on ${dayName}s are submitted late.`,
    severity: percentLate >= 50 ? 'warning' : 'info',
    data: {
      worstDay,
      dayName,
      lateRate: worstRate,
      sampleSize: totalByDay.get(worstDay) || 0,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.deadline_pattern * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate course struggle insight
 * Identifies courses where user is having difficulty
 */
export function generateCourseStruggleInsight(
  coursePerformance: CoursePerformance[],
  currentTime: Date
): Insight | null {
  // Find courses with high struggle scores
  const strugglingCourses = coursePerformance.filter((c) => c.struggleScore >= 50);

  if (strugglingCourses.length === 0) return null;

  // Sort by struggle score and take the worst
  strugglingCourses.sort((a, b) => b.struggleScore - a.struggleScore);
  const worst = strugglingCourses[0];

  let severity: InsightSeverity = 'info';
  if (worst.struggleScore >= 70) severity = 'critical';
  else if (worst.struggleScore >= 60) severity = 'warning';

  const latePercent = Math.round(worst.lateRate * 100);

  return {
    type: 'course_struggle',
    title: `Struggling in ${worst.courseCode}`,
    description: `Your performance in ${worst.courseCode} shows signs of difficulty: ${Math.round(worst.avgScore)}% average score, ${latePercent}% late submissions.`,
    severity,
    data: {
      courseId: worst.courseId,
      courseCode: worst.courseCode,
      avgScore: worst.avgScore,
      lateRate: worst.lateRate,
      struggleScore: worst.struggleScore,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.course_struggle * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate productivity window insight
 * Shows when user is most productive
 */
export function generateProductivityWindowInsight(
  rhythm: WeeklyRhythm,
  currentTime: Date
): Insight | null {
  if (rhythm.sampleSize < 15) return null; // Need enough data

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const peakDayName = dayNames[rhythm.peakDay];

  // Format peak hour
  const formatHour = (hour: number) => {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  };

  const peakHourStr = formatHour(rhythm.peakHour);
  const peakHourEnd = formatHour((rhythm.peakHour + 2) % 24);

  return {
    type: 'productivity_window',
    title: 'Your Peak Productivity',
    description: `You're most productive on ${peakDayName}s around ${peakHourStr}-${peakHourEnd}. Consider scheduling important tasks during this window.`,
    severity: 'info',
    data: {
      peakDay: rhythm.peakDay,
      peakDayName,
      peakHour: rhythm.peakHour,
      sampleSize: rhythm.sampleSize,
      confidence: rhythm.confidence,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.productivity_window * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate workload warning insight
 * Warns about upcoming deadline clusters
 */
export function generateWorkloadWarningInsight(
  workload: WorkloadDistribution,
  tasks: TaskForPriority[],
  currentTime: Date
): Insight | null {
  // Check for high clustering
  if (workload.clusteringScore < 0.5) return null;

  // Find the peak day details
  if (!workload.peakDay) return null;

  const peakTasks = tasks.filter((t) => {
    if (!t.dueAt || t.isCompleted) return false;
    const taskDate = t.dueAt.toDateString();
    const peakDate = workload.peakDay!.toDateString();
    return taskDate === peakDate;
  });

  if (peakTasks.length < 3) return null;

  const daysUntilPeak = Math.ceil(
    (workload.peakDay.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilPeak < 0 || daysUntilPeak > 7) return null;

  let severity: InsightSeverity = 'info';
  if (peakTasks.length >= 5 || (peakTasks.length >= 4 && daysUntilPeak <= 2)) {
    severity = 'critical';
  } else if (peakTasks.length >= 4 || daysUntilPeak <= 2) {
    severity = 'warning';
  }

  const dayStr =
    daysUntilPeak === 0
      ? 'today'
      : daysUntilPeak === 1
        ? 'tomorrow'
        : `in ${daysUntilPeak} days`;

  return {
    type: 'workload_warning',
    title: `${peakTasks.length} Tasks Due ${daysUntilPeak === 0 ? 'Today' : 'Soon'}`,
    description: `You have ${peakTasks.length} tasks due ${dayStr}. Consider starting some early to avoid a crunch.`,
    severity,
    data: {
      peakDate: workload.peakDay.toISOString(),
      taskCount: peakTasks.length,
      daysUntilPeak,
      estimatedMinutes: workload.peakMinutes,
      taskIds: peakTasks.map((t) => t.id),
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.workload_warning * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate streak insight
 * Celebrates on-time submission streaks
 */
export function generateStreakInsight(
  events: TaskCompletionEvent[],
  currentTime: Date
): Insight | null {
  // Sort events by completion time, most recent first
  const sorted = [...events]
    .filter((e) => e.completedAt)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  if (sorted.length < 3) return null;

  // Count consecutive on-time submissions
  let streak = 0;
  for (const event of sorted) {
    if (!event.wasLate) {
      streak++;
    } else {
      break;
    }
  }

  // Only celebrate streaks of 5+
  if (streak < 5) return null;

  let title = '';
  let severity: InsightSeverity = 'info';

  if (streak >= 20) {
    title = `Amazing ${streak}-Task Streak!`;
  } else if (streak >= 10) {
    title = `Great ${streak}-Task Streak!`;
  } else {
    title = `${streak} Tasks On Time!`;
  }

  return {
    type: 'streak',
    title,
    description: `You've submitted ${streak} tasks on time in a row. Keep up the great work!`,
    severity,
    data: {
      streakCount: streak,
      lastCompletedAt: sorted[0].completedAt.toISOString(),
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.streak * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate improvement insight
 * Celebrates grade improvements
 */
export function generateImprovementInsight(
  events: TaskCompletionEvent[],
  currentTime: Date
): Insight | null {
  // Need at least 6 graded events to compare
  const gradedEvents = events.filter(
    (e) => e.scoreAchieved !== null && e.pointsPossible && e.pointsPossible > 0
  );

  if (gradedEvents.length < 6) return null;

  // Sort by completion date
  const sorted = [...gradedEvents].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime()
  );

  // Compare first half to second half
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const avgFirst =
    firstHalf.reduce((sum, e) => sum + (e.scoreAchieved! / e.pointsPossible!) * 100, 0) /
    firstHalf.length;
  const avgSecond =
    secondHalf.reduce((sum, e) => sum + (e.scoreAchieved! / e.pointsPossible!) * 100, 0) /
    secondHalf.length;

  const improvement = avgSecond - avgFirst;

  // Only report significant improvements (5%+)
  if (improvement < 5) return null;

  const improvementPercent = Math.round(improvement);

  return {
    type: 'improvement',
    title: `Grades Up ${improvementPercent}%`,
    description: `Your recent grades are ${improvementPercent}% higher than earlier this term. Your hard work is paying off!`,
    severity: 'info',
    data: {
      previousAverage: Math.round(avgFirst),
      currentAverage: Math.round(avgSecond),
      improvement: improvementPercent,
      sampleSize: gradedEvents.length,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.improvement * 60 * 60 * 1000
    ),
  };
}

// ============================================================================
// New Intelligence Insights (Grade Forecasting, Crunch Periods, etc.)
// ============================================================================

/**
 * Grade forecast data for insight generation
 */
export interface GradeForecastForInsight {
  courseId: number;
  courseCode: string;
  currentGrade: number;
  projectedFinal: number;
  targetGrade: number;
  neededAverage: number;
  remainingWeight: number;
  riskLevel: 'safe' | 'warning' | 'at-risk';
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Generate grade at-risk insight
 * Alerts when projected grade is significantly below target
 */
export function generateGradeAtRiskInsight(
  forecast: GradeForecastForInsight,
  currentTime: Date
): Insight | null {
  // Only generate for at-risk or warning courses
  if (forecast.riskLevel === 'safe') return null;

  const gap = forecast.targetGrade - forecast.projectedFinal;

  let severity: InsightSeverity = 'warning';
  let title = `${forecast.courseCode} Grade Warning`;
  let description = '';

  if (forecast.riskLevel === 'at-risk') {
    severity = 'critical';
    title = `${forecast.courseCode} Grade At Risk`;
    description = `Projected grade (${forecast.projectedFinal}%) is ${Math.round(gap)}% below your target of ${forecast.targetGrade}%. `;

    if (forecast.neededAverage > 95) {
      description += `You would need an average of ${Math.round(forecast.neededAverage)}% on remaining work to reach your target, which may be unrealistic.`;
    } else {
      description += `You need an average of ${Math.round(forecast.neededAverage)}% on remaining work to reach your target.`;
    }
  } else {
    description = `${forecast.courseCode} projected at ${forecast.projectedFinal}%, ${Math.round(gap)}% below your target. You need ${Math.round(forecast.neededAverage)}% on remaining work.`;
  }

  return {
    type: 'grade_at_risk',
    title,
    description,
    severity,
    data: {
      courseId: forecast.courseId,
      courseCode: forecast.courseCode,
      currentGrade: forecast.currentGrade,
      projectedFinal: forecast.projectedFinal,
      targetGrade: forecast.targetGrade,
      neededAverage: forecast.neededAverage,
      remainingWeight: forecast.remainingWeight,
      gap,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.grade_at_risk * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate grade trend insight
 * Shows when grades are improving or declining
 */
export function generateGradeTrendInsight(
  forecast: GradeForecastForInsight,
  currentTime: Date
): Insight | null {
  // Only interesting if there's a clear trend
  if (forecast.trend === 'stable') return null;

  const isImproving = forecast.trend === 'improving';

  if (isImproving) {
    return {
      type: 'grade_trend',
      title: `${forecast.courseCode} Grades Improving`,
      description: `Your recent grades in ${forecast.courseCode} show an upward trend. Keep up the momentum!`,
      severity: 'info',
      data: {
        courseId: forecast.courseId,
        courseCode: forecast.courseCode,
        trend: forecast.trend,
        currentGrade: forecast.currentGrade,
      },
      acknowledgedAt: null,
      expiresAt: new Date(
        currentTime.getTime() + INSIGHT_EXPIRATION.grade_trend * 60 * 60 * 1000
      ),
    };
  }

  // Declining trend is more serious
  return {
    type: 'grade_trend',
    title: `${forecast.courseCode} Grades Declining`,
    description: `Your recent grades in ${forecast.courseCode} show a downward trend. Consider adjusting your study approach or seeking help.`,
    severity: 'warning',
    data: {
      courseId: forecast.courseId,
      courseCode: forecast.courseCode,
      trend: forecast.trend,
      currentGrade: forecast.currentGrade,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.grade_trend * 60 * 60 * 1000
    ),
  };
}

/**
 * Crunch period data for insight generation
 */
export interface CrunchPeriodForInsight {
  startDate: Date;
  endDate: Date;
  totalHours: number;
  taskCount: number;
  severity: 'moderate' | 'severe' | 'extreme';
}

/**
 * Generate crunch period ahead insight
 */
export function generateCrunchPeriodInsight(
  crunchPeriod: CrunchPeriodForInsight,
  currentTime: Date
): Insight | null {
  const daysUntilCrunch = Math.ceil(
    (crunchPeriod.startDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Only warn about upcoming crunch periods (within 7 days)
  if (daysUntilCrunch < 0 || daysUntilCrunch > 7) return null;

  let severity: InsightSeverity = 'warning';
  if (crunchPeriod.severity === 'extreme') {
    severity = 'critical';
  } else if (crunchPeriod.severity === 'moderate') {
    severity = 'info';
  }

  const startStr = crunchPeriod.startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const endStr = crunchPeriod.endDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const daysStr =
    daysUntilCrunch === 0
      ? 'starts today'
      : daysUntilCrunch === 1
        ? 'starts tomorrow'
        : `in ${daysUntilCrunch} days`;

  return {
    type: 'crunch_period',
    title: `Heavy Period Ahead`,
    description: `You have ${crunchPeriod.taskCount} tasks (~${Math.round(crunchPeriod.totalHours)} hours) due ${startStr} - ${endStr}. This ${crunchPeriod.severity} workload ${daysStr}.`,
    severity,
    data: {
      startDate: crunchPeriod.startDate.toISOString(),
      endDate: crunchPeriod.endDate.toISOString(),
      totalHours: crunchPeriod.totalHours,
      taskCount: crunchPeriod.taskCount,
      daysUntilCrunch,
      severity: crunchPeriod.severity,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.crunch_period * 60 * 60 * 1000
    ),
  };
}

// ============================================================================
// Data Quality Insights
// ============================================================================

/**
 * High-value task types that should have weights set
 */
const HIGH_VALUE_TASK_TYPES = [
  'exam',
  'midterm',
  'final',
  'final_exam',
  'termtest',
  'project',
];

/**
 * Generate unset weight insight
 * Reminds user about tasks missing weight information
 */
export function generateUnsetWeightInsight(
  tasks: TaskForPriority[],
  currentTime: Date
): Insight | null {
  // Find incomplete tasks with no weight set (0 or null)
  const unsetTasks = tasks.filter(
    (t) => !t.isCompleted && (t.weight === 0 || t.weight === null)
  );

  if (unsetTasks.length === 0) return null;

  // Check if any are high-value types (more urgent)
  const hasHighValue = unsetTasks.some((t) =>
    HIGH_VALUE_TASK_TYPES.includes(t.taskType?.toLowerCase() || '')
  );

  const severity: InsightSeverity = hasHighValue ? 'warning' : 'info';
  const taskWord = unsetTasks.length === 1 ? 'task has' : 'tasks have';

  return {
    type: 'unset_weight',
    title: `${unsetTasks.length} ${taskWord} no weight set`,
    description: 'Set weights to accurately calculate grade impact and prioritize tasks.',
    severity,
    data: {
      taskIds: unsetTasks.map((t) => t.id),
      taskCount: unsetTasks.length,
      hasHighValue,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.unset_weight * 60 * 60 * 1000
    ),
  };
}

/**
 * Generate guessed due date insight
 * Reminds user about tasks with auto-assigned dates that may need verification
 */
export function generateGuessedDueDateInsight(
  tasks: TaskForPriority[],
  currentTime: Date
): Insight | null {
  // Find incomplete tasks with guessed due dates
  const guessedTasks = tasks.filter(
    (t) => !t.isCompleted && t.fieldSources?.due_at === 'guessed'
  );

  if (guessedTasks.length === 0) return null;

  // Count how many are urgent (due within 7 days)
  const urgentCount = guessedTasks.filter((t) => {
    if (!t.dueAt) return false;
    const daysUntil = Math.ceil(
      (t.dueAt.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil >= 0 && daysUntil <= 7;
  }).length;

  const severity: InsightSeverity = urgentCount > 0 ? 'warning' : 'info';
  const taskWord = guessedTasks.length === 1 ? 'task has an' : 'tasks have';

  return {
    type: 'guessed_due_date',
    title: `${guessedTasks.length} ${taskWord} estimated due date`,
    description:
      'These dates were auto-assigned. Verify they are correct to avoid surprises.',
    severity,
    data: {
      taskIds: guessedTasks.map((t) => t.id),
      taskCount: guessedTasks.length,
      urgentCount,
    },
    acknowledgedAt: null,
    expiresAt: new Date(
      currentTime.getTime() + INSIGHT_EXPIRATION.guessed_due_date * 60 * 60 * 1000
    ),
  };
}

// ============================================================================
// Removed Unfounded Insights
// ============================================================================
// The following insight types were removed because we don't have the data
// to support them honestly:
//
// - study_effectiveness: We don't track study time or preparation time
// - procrastination_warning: We don't know when users START working on tasks
//
// These were replaced with insights based on observable data (submission timing,
// grades received, due dates).

/**
 * Generate all relevant insights based on available data
 */
export function generateAllInsights(
  events: TaskCompletionEvent[],
  coursePerformance: CoursePerformance[],
  rhythm: WeeklyRhythm,
  workload: WorkloadDistribution | null,
  tasks: TaskForPriority[],
  currentTime: Date
): Insight[] {
  const insights: Insight[] = [];

  // Generate each type of insight
  const deadlinePattern = generateDeadlinePatternInsight(events, currentTime);
  if (deadlinePattern) insights.push(deadlinePattern);

  const courseStruggle = generateCourseStruggleInsight(coursePerformance, currentTime);
  if (courseStruggle) insights.push(courseStruggle);

  const productivityWindow = generateProductivityWindowInsight(rhythm, currentTime);
  if (productivityWindow) insights.push(productivityWindow);

  if (workload) {
    const workloadWarning = generateWorkloadWarningInsight(workload, tasks, currentTime);
    if (workloadWarning) insights.push(workloadWarning);
  }

  const streak = generateStreakInsight(events, currentTime);
  if (streak) insights.push(streak);

  const improvement = generateImprovementInsight(events, currentTime);
  if (improvement) insights.push(improvement);

  // Data quality insights
  const unsetWeight = generateUnsetWeightInsight(tasks, currentTime);
  if (unsetWeight) insights.push(unsetWeight);

  const guessedDueDate = generateGuessedDueDateInsight(tasks, currentTime);
  if (guessedDueDate) insights.push(guessedDueDate);

  // Sort by severity (critical first, then warning, then info)
  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return insights;
}

/**
 * Check if an insight is still valid
 */
export function isInsightValid(insight: Insight, currentTime: Date): boolean {
  if (insight.acknowledgedAt !== null) return false;
  if (insight.expiresAt && currentTime > insight.expiresAt) return false;
  return true;
}

/**
 * Filter to active (valid) insights
 */
export function getActiveInsights(insights: Insight[], currentTime: Date): Insight[] {
  return insights.filter((i) => isInsightValid(i, currentTime));
}

/**
 * Get insight icon based on type
 */
export function getInsightIcon(type: InsightType): string {
  switch (type) {
    case 'deadline_pattern':
      return 'calendar-warning';
    case 'course_struggle':
      return 'alert-triangle';
    case 'productivity_window':
      return 'clock-check';
    case 'workload_warning':
      return 'layers';
    case 'streak':
      return 'flame';
    case 'improvement':
      return 'trending-up';
    case 'data_completeness':
      return 'file-warning';
    case 'grade_at_risk':
      return 'alert-circle';
    case 'grade_trend':
      return 'trending-down';
    case 'crunch_period':
      return 'calendar-clock';
    case 'unset_weight':
      return 'scale';
    case 'guessed_due_date':
      return 'calendar-question';
    default:
      return 'info';
  }
}

/**
 * Get severity color
 */
export function getSeverityColor(severity: InsightSeverity): string {
  switch (severity) {
    case 'critical':
      return '#ef4444'; // red-500
    case 'warning':
      return '#f59e0b'; // amber-500
    case 'info':
      return '#3b82f6'; // blue-500
    default:
      return '#6b7280'; // gray-500
  }
}
