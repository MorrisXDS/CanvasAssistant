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
export * from './DataMappers';
