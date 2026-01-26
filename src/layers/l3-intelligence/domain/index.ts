/**
 * Domain Services - Pure Business Logic
 *
 * These services contain pure business logic with no database access or side effects.
 * They operate on data structures and return calculated results.
 */

// Centralized constants (single source of truth)
export {
  HOURS,
  MS,
  DAY_NAMES,
  DEFAULT_EFFORT_MINUTES,
  MINUTES_PER_POINT,
  EFFORT_THRESHOLDS,
  WORKLOAD_THRESHOLDS,
  WEIGHT_THRESHOLDS,
  INSIGHT_THRESHOLDS,
  INSIGHT_EXPIRATION,
  RECOMMENDATION_THRESHOLDS,
  RECOMMENDATION_VALIDITY,
  BEHAVIOR_THRESHOLDS,
  HIGH_VALUE_TASK_TYPES,
  HIGH_PRIORITY_TASK_TYPES,
  ORCHESTRATOR_DEFAULTS,
  GRADE_THRESHOLDS,
} from './Constants';

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
  analyzeSubmissionPatterns,
  assessDeadlineRisk,
  identifySubmissionPatterns,
} from './BehaviorAnalytics';
export type {
  SubmissionTimingPattern,
  DeadlineRiskAssessment,
} from './BehaviorAnalytics';

// Effort Estimation
export {
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

// Message Frequency Configuration (centralized frequency settings)
export {
  RECOMMENDATION_FREQUENCY,
  INSIGHT_FREQUENCY,
  DEFAULT_FREQUENCY_SETTINGS,
  getRecommendationFrequency,
  getInsightFrequency,
  getFrequencySettings,
} from './MessageFrequencyConfig';
export type { MessageFrequencySettings } from './MessageFrequencyConfig';

// Text Extraction (Layer 1 Content Analysis)
export {
  extractTextFromHtml,
  extractTextFromFile,
  extractTextFromPdf,
  normalizeText,
  detectDocumentType,
} from './TextExtractor';
export type {
  TextExtractionResult,
  TextExtractionOptions,
} from './TextExtractor';

// Rule-Based Extraction (Layer 2 Content Analysis)
export {
  extractDates,
  extractPercentages,
  extractPolicies,
  extractKeywords,
  extractAssignmentWeights,
  runRuleBasedExtraction,
} from './RuleBasedExtractor';
export type {
  ExtractedDate,
  ExtractedPercentage,
  ExtractedPolicy,
  RuleBasedExtractionResult,
} from './RuleBasedExtractor';

// Grade Forecasting Service
export {
  forecastFinalGrade,
  analyzeTrend,
  detectAtRiskCourses,
  calculateGpaImpact,
  calculateMinimumGradeNeeded,
  getGradeForecastSummary,
} from './GradeForecastingService';
export type {
  GradeForecast,
  CourseRisk,
  GpaProjection,
  TaskForForecast,
  CourseForForecast,
  GradeHistoryEntry,
} from './GradeForecastingService';

// Workload Prediction Service
export {
  forecastWeeklyWorkload,
  detectCrunchPeriods,
  suggestPreemptiveActions,
  calculateWorkloadBalance,
} from './WorkloadPredictionService';
export type {
  WorkloadForecast,
  WorkloadTask,
  CrunchPeriod,
  PreemptiveAction,
} from './WorkloadPredictionService';

// Extended InsightGenerator exports
// Note: study_effectiveness and procrastination_warning removed as unfounded
export {
  generateGradeAtRiskInsight,
  generateGradeTrendInsight,
  generateCrunchPeriodInsight,
} from './InsightGenerator';
export type {
  GradeForecastForInsight,
  CrunchPeriodForInsight,
} from './InsightGenerator';

// Extended RecommendationEngine exports
// Note: procrastination_nudge and study_strategy removed as unfounded
export {
  generatePreemptiveStartRec,
  generateFocusAtRiskRec,
} from './RecommendationEngine';
export type {
  GradeForecastForRec,
  WorkloadForecastForRec,
} from './RecommendationEngine';

// Local ML Service (Layer 3 Content Analysis - Optional)
export { LocalMLService, getLocalMLService } from './LocalMLService';
export type {
  DocumentClassification,
  NamedEntity,
  TextEmbedding,
  LocalMLResult,
  LocalMLConfig,
} from './LocalMLService';

// LLM Service (Layer 4 Content Analysis - Optional)
export { LLMService, getLLMService } from './LLMService';
export type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMServiceConfig,
} from './LLMService';
