/**
 * Domain Services - Pure Business Logic
 *
 * These services contain pure business logic with no database access or side effects.
 * They operate on data structures and return calculated results.
 */

// Grade Calculation
export { GradeCalculationService } from './grades';
export type {
  GradeData,
  GradeCalculationResult,
  WhatIfScenario,
  WhatIfResult,
  GradeProjection,
} from './grades';

// Data Completeness Analyzer
export {
  analyzeCourseCompleteness,
  analyzeTaskCompleteness,
  generateDataCompletenessInsights,
  getDataCompletenessSummary,
} from './data-quality';
export type { MissingFieldNotification, DataCompletenessSummary } from './data-quality';

// Content Analysis Pipeline
export {
  // Text Extraction (Layer 1)
  extractTextFromHtml,
  extractTextFromFile,
  extractTextFromPdf,
  normalizeText,
  detectDocumentType,
  // Rule-Based Extraction (Layer 2)
  extractDates,
  extractPercentages,
  extractPolicies,
  extractKeywords,
  extractAssignmentWeights,
  runRuleBasedExtraction,
  // Local ML Service (Layer 3 - Optional)
  LocalMLService,
  getLocalMLService,
  // LLM Service (Layer 4 - Optional)
  LLMService,
  getLLMService,
} from './content-analysis';
export type {
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
} from './content-analysis';

// Submission Status Service
export {
  getEffectiveSubmissionStatus,
  isEffectivelySubmitted,
  isEffectivelyGraded,
  getSubmissionStatusLabel,
  getSubmissionStatusBadgeVariant,
} from './submission';
export type { SubmissionStatus } from './submission';
