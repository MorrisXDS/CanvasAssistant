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
export type {
  PriorityConfigData,
  FactorWeights,
  UrgencyCurve,
  RefreshTier,
} from './PriorityConfig';

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
  // Grade Calculation
  GradeCalculationService,
  GraceTokenService,
  // Priority Calculator
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
  // Behavior Analytics
  analyzeWeeklyRhythm,
  calculateCourseDifficulty,
  identifyStrugglePatterns,
  predictOptimalWorkTime,
  getProductivityScore,
  analyzeCompletionTiming,
  // Effort Estimation
  DEFAULT_EFFORT_MINUTES,
  getDefaultEffort,
  calculatePointsBasedEffort,
  calculateHistoricalAverage,
  calculateCourseMultiplier,
  estimateEffort,
  batchEstimateEffort,
  calibrateEstimates,
  calculateAccuracyMetrics,
  formatEffortEstimate,
  getEffortLevel,
  // Workload Analysis
  calculateClusteringScore,
  analyzeWorkloadDistribution,
  suggestRedistribution,
  detectNeglectedCourses,
  calculateCourseBalanceScore,
  getDailyWorkloadSummary,
  identifyDeadlineClusters,
  // Recommendation Engine
  generateWorkNowRecommendation,
  generateStartEarlyRecommendation,
  generateBreakRecommendation,
  generateCourseFocusRecommendation,
  generateAllRecommendations,
  isRecommendationValid,
  getActiveRecommendations,
  // Insight Generator
  generateDeadlinePatternInsight,
  generateCourseStruggleInsight,
  generateProductivityWindowInsight,
  generateWorkloadWarningInsight,
  generateStreakInsight,
  generateImprovementInsight,
  generateAllInsights,
  isInsightValid,
  getActiveInsights,
  getInsightIcon,
  getSeverityColor,
  // Adaptive Weight Service
  calculateAdaptiveWeights,
  applyAdaptiveWeights,
  detectWeightDrift,
  buildAdaptiveWeights,
  getAdjustmentSummary,
  determineOutcome,
  createLearningInput,
  // Submission Status Service
  getEffectiveSubmissionStatus,
  isEffectivelySubmitted,
  isEffectivelyGraded,
  getSubmissionStatusLabel,
  getSubmissionStatusBadgeVariant,
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
  SubmissionStatus,
} from './domain';

// Orchestration (coordinates domain + DB)
export {
  PriorityOrchestrator,
  BehaviorTrackingOrchestrator,
  WorkloadOrchestrator,
  RecommendationOrchestrator,
  InsightOrchestrator,
  AdaptiveLearningOrchestrator,
} from './orchestration';

export type {
  PriorityOrchestratorConfig,
  BehaviorTrackingOrchestratorConfig,
  WorkloadOrchestratorConfig,
  RecommendationOrchestratorConfig,
  InsightOrchestratorConfig,
  AdaptiveLearningOrchestratorConfig,
} from './orchestration';

export * from './types';
