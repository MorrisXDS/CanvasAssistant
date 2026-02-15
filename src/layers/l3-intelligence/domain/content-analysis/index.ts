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
