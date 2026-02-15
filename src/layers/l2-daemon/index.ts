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

// Config (stays at root - cross-layer config pattern)
export type {
  DaemonConfig,
  CanvasApiConfig,
  RateLimiterConfig as DaemonRateLimiterConfig,
  CircuitBreakerConfig as DaemonCircuitBreakerConfig,
  SyncConfig,
  HtmlContentSyncConfig,
  PolicyDetectionConfig,
  InputValidatorConfig as DaemonInputValidatorConfig,
} from './DaemonConfig';
export { DEFAULT_DAEMON_CONFIG } from './DaemonConfig';

// Client (Canvas API + validation + classification)
export {
  CanvasClient,
  CanvasClientConfig,
  CanvasUser,
  CanvasApiError,
} from './client/CanvasClient';
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
} from './client/InputValidator';
export {
  TaskTypeClassifier,
  taskTypeClassifier,
  type ClassificationInput,
  type ClassificationResult,
  type TaskTypeFieldSource,
} from './client/TaskTypeClassifier';

// Data (Canvas → local DB transformation)
export * from './data/DataMappers';

// Resilience (rate limiting + circuit breaking)
export {
  RateLimiter,
  RateLimiterConfig,
  RateLimitStatus,
} from './resilience/RateLimiter';
export {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitState,
  type CircuitStatus,
  type CircuitBreakerOptions,
} from './resilience/CircuitBreaker';
export {
  ResilienceWrapper,
  type ResilienceWrapperConfig,
  type ResilienceStatus,
} from './resilience/ResilienceWrapper';

// Calendar (ICS parsing + recurrence expansion)
export {
  ICSParser,
  type ParsedICSEvent,
  type ICSParserResult,
  type ICSImportPreview,
} from './calendar/ICSParser';
export {
  RRuleExpander,
  type CalendarEventRecord,
  type ExpandedEvent,
} from './calendar/RRuleExpander';

// HTML (content sync, extraction, rewriting)
export {
  HtmlFileExtractor,
  extractCanvasFileIds,
  extractCanvasFileReferences,
  extractHtmlReferences,
  extractAllDependencies,
  type ExtractedFileReference,
  type ExtractedHtmlReference,
  type HtmlFileExtractorConfig,
} from './html/HtmlFileExtractor';
export {
  HtmlContentSync,
  type HtmlContentSyncOptions,
  type HtmlContentSyncResult,
  type HtmlContentItem,
  type ExtractedResource,
} from './html/HtmlContentSync';
export {
  HtmlDependencyResolver,
  type HtmlSourceType,
  type DependencyNode,
  type ResolutionResult,
  type HtmlDependencyResolverConfig,
} from './html/HtmlDependencyResolver';
export {
  HtmlUrlRewriter,
  rewriteHtmlUrls,
  type ResolvedDependency,
  type RewriteOptions,
} from './html/HtmlUrlRewriter';
export {
  HtmlLocalPathManager,
  type HtmlLocalPathManagerConfig,
  type HtmlDownloadRequest,
  type HtmlDownloadResult,
  type RegenerationInfo,
} from './html/HtmlLocalPathManager';

// Export (JSON, CSV, ZIP)
export {
  ExportManager,
  type SelectiveExportOptions,
  type CsvExportOptions,
  type ExportResult,
  type ExportProgress,
  type ExportManifest,
  type ExportManagerConfig,
} from './export/ExportManager';

// Sync Engine (core sync orchestration)
export {
  SyncEngine,
  SyncEngineConfig,
  SyncResult,
  FullSyncResult,
  SyncDiagnosticEntry,
} from './sync-engine/SyncEngine';
export {
  SyncConflictResolver,
  type SyncConflict,
  type ConflictResolution,
  type SyncPreference,
} from './sync-engine/SyncConflictResolver';
export {
  OperationCoordinator,
  type OperationType,
  type ActiveOperation,
  type OperationCoordinatorConfig,
} from './sync-engine/OperationCoordinator';
