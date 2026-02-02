/**
 * GradeForecastingService - Pure Domain Functions for Grade Predictions
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Provides:
 * - Grade projections based on current performance
 * - At-risk course detection
 * - GPA impact analysis
 * - Grade trend analysis
 */

import { TaskForPriority, CourseForPriority } from '../types';

/**
 * Grade forecast for a course
 */
export interface GradeForecast {
  courseId: number;
  courseCode: string;
  /** Current assessed grade (based on completed work) */
  currentGrade: number;
  /** Projected final grade (assuming average performance on remaining) */
  projectedFinal: number;
  /** Confidence in the projection (0-1) */
  confidence: number;
  /** Grade trend over recent assessments */
  trend: 'improving' | 'stable' | 'declining';
  /** Risk level based on projection vs target */
  riskLevel: 'safe' | 'warning' | 'at-risk';
  /** Weight of remaining assessments */
  remainingWeight: number;
  /** Average needed on remaining work to hit target */
  neededAverage: number;
  /** Target grade for the course */
  targetGrade: number;
}

/**
 * Course risk assessment
 */
export interface CourseRisk {
  courseId: number;
  courseCode: string;
  riskLevel: 'safe' | 'warning' | 'at-risk';
  currentGrade: number;
  targetGrade: number;
  gapToTarget: number;
  projectedFinal: number;
  neededAverage: number;
  remainingWeight: number;
  /** Why this course is flagged */
  riskFactors: string[];
}

/**
 * GPA projection under different scenarios
 */
export interface GpaProjection {
  currentGpa: number;
  projectedGpa: number;
  bestCaseGpa: number;
  worstCaseGpa: number;
  creditsCompleted: number;
  creditsInProgress: number;
}

/**
 * Task data needed for grade forecasting
 */
export interface TaskForForecast {
  id: number;
  courseId: number;
  weight: number | null;
  grade: number | null;
  isCompleted: boolean;
  dueAt: Date | null;
}

/**
 * Course data needed for grade forecasting
 */
export interface CourseForForecast {
  id: number;
  code: string;
  name: string;
  currentGrade: number | null;
  assessedGrade: number | null;
  targetGrade: number;
  totalWeight: number;
}

/**
 * Grade history entry for trend analysis
 */
export interface GradeHistoryEntry {
  courseId: number;
  grade: number;
  recordedAt: Date;
}

// ============================================================================
// Grade Forecasting Functions
// ============================================================================

/**
 * Forecast final grade for a course
 */
export function forecastFinalGrade(
  tasks: TaskForForecast[],
  course: CourseForForecast,
  gradeHistory?: GradeHistoryEntry[]
): GradeForecast {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);

  // Calculate completed vs remaining weight
  const completedTasks = courseTasks.filter((t) => t.isCompleted && t.grade !== null);
  const remainingTasks = courseTasks.filter((t) => !t.isCompleted);

  const completedWeight = completedTasks.reduce((sum, t) => sum + (t.weight ?? 0), 0);
  const remainingWeight = remainingTasks.reduce((sum, t) => sum + (t.weight ?? 0), 0);

  // Use assessed grade or calculate from completed tasks
  let currentGrade = course.assessedGrade ?? 0;
  if (completedTasks.length > 0 && completedWeight > 0) {
    const weightedSum = completedTasks.reduce(
      (sum, t) => sum + (t.grade ?? 0) * (t.weight ?? 0),
      0
    );
    currentGrade = weightedSum / completedWeight;
  }

  // Project final grade assuming average performance on remaining
  // If no remaining work, projected = current
  let projectedFinal = currentGrade;
  if (remainingWeight > 0) {
    const totalWeight = completedWeight + remainingWeight;
    // Assume they score their current average on remaining work
    const projectedRemaining = currentGrade;
    projectedFinal =
      (currentGrade * completedWeight + projectedRemaining * remainingWeight) /
      totalWeight;
  }

  // Calculate what's needed to hit target
  const targetGrade = course.targetGrade;
  let neededAverage = 0;
  if (remainingWeight > 0) {
    const totalWeight = completedWeight + remainingWeight;
    // target = (current * completedWeight + needed * remainingWeight) / totalWeight
    // Solving for needed:
    neededAverage =
      (targetGrade * totalWeight - currentGrade * completedWeight) / remainingWeight;
    // Clamp to realistic range
    neededAverage = Math.max(0, Math.min(100, neededAverage));
  }

  // Analyze trend from grade history
  const trend = gradeHistory
    ? analyzeTrend(gradeHistory.filter((h) => h.courseId === course.id))
    : 'stable';

  // Determine risk level
  const gapToTarget = targetGrade - projectedFinal;
  let riskLevel: GradeForecast['riskLevel'] = 'safe';
  if (gapToTarget > 10 || neededAverage > 95) {
    riskLevel = 'at-risk';
  } else if (gapToTarget > 5 || neededAverage > 85) {
    riskLevel = 'warning';
  }

  // Calculate confidence based on data quality
  const confidence = calculateForecastConfidence(
    completedWeight,
    remainingWeight,
    completedTasks.length
  );

  return {
    courseId: course.id,
    courseCode: course.code,
    currentGrade: Math.round(currentGrade * 10) / 10,
    projectedFinal: Math.round(projectedFinal * 10) / 10,
    confidence,
    trend,
    riskLevel,
    remainingWeight,
    neededAverage: Math.round(neededAverage * 10) / 10,
    targetGrade,
  };
}

/**
 * Calculate confidence score for forecast
 */
function calculateForecastConfidence(
  completedWeight: number,
  remainingWeight: number,
  completedCount: number
): number {
  // More completed weight = higher confidence
  const weightConfidence = completedWeight / (completedWeight + remainingWeight);

  // More samples = higher confidence (up to ~10 tasks)
  const sampleConfidence = Math.min(1, completedCount / 10);

  // Combined confidence (weighted average)
  return weightConfidence * 0.7 + sampleConfidence * 0.3;
}

/**
 * Analyze grade trend from history
 */
export function analyzeTrend(
  history: GradeHistoryEntry[]
): 'improving' | 'stable' | 'declining' {
  if (history.length < 3) return 'stable';

  // Sort by date, most recent first
  const sorted = [...history].sort(
    (a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()
  );

  // Compare recent (last 3) to older grades
  const recent = sorted.slice(0, 3);
  const older = sorted.slice(3);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, h) => sum + h.grade, 0) / recent.length;
  const olderAvg = older.reduce((sum, h) => sum + h.grade, 0) / older.length;

  const change = recentAvg - olderAvg;

  if (change >= 5) return 'improving';
  if (change <= -5) return 'declining';
  return 'stable';
}

/**
 * Detect courses at risk of not meeting target grades
 */
export function detectAtRiskCourses(
  tasks: TaskForForecast[],
  courses: CourseForForecast[]
): CourseRisk[] {
  const risks: CourseRisk[] = [];

  for (const course of courses) {
    const forecast = forecastFinalGrade(tasks, course);
    const riskFactors: string[] = [];

    // Only include non-safe courses
    if (forecast.riskLevel === 'safe') continue;

    // Identify risk factors
    if (forecast.neededAverage > 95) {
      riskFactors.push(
        `Need ${Math.round(forecast.neededAverage)}% average on remaining work`
      );
    } else if (forecast.neededAverage > 85) {
      riskFactors.push(
        `Need ${Math.round(forecast.neededAverage)}% average on remaining work`
      );
    }

    if (forecast.projectedFinal < forecast.targetGrade - 10) {
      riskFactors.push(
        `Projected grade (${forecast.projectedFinal}%) is ${Math.round(forecast.targetGrade - forecast.projectedFinal)}% below target`
      );
    }

    if (forecast.trend === 'declining') {
      riskFactors.push('Grades have been declining');
    }

    if (forecast.remainingWeight < 30 && forecast.riskLevel === 'at-risk') {
      riskFactors.push('Limited remaining weight to improve');
    }

    risks.push({
      courseId: course.id,
      courseCode: course.code,
      riskLevel: forecast.riskLevel,
      currentGrade: forecast.currentGrade,
      targetGrade: forecast.targetGrade,
      gapToTarget: forecast.targetGrade - forecast.projectedFinal,
      projectedFinal: forecast.projectedFinal,
      neededAverage: forecast.neededAverage,
      remainingWeight: forecast.remainingWeight,
      riskFactors,
    });
  }

  // Sort by risk level (at-risk first)
  const riskOrder: Record<CourseRisk['riskLevel'], number> = {
    'at-risk': 0,
    warning: 1,
    safe: 2,
  };
  risks.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

  return risks;
}

/**
 * Calculate GPA projection under different scenarios
 */
export function calculateGpaImpact(
  courses: CourseForForecast[],
  tasks: TaskForForecast[],
  existingGpa: number = 0,
  existingCredits: number = 0,
  creditsPerCourse: number = 0.5
): GpaProjection {
  // Project grades for each course
  const forecasts = courses.map((c) => forecastFinalGrade(tasks, c));

  const creditsInProgress = courses.length * creditsPerCourse;

  // Calculate projected GPA (using 4.0 scale conversion)
  const gradePoints = forecasts.reduce(
    (sum, f) => sum + gradeToGpaPoints(f.projectedFinal),
    0
  );
  const projectedGpa = gradePoints / courses.length;

  // Best case: assume 100% on remaining
  const bestCasePoints = forecasts.reduce((sum, f) => {
    const bestGrade = Math.min(100, f.currentGrade + f.remainingWeight);
    return sum + gradeToGpaPoints(bestGrade);
  }, 0);
  const bestCaseGpa = bestCasePoints / courses.length;

  // Worst case: assume 0% on remaining
  const worstCasePoints = forecasts.reduce((sum, f) => {
    const worstGrade = (f.currentGrade * (100 - f.remainingWeight)) / 100;
    return sum + gradeToGpaPoints(worstGrade);
  }, 0);
  const worstCaseGpa = worstCasePoints / courses.length;

  // Combine with existing GPA if provided
  let currentGpa = projectedGpa;
  if (existingCredits > 0) {
    const totalCredits = existingCredits + creditsInProgress;
    currentGpa =
      (existingGpa * existingCredits + projectedGpa * creditsInProgress) / totalCredits;
  }

  return {
    currentGpa: Math.round(currentGpa * 100) / 100,
    projectedGpa: Math.round(projectedGpa * 100) / 100,
    bestCaseGpa: Math.round(bestCaseGpa * 100) / 100,
    worstCaseGpa: Math.round(worstCaseGpa * 100) / 100,
    creditsCompleted: existingCredits,
    creditsInProgress,
  };
}

/**
 * Convert percentage grade to GPA points (4.0 scale)
 * Uses UofT-style conversion
 */
function gradeToGpaPoints(percentage: number): number {
  if (percentage >= 90) return 4.0;
  if (percentage >= 85) return 4.0;
  if (percentage >= 80) return 3.7;
  if (percentage >= 77) return 3.3;
  if (percentage >= 73) return 3.0;
  if (percentage >= 70) return 2.7;
  if (percentage >= 67) return 2.3;
  if (percentage >= 63) return 2.0;
  if (percentage >= 60) return 1.7;
  if (percentage >= 57) return 1.3;
  if (percentage >= 53) return 1.0;
  if (percentage >= 50) return 0.7;
  return 0.0;
}

/**
 * Calculate minimum grade needed on a specific task to reach course target
 */
export function calculateMinimumGradeNeeded(
  task: TaskForForecast,
  course: CourseForForecast,
  allTasks: TaskForForecast[]
): number | null {
  if (task.isCompleted || !task.weight) return null;

  const courseTasks = allTasks.filter((t) => t.courseId === course.id);
  const otherTasks = courseTasks.filter((t) => t.id !== task.id);

  // Calculate grade from other completed tasks
  const completedOthers = otherTasks.filter((t) => t.isCompleted && t.grade !== null);
  const completedWeight = completedOthers.reduce((sum, t) => sum + (t.weight ?? 0), 0);
  const completedGradeSum = completedOthers.reduce(
    (sum, t) => sum + (t.grade ?? 0) * (t.weight ?? 0),
    0
  );

  // Remaining tasks (excluding the target task)
  const remainingOthers = otherTasks.filter((t) => !t.isCompleted);
  const remainingWeight = remainingOthers.reduce((sum, t) => sum + (t.weight ?? 0), 0);

  // Assume average performance on other remaining tasks
  const avgOnCompleted = completedWeight > 0 ? completedGradeSum / completedWeight : 70;
  const projectedOtherRemaining = avgOnCompleted * remainingWeight;

  // Calculate needed grade on target task
  // target = (completed + projectedRemaining + (needed * taskWeight)) / totalWeight
  const totalWeight = completedWeight + remainingWeight + task.weight;
  const neededGrade =
    (course.targetGrade * totalWeight - completedGradeSum - projectedOtherRemaining) /
    task.weight;

  return Math.max(0, Math.min(100, Math.round(neededGrade * 10) / 10));
}

/**
 * Get grade forecast summary for all courses
 */
export function getGradeForecastSummary(
  tasks: TaskForForecast[],
  courses: CourseForForecast[]
): {
  forecasts: GradeForecast[];
  atRiskCount: number;
  warningCount: number;
  safeCount: number;
  avgCurrentGrade: number;
  avgProjectedGrade: number;
} {
  const forecasts = courses.map((c) => forecastFinalGrade(tasks, c));

  const atRiskCount = forecasts.filter((f) => f.riskLevel === 'at-risk').length;
  const warningCount = forecasts.filter((f) => f.riskLevel === 'warning').length;
  const safeCount = forecasts.filter((f) => f.riskLevel === 'safe').length;

  const avgCurrentGrade =
    forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + f.currentGrade, 0) / forecasts.length
      : 0;

  const avgProjectedGrade =
    forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + f.projectedFinal, 0) / forecasts.length
      : 0;

  return {
    forecasts,
    atRiskCount,
    warningCount,
    safeCount,
    avgCurrentGrade: Math.round(avgCurrentGrade * 10) / 10,
    avgProjectedGrade: Math.round(avgProjectedGrade * 10) / 10,
  };
}
