/**
 * Domain Services - Pure Business Logic
 *
 * These services contain pure business logic with no database access or side effects.
 * They operate on data structures and return calculated results.
 */

export { GradeCalculationService } from './GradeCalculationService';
export type {
  GradeData,
  GradeCalculationResult,
  WhatIfScenario,
  WhatIfResult,
  GradeProjection,
} from './GradeCalculationService';

export { GraceTokenService } from './GraceTokenService';
export type {
  TokenCheckResult,
  TokenApplicationResult,
  TokenStatus,
} from './GraceTokenService';

export {
  calculatePriority,
  calculateUrgencyScore,
  calculateWeightScore,
  calculateCourseGapFactor,
  calculateLockTimeUrgency,
  calculateGraceTokenFactor,
  calculateSubmissionFactor,
  calculatePolicyAdjustment,
  calculateTaskTypeBoost,
  calculateAllFactors,
  calculateFinalScore,
  assignQueue,
} from './PriorityCalculator';
