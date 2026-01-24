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

// Behavior Analytics
export {
  analyzeWeeklyRhythm,
  calculateCourseDifficulty,
  identifyStrugglePatterns,
  predictOptimalWorkTime,
  getProductivityScore,
  analyzeCompletionTiming,
} from './BehaviorAnalytics';

// Effort Estimation
export {
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
} from './EffortEstimator';

// Workload Analysis
export {
  calculateClusteringScore,
  analyzeWorkloadDistribution,
  suggestRedistribution,
  detectNeglectedCourses,
  calculateCourseBalanceScore,
  getDailyWorkloadSummary,
  identifyDeadlineClusters,
} from './WorkloadAnalyzer';

// Recommendation Engine
export {
  generateWorkNowRecommendation,
  generateStartEarlyRecommendation,
  generateBreakRecommendation,
  generateCourseFocusRecommendation,
  generateAllRecommendations,
  isRecommendationValid,
  getActiveRecommendations,
} from './RecommendationEngine';

// Insight Generator
export {
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
} from './InsightGenerator';

// Adaptive Weight Service
export {
  calculateAdaptiveWeights,
  applyAdaptiveWeights,
  detectWeightDrift,
  buildAdaptiveWeights,
  getAdjustmentSummary,
  determineOutcome,
  createLearningInput,
} from './AdaptiveWeightService';

// Data Completeness Analyzer
export {
  analyzeCourseCompleteness,
  analyzeTaskCompleteness,
  generateDataCompletenessInsights,
  getDataCompletenessSummary,
} from './DataCompletenessAnalyzer';
export type {
  MissingFieldNotification,
  DataCompletenessSummary,
} from './DataCompletenessAnalyzer';

// Message Probation Service (duplicate prevention)
export { MessageProbationService } from './MessageProbationService';
export type { MessageProbationConfig } from './MessageProbationService';
