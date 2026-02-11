/**
 * Layer 2: Daemon Configuration
 *
 * Configuration types and defaults for the daemon (sync) layer.
 */

export interface CanvasApiConfig {
  /** HTTP request timeout in ms */
  timeoutMs: number;
  /** Pagination page size */
  pageSize: number;
  /** Default rate limit remaining value */
  defaultRateLimit: number;
}

export interface RateLimiterConfig {
  /** Max concurrent requests */
  maxConcurrent: number;
  /** Min delay between requests in ms */
  minDelayMs: number;
  /** Max retry attempts */
  maxRetries: number;
  /** Base backoff for retries in ms */
  baseBackoffMs: number;
  /** Max backoff cap in ms */
  maxBackoffMs: number;
  /** Rate limit warning threshold */
  warningThreshold: number;
  /** Auto-resume delay after warning in ms */
  autoResumeDelayMs: number;
}

export interface CircuitBreakerConfig {
  /** Enable circuit breaker */
  enabled: boolean;
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Initial reset timeout in ms */
  resetTimeoutMs: number;
  /** Max reset timeout in ms (for exponential backoff) */
  maxResetTimeoutMs: number;
  /** Use exponential backoff for reset timeout */
  useExponentialBackoff: boolean;
  /** Per-endpoint circuit breakers */
  perEndpoint: boolean;
  /** Endpoints to track (if perEndpoint is true) */
  endpoints: string[];
}

export interface SyncConfig {
  /** Priority for course sync operations */
  coursePriority: number;
  /** Priority for task sync operations */
  taskPriority: number;
  /** Default sync queue priority */
  defaultPriority: number;
}

export interface HtmlContentSyncConfig {
  /** Whether to save HTML content files (pages, assignments, announcements) */
  enabled: boolean;
  /** URL rewriting mode for offline access: 'local' rewrites to local paths, 'original' keeps Canvas URLs */
  urlRewriting: 'local' | 'original';
  /** Extract and download embedded images */
  downloadImages: boolean;
  /** Extract and download linked files */
  downloadLinkedFiles: boolean;
  /** Max concurrent downloads for resources */
  maxConcurrentDownloads: number;
}

export interface PolicyDetectionConfig {
  /** Confidence boost for pattern matches */
  patternBoost: number;
}

export interface InputValidatorConfig {
  /** Validation strictness: 'strict' | 'lenient' */
  strictness: 'strict' | 'lenient';
  /** Log validation warnings */
  logWarnings: boolean;
  /** HTML handling in text fields: 'strip' | 'sanitize' | 'keep' */
  htmlHandling: 'strip' | 'sanitize' | 'keep';
}

export interface DaemonConfig {
  canvasApi: CanvasApiConfig;
  rateLimiter: RateLimiterConfig;
  circuitBreaker: CircuitBreakerConfig;
  sync: SyncConfig;
  htmlContentSync: HtmlContentSyncConfig;
  policyDetection: PolicyDetectionConfig;
  inputValidator: InputValidatorConfig;
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  canvasApi: {
    timeoutMs: 30000,
    pageSize: 100,
    defaultRateLimit: 700,
  },
  rateLimiter: {
    maxConcurrent: 3,
    minDelayMs: 100,
    maxRetries: 3,
    baseBackoffMs: 2000,
    maxBackoffMs: 16000,
    warningThreshold: 10,
    autoResumeDelayMs: 5000,
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    resetTimeoutMs: 30000, // 30 seconds
    maxResetTimeoutMs: 300000, // 5 minutes
    useExponentialBackoff: true,
    perEndpoint: true,
    endpoints: ['courses', 'assignments', 'submissions', 'users'],
  },
  sync: {
    coursePriority: 10,
    taskPriority: 5,
    defaultPriority: 10,
  },
  htmlContentSync: {
    enabled: true,
    urlRewriting: 'local',
    downloadImages: true,
    downloadLinkedFiles: true,
    maxConcurrentDownloads: 3,
  },
  policyDetection: {
    patternBoost: 0.15,
  },
  inputValidator: {
    strictness: 'lenient',
    logWarnings: true,
    htmlHandling: 'sanitize',
  },
};
