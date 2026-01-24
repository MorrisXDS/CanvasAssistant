/**
 * Layer 2 - Daemon (Sync Engine)
 *
 * Canvas API client with adaptive sync capabilities.
 *
 * Features:
 * - Rate-limited HTTP client (max 3 concurrent)
 * - ETag-based conditional GET for efficiency
 * - Exponential backoff on 429 errors
 * - Automatic pagination handling
 * - Course, task, notification sync
 * - Syllabus and page content sync
 * - Policy-related announcement detection
 */

export { CanvasClient, CanvasClientConfig, CanvasUser, CanvasApiError } from './CanvasClient';
export { RateLimiter, RateLimiterConfig, RateLimitStatus } from './RateLimiter';
export { SyncEngine, SyncEngineConfig, SyncResult, FullSyncResult, SyncDiagnosticEntry } from './SyncEngine';
export {
  SyncConflictResolver,
  type SyncConflict,
  type ConflictResolution,
  type SyncPreference,
} from './SyncConflictResolver';
export {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitState,
  type CircuitStatus,
  type CircuitBreakerOptions,
} from './CircuitBreaker';
export {
  InputValidator,
  Schemas,
  type InputValidatorOptions,
  type ValidationResult,
  type ValidationStrictness,
  type HtmlHandling,
  type CanvasCourse,
  type CanvasAssignment,
  type CanvasSubmission,
  type CanvasAnnouncement,
  type CanvasAssignmentGroup,
} from './InputValidator';
export * from './DataMappers';
export {
  ICSParser,
  type ParsedICSEvent,
  type ICSParserResult,
  type ICSImportPreview,
} from './ICSParser';
export {
  RRuleExpander,
  type CalendarEventRecord,
  type ExpandedEvent,
} from './RRuleExpander';
export {
  ResilienceWrapper,
  type ResilienceWrapperConfig,
  type ResilienceStatus,
} from './ResilienceWrapper';
export {
  HtmlFileExtractor,
  extractCanvasFileIds,
  extractCanvasFileReferences,
  type ExtractedFileReference,
  type HtmlFileExtractorConfig,
} from './HtmlFileExtractor';
export {
  HtmlContentSync,
  type HtmlContentSyncOptions,
  type HtmlContentSyncResult,
  type HtmlContentItem,
  type ExtractedResource,
} from './HtmlContentSync';
