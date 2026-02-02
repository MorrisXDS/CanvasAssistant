/**
 * EffortEstimator - Pure Domain Functions for Task Effort Estimation
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Predicts time required to complete tasks based on task type,
 * historical data, and course-specific patterns.
 */

import {
  EffortEstimate,
  EffortEstimationContext,
  EffortCalibrationInput,
  TaskForPriority,
  TaskCompletionEvent,
} from '../types';
import {
  DEFAULT_EFFORT_MINUTES,
  MINUTES_PER_POINT,
  EFFORT_THRESHOLDS,
} from './Constants';

// Re-export for backwards compatibility
export { DEFAULT_EFFORT_MINUTES };

/**
 * Get default effort estimate for a task type
 */
export function getDefaultEffort(taskType: string): number {
  const normalizedType = taskType?.toLowerCase() || 'other';
  return DEFAULT_EFFORT_MINUTES[normalizedType] ?? DEFAULT_EFFORT_MINUTES.other;
}

/**
 * Calculate effort estimate based on points possible
 */
export function calculatePointsBasedEffort(
  taskType: string,
  pointsPossible: number | null
): number {
  if (pointsPossible === null || pointsPossible <= 0) {
    return getDefaultEffort(taskType);
  }

  const normalizedType = taskType?.toLowerCase() || 'other';
  const minutesPerPoint = MINUTES_PER_POINT[normalizedType] ?? MINUTES_PER_POINT.other;

  // Calculate based on points, but clamp to reasonable bounds
  const calculated = pointsPossible * minutesPerPoint;
  const defaultMinutes = getDefaultEffort(taskType);

  // Allow 0.5x to 3x the default estimate
  return Math.max(defaultMinutes * 0.5, Math.min(defaultMinutes * 3, calculated));
}

/**
 * Calculate historical average effort for a task type in a course
 */
export function calculateHistoricalAverage(
  taskType: string,
  courseId: number,
  events: TaskCompletionEvent[]
): { average: number; sampleSize: number } | null {
  const relevantEvents = events.filter(
    (e) =>
      e.taskType === taskType &&
      e.courseId === courseId &&
      e.timeToCompleteMinutes !== null &&
      e.timeToCompleteMinutes > 0
  );

  if (relevantEvents.length < 3) {
    // Not enough data - fall back to all events of this type
    const typeEvents = events.filter(
      (e) =>
        e.taskType === taskType &&
        e.timeToCompleteMinutes !== null &&
        e.timeToCompleteMinutes > 0
    );

    if (typeEvents.length < 2) {
      return null;
    }

    const total = typeEvents.reduce((sum, e) => sum + (e.timeToCompleteMinutes || 0), 0);
    return {
      average: total / typeEvents.length,
      sampleSize: typeEvents.length,
    };
  }

  const total = relevantEvents.reduce(
    (sum, e) => sum + (e.timeToCompleteMinutes || 0),
    0
  );
  return {
    average: total / relevantEvents.length,
    sampleSize: relevantEvents.length,
  };
}

/**
 * Calculate course difficulty multiplier
 * Based on historical performance in the course
 */
export function calculateCourseMultiplier(
  courseId: number,
  events: TaskCompletionEvent[]
): number {
  const courseEvents = events.filter(
    (e) => e.courseId === courseId && e.timeToCompleteMinutes !== null
  );

  if (courseEvents.length < 5) {
    return 1.0; // Not enough data
  }

  // Calculate average time vs expected time
  let totalRatio = 0;
  let count = 0;

  for (const event of courseEvents) {
    if (event.timeToCompleteMinutes === null) continue;
    const expected = getDefaultEffort(event.taskType);
    const ratio = event.timeToCompleteMinutes / expected;
    totalRatio += ratio;
    count++;
  }

  if (count === 0) return 1.0;

  // Clamp to 0.5 - 2.0 range
  const avgRatio = totalRatio / count;
  return Math.max(0.5, Math.min(2.0, avgRatio));
}

/**
 * Estimate effort for a single task
 * Uses hybrid method combining default, points-based, and historical data
 */
export function estimateEffort(
  task: TaskForPriority,
  events: TaskCompletionEvent[],
  courseMultipliers: Map<number, number> = new Map()
): EffortEstimate {
  const taskType = task.taskType || 'other';
  const courseId = task.courseId;

  // Get base estimates
  const defaultEstimate = getDefaultEffort(taskType);
  const pointsEstimate = calculatePointsBasedEffort(taskType, task.pointsPossible);
  const historicalData = calculateHistoricalAverage(taskType, courseId, events);

  // Get course multiplier
  let courseMultiplier = courseMultipliers.get(courseId);
  if (courseMultiplier === undefined) {
    courseMultiplier = calculateCourseMultiplier(courseId, events);
  }

  // Determine estimation method and calculate
  let estimatedMinutes: number;
  let method: EffortEstimate['estimationMethod'];
  let confidence: number;

  if (historicalData && historicalData.sampleSize >= 5) {
    // High confidence: use historical with adjustments
    method = 'calibrated';
    estimatedMinutes = historicalData.average * courseMultiplier;
    confidence = Math.min(0.9, 0.5 + historicalData.sampleSize * 0.05);
  } else if (historicalData && historicalData.sampleSize >= 2) {
    // Medium confidence: blend historical and points-based
    method = 'hybrid';
    const historicalWeight = historicalData.sampleSize / 5;
    estimatedMinutes =
      historicalData.average * historicalWeight + pointsEstimate * (1 - historicalWeight);
    estimatedMinutes *= courseMultiplier;
    confidence = 0.3 + historicalData.sampleSize * 0.1;
  } else if (task.pointsPossible && task.pointsPossible > 0) {
    // Low confidence: use points-based
    method = 'historical';
    estimatedMinutes = pointsEstimate * courseMultiplier;
    confidence = 0.4;
  } else {
    // Fallback: use defaults
    method = 'default';
    estimatedMinutes = defaultEstimate * courseMultiplier;
    confidence = 0.3;
  }

  // Round to nearest 5 minutes
  estimatedMinutes = Math.round(estimatedMinutes / 5) * 5;

  return {
    taskId: task.id,
    courseId,
    taskType,
    pointsPossible: task.pointsPossible,
    estimatedMinutes,
    actualMinutes: null,
    estimationMethod: method,
    confidence,
  };
}

/**
 * Batch estimate effort for multiple tasks
 */
export function batchEstimateEffort(
  tasks: TaskForPriority[],
  events: TaskCompletionEvent[]
): EffortEstimate[] {
  // Pre-calculate course multipliers
  const courseIds = [...new Set(tasks.map((t) => t.courseId))];
  const courseMultipliers = new Map<number, number>();

  for (const courseId of courseIds) {
    courseMultipliers.set(courseId, calculateCourseMultiplier(courseId, events));
  }

  return tasks.map((task) => estimateEffort(task, events, courseMultipliers));
}

/**
 * Calibrate estimates using actual completion data
 * Returns improved multipliers for future estimates
 */
export function calibrateEstimates(
  calibrationData: EffortCalibrationInput[]
): Map<string, number> {
  // Group by task type
  const typeData: Map<string, { estimated: number; actual: number }[]> = new Map();

  for (const data of calibrationData) {
    const existing = typeData.get(data.taskType) || [];
    existing.push({
      estimated: data.estimatedMinutes,
      actual: data.actualMinutes,
    });
    typeData.set(data.taskType, existing);
  }

  // Calculate calibration multipliers
  const multipliers = new Map<string, number>();

  for (const [taskType, entries] of typeData) {
    if (entries.length < 3) continue;

    const totalRatio = entries.reduce((sum, e) => sum + e.actual / e.estimated, 0);
    const avgRatio = totalRatio / entries.length;

    // Clamp to reasonable range
    multipliers.set(taskType, Math.max(0.5, Math.min(2.0, avgRatio)));
  }

  return multipliers;
}

/**
 * Calculate estimation accuracy metrics
 */
export function calculateAccuracyMetrics(calibrationData: EffortCalibrationInput[]): {
  meanAbsoluteError: number;
  meanPercentageError: number;
  underestimateRate: number;
  overestimateRate: number;
  accurateRate: number; // Within 20%
} {
  if (calibrationData.length === 0) {
    return {
      meanAbsoluteError: 0,
      meanPercentageError: 0,
      underestimateRate: 0,
      overestimateRate: 0,
      accurateRate: 1,
    };
  }

  let totalAbsError = 0;
  let totalPercentError = 0;
  let underCount = 0;
  let overCount = 0;
  let accurateCount = 0;

  for (const data of calibrationData) {
    const error = data.actualMinutes - data.estimatedMinutes;
    const percentError = Math.abs(error) / data.actualMinutes;

    totalAbsError += Math.abs(error);
    totalPercentError += percentError;

    if (percentError <= 0.2) {
      accurateCount++;
    } else if (error > 0) {
      underCount++; // Underestimated
    } else {
      overCount++; // Overestimated
    }
  }

  const count = calibrationData.length;

  return {
    meanAbsoluteError: totalAbsError / count,
    meanPercentageError: (totalPercentError / count) * 100,
    underestimateRate: (underCount / count) * 100,
    overestimateRate: (overCount / count) * 100,
    accurateRate: (accurateCount / count) * 100,
  };
}

/**
 * Format effort estimate for display
 */
export function formatEffortEstimate(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Get effort level category
 */
export function getEffortLevel(
  minutes: number
): 'quick' | 'short' | 'medium' | 'long' | 'extended' {
  if (minutes <= 15) return 'quick';
  if (minutes <= 45) return 'short';
  if (minutes <= 120) return 'medium';
  if (minutes <= 240) return 'long';
  return 'extended';
}
