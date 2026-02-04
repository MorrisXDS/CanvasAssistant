/**
 * Layer 3 - Intelligence
 *
 * Domain services for grade calculation, data analysis, and content extraction.
 *
 * Features:
 * - Grade calculation service
 * - Data completeness analysis
 * - Submission status tracking
 * - Text extraction and rule-based parsing
 * - ML and LLM services (optional)
 */

// Domain Services (pure business logic)
export {
  // Constants
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
  // Grade Calculation
  GradeCalculationService,
  // Data Completeness
  analyzeCourseCompleteness,
  analyzeTaskCompleteness,
  generateDataCompletenessInsights,
  getDataCompletenessSummary,
  // Text Extraction
  extractTextFromHtml,
  extractTextFromFile,
  extractTextFromPdf,
  normalizeText,
  detectDocumentType,
  // Rule-Based Extraction
  extractDates,
  extractPercentages,
  extractPolicies,
  extractKeywords,
  extractAssignmentWeights,
  runRuleBasedExtraction,
  // Local ML Service
  LocalMLService,
  getLocalMLService,
  // LLM Service
  LLMService,
  getLLMService,
  // Submission Status Service
  getEffectiveSubmissionStatus,
  isEffectivelySubmitted,
  isEffectivelyGraded,
  getSubmissionStatusLabel,
  getSubmissionStatusBadgeVariant,
} from './domain';

export type {
  // Grade Calculation types
  GradeData,
  GradeCalculationResult,
  WhatIfScenario,
  WhatIfResult,
  GradeProjection,
  // Data Completeness types
  MissingFieldNotification,
  DataCompletenessSummary,
  // Text Extraction types
  TextExtractionResult,
  TextExtractionOptions,
  // Rule-Based Extraction types
  ExtractedDate,
  ExtractedPercentage,
  ExtractedPolicy,
  RuleBasedExtractionResult,
  // Local ML types
  DocumentClassification,
  NamedEntity,
  TextEmbedding,
  LocalMLResult,
  LocalMLConfig,
  // LLM types
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMServiceConfig,
  // Submission Status types
  SubmissionStatus,
} from './domain';
