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

// Text Extraction (Layer 1 Content Analysis)
export {
  extractTextFromHtml,
  extractTextFromFile,
  extractTextFromPdf,
  normalizeText,
  detectDocumentType,
} from './TextExtractor';
export type { TextExtractionResult, TextExtractionOptions } from './TextExtractor';

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

// Submission Status Service (OR logic for submission tracking)
export {
  getEffectiveSubmissionStatus,
  isEffectivelySubmitted,
  isEffectivelyGraded,
  getSubmissionStatusLabel,
  getSubmissionStatusBadgeVariant,
} from './SubmissionStatusService';
export type { SubmissionStatus } from './SubmissionStatusService';
