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

export {
  CanvasClient,
  CanvasClientConfig,
  CanvasUser,
  CanvasApiError,
} from './CanvasClient';
export { RateLimiter, RateLimiterConfig, RateLimitStatus } from './RateLimiter';
export {
  SyncEngine,
  SyncEngineConfig,
  SyncResult,
  FullSyncResult,
  SyncDiagnosticEntry,
} from './SyncEngine';
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
  extractHtmlReferences,
  extractAllDependencies,
  type ExtractedFileReference,
  type ExtractedHtmlReference,
  type HtmlFileExtractorConfig,
} from './HtmlFileExtractor';
export {
  HtmlContentSync,
  type HtmlContentSyncOptions,
  type HtmlContentSyncResult,
  type HtmlContentItem,
  type ExtractedResource,
} from './HtmlContentSync';
export {
  HtmlDependencyResolver,
  type HtmlSourceType,
  type DependencyNode,
  type ResolutionResult,
  type HtmlDependencyResolverConfig,
} from './HtmlDependencyResolver';
export {
  HtmlUrlRewriter,
  rewriteHtmlUrls,
  type ResolvedDependency,
  type RewriteOptions,
} from './HtmlUrlRewriter';
export {
  HtmlLocalPathManager,
  type HtmlLocalPathManagerConfig,
  type HtmlDownloadRequest,
  type HtmlDownloadResult,
  type RegenerationInfo,
} from './HtmlLocalPathManager';
export {
  ExportManager,
  type SelectiveExportOptions,
  type CsvExportOptions,
  type ExportResult,
  type ExportProgress,
  type ExportManifest,
  type ExportManagerConfig,
} from './ExportManager';
export {
  OperationCoordinator,
  type OperationType,
  type ActiveOperation,
  type OperationCoordinatorConfig,
} from './OperationCoordinator';
