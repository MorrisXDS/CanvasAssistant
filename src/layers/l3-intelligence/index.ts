/**
 * Layer 3 - Intelligence
 *
 * Priority calculation and task ranking system.
 *
 * Features:
 * - Multi-factor priority scoring
 * - Policy-aware adjustments (grace tokens, late penalties, drops)
 * - Dependency resolution for sequential progress
 * - Grade impact analysis
 * - Explainable rankings with detailed breakdowns
 * - Hierarchical refresh scheduling
 * - Submission window calculations
 * - Pure domain services for business logic
 */

export { PriorityConfig, DEFAULT_CONFIG } from './PriorityConfig';
export type { PriorityConfigData, FactorWeights, UrgencyCurve, RefreshTier } from './PriorityConfig';

export { PriorityEngine } from './PriorityEngine';

export { PolicyEvaluator } from './PolicyEvaluator';
export type { PolicyEvaluationResult } from './PolicyEvaluator';

// PolicyEngine is deprecated - types are now in l1-persistence/repositories/PolicyRepository
// and domain logic is in domain/PolicyEvaluator and domain/GraceTokenService

export { DependencyResolver } from './DependencyResolver';
export type { DependencyResult } from './DependencyResolver';

export { RefreshScheduler } from './RefreshScheduler';
export type { RefreshStats } from './RefreshScheduler';

// Domain Services (pure business logic)
export {
  GradeCalculationService,
  GraceTokenService,
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
} from './domain';

export type {
  GradeData,
  GradeCalculationResult,
  WhatIfScenario,
  WhatIfResult,
  GradeProjection,
  TokenCheckResult,
  TokenApplicationResult,
  TokenStatus,
} from './domain';

// Orchestration (coordinates domain + DB)
export { PriorityOrchestrator } from './orchestration';
export type { PriorityOrchestratorConfig } from './orchestration';

export * from './types';
