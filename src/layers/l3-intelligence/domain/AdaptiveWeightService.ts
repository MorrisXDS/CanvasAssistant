/**
 * AdaptiveWeightService - Pure Domain Functions for Adaptive Priority Learning
 *
 * This module contains ONLY pure functions with no database access.
 * All data must be passed in through function parameters.
 *
 * Learns from task completion outcomes to adjust priority factor weights
 * for more accurate future predictions.
 */

import {
  LearningInput,
  LearningOutcome,
  WeightAdjustment,
  AdaptiveWeights,
  PriorityFactors,
} from '../types';

/**
 * Minimum sample size required before adjusting weights
 */
const MIN_SAMPLE_SIZE = 10;

/**
 * Maximum weight multiplier adjustment (prevents extreme values)
 */
const MAX_MULTIPLIER = 2.0;
const MIN_MULTIPLIER = 0.5;

/**
 * Factor names that can be adjusted
 */
const ADJUSTABLE_FACTORS: (keyof PriorityFactors)[] = [
  'urgency',
  'weight',
  'courseGap',
  'taskTypeBoost',
  'lockTimeUrgency',
  'graceTokenFactor',
];

/**
 * Outcome scores for learning (higher = better outcome)
 */
const OUTCOME_SCORES: Record<LearningOutcome, number> = {
  completed_early: 1.0,
  completed_ontime: 0.8,
  completed_late: 0.3,
  missed: 0.0,
};

/**
 * Calculate correlation between a factor and outcomes
 * Returns -1 to 1 where positive = factor helps predict good outcomes
 */
function calculateCorrelation(
  inputs: LearningInput[],
  factorName: keyof PriorityFactors
): number {
  if (inputs.length < MIN_SAMPLE_SIZE) return 0;

  // Get factor values and outcome scores
  const factorValues = inputs.map((i) => i.factors[factorName]);
  const outcomeValues = inputs.map((i) => OUTCOME_SCORES[i.outcome]);

  // Calculate means
  const meanFactor = factorValues.reduce((a, b) => a + b, 0) / factorValues.length;
  const meanOutcome = outcomeValues.reduce((a, b) => a + b, 0) / outcomeValues.length;

  // Calculate correlation
  let numerator = 0;
  let denomFactorSq = 0;
  let denomOutcomeSq = 0;

  for (let i = 0; i < inputs.length; i++) {
    const factorDiff = factorValues[i] - meanFactor;
    const outcomeDiff = outcomeValues[i] - meanOutcome;
    numerator += factorDiff * outcomeDiff;
    denomFactorSq += factorDiff * factorDiff;
    denomOutcomeSq += outcomeDiff * outcomeDiff;
  }

  const denominator = Math.sqrt(denomFactorSq * denomOutcomeSq);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * Calculate adaptive weight multiplier for a factor
 */
function calculateMultiplier(correlation: number, sampleSize: number): number {
  // Adjust confidence based on sample size
  const confidence = Math.min(1, sampleSize / 50);

  // Convert correlation to multiplier
  // Positive correlation: increase weight (up to 2x)
  // Negative correlation: decrease weight (down to 0.5x)
  const rawMultiplier = 1 + correlation * confidence;

  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, rawMultiplier));
}

/**
 * Calculate adaptive weights from learning inputs
 * Groups by course and task type for granular adjustments
 */
export function calculateAdaptiveWeights(
  inputs: LearningInput[],
  minSampleSize: number = MIN_SAMPLE_SIZE
): WeightAdjustment[] {
  const adjustments: WeightAdjustment[] = [];

  // Global adjustments (all inputs)
  if (inputs.length >= minSampleSize) {
    for (const factor of ADJUSTABLE_FACTORS) {
      const correlation = calculateCorrelation(inputs, factor);
      const multiplier = calculateMultiplier(correlation, inputs.length);

      if (Math.abs(multiplier - 1) >= 0.1) {
        // Only record significant adjustments
        adjustments.push({
          factorName: factor,
          courseId: null,
          taskType: null,
          weightMultiplier: multiplier,
          adjustmentReason: `Global: ${correlation > 0 ? 'positive' : 'negative'} correlation with outcomes`,
          sampleSize: inputs.length,
          lastUpdatedAt: new Date(),
        });
      }
    }
  }

  // Per-course adjustments
  const courseInputs: Map<number, LearningInput[]> = new Map();
  for (const input of inputs) {
    const existing = courseInputs.get(input.courseId) || [];
    existing.push(input);
    courseInputs.set(input.courseId, existing);
  }

  for (const [courseId, courseData] of courseInputs) {
    if (courseData.length < minSampleSize) continue;

    for (const factor of ADJUSTABLE_FACTORS) {
      const correlation = calculateCorrelation(courseData, factor);
      const multiplier = calculateMultiplier(correlation, courseData.length);

      if (Math.abs(multiplier - 1) >= 0.15) {
        // Higher threshold for course-specific
        adjustments.push({
          factorName: factor,
          courseId,
          taskType: null,
          weightMultiplier: multiplier,
          adjustmentReason: `Course-specific: ${correlation > 0 ? 'positive' : 'negative'} correlation`,
          sampleSize: courseData.length,
          lastUpdatedAt: new Date(),
        });
      }
    }
  }

  // Per-task-type adjustments
  const typeInputs: Map<string, LearningInput[]> = new Map();
  for (const input of inputs) {
    const existing = typeInputs.get(input.taskType) || [];
    existing.push(input);
    typeInputs.set(input.taskType, existing);
  }

  for (const [taskType, typeData] of typeInputs) {
    if (typeData.length < minSampleSize) continue;

    for (const factor of ADJUSTABLE_FACTORS) {
      const correlation = calculateCorrelation(typeData, factor);
      const multiplier = calculateMultiplier(correlation, typeData.length);

      if (Math.abs(multiplier - 1) >= 0.15) {
        adjustments.push({
          factorName: factor,
          courseId: null,
          taskType,
          weightMultiplier: multiplier,
          adjustmentReason: `Task-type specific: ${correlation > 0 ? 'positive' : 'negative'} correlation`,
          sampleSize: typeData.length,
          lastUpdatedAt: new Date(),
        });
      }
    }
  }

  return adjustments;
}

/**
 * Apply adaptive weights to base priority factors
 */
export function applyAdaptiveWeights(
  baseFactors: PriorityFactors,
  adjustments: WeightAdjustment[],
  courseId: number,
  taskType: string
): PriorityFactors {
  // Start with copy of base factors
  const adjusted = { ...baseFactors };

  // Apply adjustments in order of specificity: global -> course -> taskType
  const orderedAdjustments = [...adjustments].sort((a, b) => {
    const specificityA = (a.courseId ? 1 : 0) + (a.taskType ? 1 : 0);
    const specificityB = (b.courseId ? 1 : 0) + (b.taskType ? 1 : 0);
    return specificityA - specificityB;
  });

  for (const adjustment of orderedAdjustments) {
    // Check if adjustment applies
    if (adjustment.courseId !== null && adjustment.courseId !== courseId) continue;
    if (adjustment.taskType !== null && adjustment.taskType !== taskType) continue;

    // Apply multiplier to the factor
    const factorName = adjustment.factorName as keyof PriorityFactors;
    if (factorName in adjusted) {
      adjusted[factorName] *= adjustment.weightMultiplier;
    }
  }

  return adjusted;
}

/**
 * Detect weight drift - when learned weights diverge significantly from baseline
 */
export function detectWeightDrift(
  recentInputs: LearningInput[],
  windowSize: number = 20
): {
  factorName: string;
  driftDirection: 'increasing' | 'decreasing';
  driftMagnitude: number;
}[] {
  if (recentInputs.length < windowSize * 2) return [];

  const drifts: Array<{
    factorName: string;
    driftDirection: 'increasing' | 'decreasing';
    driftMagnitude: number;
  }> = [];

  // Compare recent window to earlier window
  const recent = recentInputs.slice(-windowSize);
  const earlier = recentInputs.slice(-windowSize * 2, -windowSize);

  for (const factor of ADJUSTABLE_FACTORS) {
    const recentCorr = calculateCorrelation(recent, factor);
    const earlierCorr = calculateCorrelation(earlier, factor);

    const drift = recentCorr - earlierCorr;

    if (Math.abs(drift) >= 0.2) {
      // Significant drift
      drifts.push({
        factorName: factor,
        driftDirection: drift > 0 ? 'increasing' : 'decreasing',
        driftMagnitude: Math.abs(drift),
      });
    }
  }

  return drifts;
}

/**
 * Build full adaptive weights configuration
 */
export function buildAdaptiveWeights(
  inputs: LearningInput[],
  minSampleSize: number = MIN_SAMPLE_SIZE
): AdaptiveWeights {
  const adjustments = calculateAdaptiveWeights(inputs, minSampleSize);

  // Calculate global multipliers
  const globalMultipliers: Record<string, number> = {};
  const globalAdjustments = adjustments.filter(
    (a) => a.courseId === null && a.taskType === null
  );

  for (const adj of globalAdjustments) {
    globalMultipliers[adj.factorName] = adj.weightMultiplier;
  }

  // Default base weights (normalized to 1)
  const baseWeights: PriorityFactors = {
    urgency: 1,
    weight: 1,
    courseGap: 1,
    policyAdjustment: 1,
    dependency: 1,
    taskTypeBoost: 1,
    lockTimeUrgency: 1,
    graceTokenFactor: 1,
    submissionFactor: 1,
  };

  return {
    baseWeights,
    adjustments,
    globalMultipliers,
  };
}

/**
 * Get adjustment summary for display
 */
export function getAdjustmentSummary(adjustments: WeightAdjustment[]): string[] {
  const summaries: string[] = [];

  const globalAdj = adjustments.filter((a) => a.courseId === null && a.taskType === null);
  const courseAdj = adjustments.filter((a) => a.courseId !== null);
  const typeAdj = adjustments.filter((a) => a.taskType !== null && a.courseId === null);

  if (globalAdj.length > 0) {
    const increased = globalAdj
      .filter((a) => a.weightMultiplier > 1)
      .map((a) => a.factorName);
    const decreased = globalAdj
      .filter((a) => a.weightMultiplier < 1)
      .map((a) => a.factorName);

    if (increased.length > 0) {
      summaries.push(`Increased importance: ${increased.join(', ')}`);
    }
    if (decreased.length > 0) {
      summaries.push(`Decreased importance: ${decreased.join(', ')}`);
    }
  }

  if (courseAdj.length > 0) {
    summaries.push(`${courseAdj.length} course-specific adjustments`);
  }

  if (typeAdj.length > 0) {
    summaries.push(`${typeAdj.length} task-type-specific adjustments`);
  }

  return summaries;
}

/**
 * Determine outcome from completion event
 */
export function determineOutcome(
  wasLate: boolean,
  daysBeforeDue: number | null
): LearningOutcome {
  if (wasLate) {
    return daysBeforeDue !== null && daysBeforeDue < -7 ? 'missed' : 'completed_late';
  }

  if (daysBeforeDue !== null && daysBeforeDue >= 1) {
    return 'completed_early';
  }

  return 'completed_ontime';
}

/**
 * Create learning input from completion event
 */
export function createLearningInput(
  taskId: number,
  courseId: number,
  taskType: string,
  priorityScore: number,
  factors: PriorityFactors,
  wasLate: boolean,
  daysBeforeDue: number | null
): LearningInput {
  return {
    taskId,
    courseId,
    taskType,
    priorityScore,
    factors,
    outcome: determineOutcome(wasLate, daysBeforeDue),
    daysFromDeadline: daysBeforeDue ?? 0,
  };
}
