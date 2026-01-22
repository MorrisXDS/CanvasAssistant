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
export { SyncEngine, SyncEngineConfig, SyncResult, FullSyncResult } from './SyncEngine';
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
