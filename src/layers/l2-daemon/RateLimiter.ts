import { EventEmitter } from 'events';
import { RateLimiterConfig as AppRateLimiterConfig } from './DaemonConfig';
import type { ComponentLogger } from '../l0-utilities/Logger';

export interface RateLimiterConfig {
  maxConcurrent?: number; // Max concurrent requests (default: 3)
  minDelayMs?: number; // Min delay between requests (default: 100ms)
  maxRetries?: number; // Max retries on failure (default: 3)
  baseBackoffMs?: number; // Base backoff for retries (default: 2000ms)
  maxBackoffMs?: number; // Max backoff cap (default: 16000ms)
  warningThreshold?: number; // Rate limit warning threshold (default: 10)
  autoResumeDelayMs?: number; // Auto-resume delay after warning (default: 5000ms)
  maxPauseDurationMs?: number; // Max pause duration before forced resume (default: 60000ms)
  maxQueueSize?: number; // Max queue size before rejecting (default: 100)
  requestTimeoutMs?: number; // Max time a request can wait in queue (default: 60000ms = 1 min)
  staleCleanupIntervalMs?: number; // Interval to clean stale requests (default: 10000ms)
  logger?: ComponentLogger; // Optional logger for debug output
}

// Type alias for AppConfig compatibility
export type { AppRateLimiterConfig };

export interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  retries: number;
  priority: number; // Higher = more important
  createdAt: number;
}

export interface RateLimitStatus {
  queueLength: number;
  activeRequests: number;
  rateLimitRemaining: number;
  isPaused: boolean;
  adaptiveDelayMs: number;
  rateLimitCost: number;
}

export interface RateLimitHeaders {
  remaining: number;
  cost?: number;
  resetAt?: Date;
}

/**
 * Rate Limiter with request queue and exponential backoff
 *
 * Features:
 * - Max 3 concurrent requests (configurable)
 * - Exponential backoff on 429 (2s, 4s, 8s, 16s)
 * - Automatic retry on network errors (max 3 retries)
 * - Priority queue support
 * - Pause/resume for rate limit events
 */
export class RateLimiter extends EventEmitter {
  private queue: QueuedRequest<unknown>[] = [];
  private activeRequests: number = 0;
  private isPaused: boolean = false;
  private rateLimitRemaining: number = 700; // Canvas default
  private rateLimitCost: number = 1; // Default cost per request
  private rateLimitResetAt: Date | null = null;
  private adaptiveDelayMs: number = 0; // Calculated adaptive delay
  private requestIdCounter: number = 0;
  private processingInterval: NodeJS.Timeout | null = null;
  private autoResumeTimeout: NodeJS.Timeout | null = null;
  private log: ComponentLogger | null;

  private readonly maxConcurrent: number;
  private readonly minDelayMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly warningThreshold: number;
  private readonly autoResumeDelayMs: number;
  private readonly maxPauseDurationMs: number;
  private readonly maxQueueSize: number;
  private readonly requestTimeoutMs: number;
  private readonly staleCleanupIntervalMs: number;
  private staleCleanupInterval: NodeJS.Timeout | null = null;
  private pausedAt: number | null = null; // Track when pause started

  // Adaptive throttling constants
  private static readonly CANVAS_RATE_LIMIT_MAX = 700; // Canvas default max
  private static readonly ADAPTIVE_THRESHOLD_HIGH = 500; // Above this, minimal delay
  private static readonly ADAPTIVE_THRESHOLD_MED = 200; // Below this, moderate delay
  private static readonly ADAPTIVE_THRESHOLD_LOW = 50; // Below this, significant delay
  private static readonly ADAPTIVE_DELAY_HIGH_MS = 50; // Delay when quota is high
  private static readonly ADAPTIVE_DELAY_MED_MS = 200; // Delay when quota is moderate
  private static readonly ADAPTIVE_DELAY_LOW_MS = 500; // Delay when quota is low
  private static readonly ADAPTIVE_DELAY_CRITICAL_MS = 2000; // Delay when near limit

  /**
   * Create a new RateLimiter instance
   * @param config - RateLimiterConfig or AppRateLimiterConfig from AppConfig
   */
  constructor(config: RateLimiterConfig | AppRateLimiterConfig = {}) {
    super();
    this.maxConcurrent = config.maxConcurrent ?? 3;
    this.minDelayMs = config.minDelayMs ?? 100;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseBackoffMs = config.baseBackoffMs ?? 2000;
    this.maxBackoffMs = config.maxBackoffMs ?? 16000;
    this.warningThreshold = config.warningThreshold ?? 10;
    this.autoResumeDelayMs = config.autoResumeDelayMs ?? 5000;
    this.maxPauseDurationMs = (config as RateLimiterConfig).maxPauseDurationMs ?? 60000; // 1 minute max pause
    this.maxQueueSize = (config as RateLimiterConfig).maxQueueSize ?? 100;
    this.requestTimeoutMs = (config as RateLimiterConfig).requestTimeoutMs ?? 60000; // 1 minute default
    this.staleCleanupIntervalMs =
      (config as RateLimiterConfig).staleCleanupIntervalMs ?? 10000; // 10 seconds
    this.log = (config as RateLimiterConfig).logger ?? null;

    // Start stale request cleanup interval (also acts as pause watchdog)
    this.startStaleCleanup();
  }

  /**
   * Start periodic cleanup of stale (timed out) requests
   * This prevents unbounded memory growth from long-queued requests
   */
  private startStaleCleanup(): void {
    if (this.staleCleanupInterval) {
      clearInterval(this.staleCleanupInterval);
    }

    this.staleCleanupInterval = setInterval(() => {
      this.cleanupStaleRequests();
    }, this.staleCleanupIntervalMs);
  }

  /**
   * Remove requests that have been queued longer than requestTimeoutMs
   * Also acts as watchdog for stuck pauses - forces resume if paused too long
   * Rejects their promises with a timeout error
   */
  private cleanupStaleRequests(): void {
    const now = Date.now();
    const staleThreshold = now - this.requestTimeoutMs;
    let cleanedCount = 0;

    // Watchdog: Force resume if paused for too long (prevents stuck state)
    if (this.isPaused && this.pausedAt !== null) {
      const pauseDuration = now - this.pausedAt;
      if (pauseDuration > this.maxPauseDurationMs) {
        this.log?.debug(
          ` WATCHDOG: forcing resume after ${pauseDuration}ms pause (max=${this.maxPauseDurationMs}ms)`
        );
        this.emit('watchdog-resume', {
          pauseDuration,
          maxPauseDurationMs: this.maxPauseDurationMs,
        });
        this.resume();
      }
    }

    // Filter out stale requests
    this.queue = this.queue.filter((request) => {
      if (request.createdAt < staleThreshold) {
        // Request has timed out - reject it
        cleanedCount++;
        this.log?.debug(` TIMEOUT: ${request.id} waited ${now - request.createdAt}ms`);
        request.reject(
          new Error(`Request timeout: waited ${now - request.createdAt}ms in queue`)
        );
        return false; // Remove from queue
      }
      return true; // Keep in queue
    });

    if (cleanedCount > 0) {
      this.emit('stale-cleaned', { cleanedCount, queueLength: this.queue.length });
    }
  }

  /**
   * Add a request to the queue
   * @throws Error if queue is full and no lower-priority request can be evicted
   */
  enqueue<T>(execute: () => Promise<T>, priority: number = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      if (this.queue.length >= this.maxQueueSize) {
        // Try to evict a lower-priority request if this one has higher priority
        const evicted = this.tryEvictLowerPriority(priority);

        if (!evicted) {
          this.log?.debug(
            ` QUEUE FULL: ${this.queue.length}/${this.maxQueueSize}, no lower priority to evict`
          );
          const error = new Error(
            `Queue full: exceeded max size of ${this.maxQueueSize}`
          );
          this.emit('queue-full', {
            queueLength: this.queue.length,
            maxQueueSize: this.maxQueueSize,
          });
          reject(error);
          return;
        }
      }

      const request: QueuedRequest<T> = {
        id: `req_${++this.requestIdCounter}`,
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries: 0,
        priority,
        createdAt: Date.now(),
      };

      // Insert by priority (higher priority first)
      const insertIndex = this.queue.findIndex((r) => r.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        this.queue.splice(insertIndex, 0, request as QueuedRequest<unknown>);
      }

      this.log?.debug(
        ` ENQUEUE: ${request.id}, priority=${priority}, queue_length=${this.queue.length}, active=${this.activeRequests}`
      );
      this.emit('queued', { id: request.id, queueLength: this.queue.length });
      this.processQueue();
    });
  }

  /**
   * Try to evict the oldest lowest-priority request to make room
   * Returns true if a request was evicted, false otherwise
   */
  private tryEvictLowerPriority(incomingPriority: number): boolean {
    // Find the lowest priority request (at the end since queue is sorted by priority)
    // Among equal lowest priorities, pick the oldest (first one found at that level)
    let lowestPriorityIdx = -1;
    let lowestPriority = Infinity;
    let oldestAtLowest = Infinity;

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const req = this.queue[i];
      if (req.priority < lowestPriority) {
        lowestPriority = req.priority;
        lowestPriorityIdx = i;
        oldestAtLowest = req.createdAt;
      } else if (req.priority === lowestPriority && req.createdAt <= oldestAtLowest) {
        // Same priority but older (or same time but lower index = earlier in queue)
        // Use <= to handle same-millisecond insertions by preferring lower index
        lowestPriorityIdx = i;
        oldestAtLowest = req.createdAt;
      }
    }

    // Only evict if the incoming request has strictly higher priority
    if (lowestPriorityIdx >= 0 && incomingPriority > lowestPriority) {
      const evicted = this.queue[lowestPriorityIdx];
      this.queue.splice(lowestPriorityIdx, 1);
      this.log?.debug(
        ` EVICTED: ${evicted.id} (priority=${evicted.priority}) for higher priority request`
      );
      evicted.reject(
        new Error(
          `Request evicted: lower priority (${evicted.priority}) replaced by higher priority (${incomingPriority})`
        )
      );
      this.emit('request-evicted', {
        evictedId: evicted.id,
        evictedPriority: evicted.priority,
        incomingPriority,
      });
      return true;
    }

    return false;
  }

  /**
   * Process the request queue
   * Starts multiple requests concurrently up to maxConcurrent limit
   */
  private processQueue(): void {
    // Start requests up to the concurrency limit
    while (
      !this.isPaused &&
      this.activeRequests < this.maxConcurrent &&
      this.queue.length > 0
    ) {
      const request = this.queue.shift();
      if (!request) break;

      this.activeRequests++;
      this.log?.debug(
        ` START: ${request.id}, active=${this.activeRequests}/${this.maxConcurrent}, queue=${this.queue.length}`
      );
      this.emit('request-start', { id: request.id, active: this.activeRequests });

      // Execute request asynchronously (don't await - allows concurrency)
      const startTime = Date.now();
      request
        .execute()
        .then((result) => {
          const duration = Date.now() - startTime;
          this.activeRequests--;
          request.resolve(result);
          this.log?.debug(
            ` COMPLETE: ${request.id} in ${duration}ms, active=${this.activeRequests}`
          );
          this.emit('request-complete', { id: request.id, active: this.activeRequests });

          // Schedule next request with delay
          const effectiveDelay = Math.max(this.minDelayMs, this.adaptiveDelayMs);
          setTimeout(() => this.processQueue(), effectiveDelay);
        })
        .catch((error) => {
          this.activeRequests--;
          this.log?.debug(` ERROR: ${request.id} - ${error}`);
          this.handleRequestError(request, error).then(() => {
            // Schedule next request with delay after error handling
            const effectiveDelay = Math.max(this.minDelayMs, this.adaptiveDelayMs);
            setTimeout(() => this.processQueue(), effectiveDelay);
          });
        });
    }

    if (this.isPaused) {
      this.log?.debug(` PAUSED: not processing queue`);
    }
  }

  /**
   * Handle request errors with retry logic
   */
  private async handleRequestError(
    request: QueuedRequest<unknown>,
    error: unknown
  ): Promise<void> {
    const isRateLimited = this.isRateLimitError(error);
    const isRetryable = this.isRetryableError(error);

    this.log?.debug(
      ` HANDLE ERROR: ${request.id}, isRateLimited=${isRateLimited}, isRetryable=${isRetryable}, retries=${request.retries}/${this.maxRetries}`
    );

    if (isRateLimited) {
      // Pause all requests and retry with backoff
      this.log?.debug(` RATE LIMITED: pausing queue`);
      this.pause();

      // Try to parse Retry-After header for server-specified delay
      const retryAfterMs = this.parseRetryAfter(error);
      const backoff = this.calculateBackoff(request.retries, retryAfterMs);

      this.log?.debug(` BACKOFF: ${backoff}ms (retry-after=${retryAfterMs || 'none'})`);
      this.emit('rate-limited', {
        backoffMs: backoff,
        retries: request.retries,
        retryAfterMs: retryAfterMs || null,
      });

      await this.delay(backoff);
      this.resume();

      // Re-queue with incremented retry count
      request.retries++;
      this.queue.unshift(request); // Add to front
      this.log?.debug(` RETRY RATE LIMITED: ${request.id}, attempt=${request.retries}`);
      this.processQueue();
      return;
    }

    if (isRetryable && request.retries < this.maxRetries) {
      const backoff = this.calculateBackoff(request.retries);
      this.log?.debug(
        ` RETRY: ${request.id}, attempt=${request.retries + 1}/${this.maxRetries}, backoff=${backoff}ms`
      );
      this.emit('retry', {
        id: request.id,
        attempt: request.retries + 1,
        backoffMs: backoff,
      });

      await this.delay(backoff);
      request.retries++;
      this.queue.unshift(request); // Add to front
      this.processQueue();
      return;
    }

    // Give up - reject the promise
    this.log?.debug(` FAILED: ${request.id}, giving up after ${request.retries} retries`);
    this.emit('request-failed', {
      id: request.id,
      error,
      retries: request.retries,
    });
    request.reject(error);
  }

  /**
   * Calculate exponential backoff with jitter
   * Jitter range: 0.5x to 1.0x of base backoff (prevents thundering herd)
   */
  private calculateBackoff(retryCount: number, retryAfterMs?: number): number {
    // Use server-specified retry-after if available
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      // Add jitter to server-specified delay too
      const jitter = 0.5 + Math.random() * 0.5;
      return Math.min(retryAfterMs * jitter, this.maxBackoffMs);
    }

    // Calculate exponential backoff
    const baseBackoff = this.baseBackoffMs * Math.pow(2, retryCount);
    // Add jitter: multiply by random factor between 0.5 and 1.0
    const jitter = 0.5 + Math.random() * 0.5;
    return Math.min(baseBackoff * jitter, this.maxBackoffMs);
  }

  /**
   * Parse Retry-After header value to milliseconds
   * Supports both delay-seconds (integer) and HTTP-date formats
   */
  private parseRetryAfter(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;

    // Check for retry-after header in error response
    const headers = (error as { headers?: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'] || headers?.['Retry-After'];

    if (!retryAfter) return undefined;

    // Try parsing as integer (delay-seconds)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }

    // Try parsing as HTTP-date
    try {
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        const delayMs = date.getTime() - Date.now();
        return delayMs > 0 ? delayMs : undefined;
      }
    } catch {
      // Invalid date format, ignore
    }

    return undefined;
  }

  /**
   * Check if error is a rate limit (429)
   */
  private isRateLimitError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const status = (error as { status?: number }).status;
      return status === 429;
    }
    return false;
  }

  /**
   * Check if error is retryable (network errors, 5xx)
   */
  private isRetryableError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const status = (error as { status?: number }).status;
      // Network error (status 0) or server error (5xx)
      return status === 0 || (status !== undefined && status >= 500);
    }
    return false;
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.isPaused = true;
    this.pausedAt = Date.now();
    this.emit('paused');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.isPaused = false;
    this.pausedAt = null;
    this.emit('resumed');
    this.processQueue();
  }

  /**
   * Update rate limit from response headers (simple version)
   * @deprecated Use updateRateLimitFromHeaders for full adaptive throttling
   */
  updateRateLimit(remaining: number): void {
    this.updateRateLimitFromHeaders({ remaining });
  }

  /**
   * Update rate limit from Canvas response headers with adaptive throttling
   *
   * Canvas provides:
   * - X-Rate-Limit-Remaining: requests left in current window
   * - X-Request-Cost: cost of the previous request (usually 1, but can be higher)
   *
   * This method calculates adaptive delays to smooth out request rate and avoid
   * hitting the limit, rather than just pausing when nearly exhausted.
   */
  updateRateLimitFromHeaders(headers: RateLimitHeaders): void {
    const { remaining, cost, resetAt } = headers;

    this.rateLimitRemaining = remaining;
    if (cost !== undefined) {
      this.rateLimitCost = cost;
    }
    if (resetAt !== undefined) {
      this.rateLimitResetAt = resetAt;
    }

    // Calculate adaptive delay based on remaining quota
    this.adaptiveDelayMs = this.calculateAdaptiveDelay(remaining);

    this.emit('rate-limit-updated', {
      remaining,
      cost: this.rateLimitCost,
      adaptiveDelayMs: this.adaptiveDelayMs,
    });

    // Auto-pause if below warning threshold
    if (remaining < this.warningThreshold) {
      this.pause();
      this.emit('rate-limit-warning', {
        remaining,
        adaptiveDelayMs: this.adaptiveDelayMs,
      });

      // Calculate pause duration based on reset time or default
      const pauseDuration = this.calculatePauseDuration(remaining);

      // Clear any existing auto-resume timeout
      if (this.autoResumeTimeout) {
        clearTimeout(this.autoResumeTimeout);
      }

      // Auto-resume after calculated delay
      this.autoResumeTimeout = setTimeout(() => {
        this.autoResumeTimeout = null;
        this.resume();
      }, pauseDuration);
    }
  }

  /**
   * Calculate adaptive delay based on remaining quota
   *
   * Instead of binary pause/resume, this smooths out request rate:
   * - High quota (>500): minimal delay, process quickly
   * - Medium quota (200-500): small delay, steady pace
   * - Low quota (50-200): moderate delay, conserve quota
   * - Critical quota (<50): significant delay, avoid hitting limit
   */
  private calculateAdaptiveDelay(remaining: number): number {
    if (remaining > RateLimiter.ADAPTIVE_THRESHOLD_HIGH) {
      return RateLimiter.ADAPTIVE_DELAY_HIGH_MS;
    } else if (remaining > RateLimiter.ADAPTIVE_THRESHOLD_MED) {
      // Linear interpolation between high and medium thresholds
      const ratio =
        (remaining - RateLimiter.ADAPTIVE_THRESHOLD_MED) /
        (RateLimiter.ADAPTIVE_THRESHOLD_HIGH - RateLimiter.ADAPTIVE_THRESHOLD_MED);
      return Math.round(
        RateLimiter.ADAPTIVE_DELAY_MED_MS +
          (RateLimiter.ADAPTIVE_DELAY_HIGH_MS - RateLimiter.ADAPTIVE_DELAY_MED_MS) * ratio
      );
    } else if (remaining > RateLimiter.ADAPTIVE_THRESHOLD_LOW) {
      // Linear interpolation between medium and low thresholds
      const ratio =
        (remaining - RateLimiter.ADAPTIVE_THRESHOLD_LOW) /
        (RateLimiter.ADAPTIVE_THRESHOLD_MED - RateLimiter.ADAPTIVE_THRESHOLD_LOW);
      return Math.round(
        RateLimiter.ADAPTIVE_DELAY_LOW_MS +
          (RateLimiter.ADAPTIVE_DELAY_MED_MS - RateLimiter.ADAPTIVE_DELAY_LOW_MS) * ratio
      );
    } else if (remaining > this.warningThreshold) {
      // Below low threshold but not yet critical
      const ratio =
        (remaining - this.warningThreshold) /
        (RateLimiter.ADAPTIVE_THRESHOLD_LOW - this.warningThreshold);
      return Math.round(
        RateLimiter.ADAPTIVE_DELAY_CRITICAL_MS +
          (RateLimiter.ADAPTIVE_DELAY_LOW_MS - RateLimiter.ADAPTIVE_DELAY_CRITICAL_MS) *
            ratio
      );
    } else {
      // Critical - use maximum delay
      return RateLimiter.ADAPTIVE_DELAY_CRITICAL_MS;
    }
  }

  /**
   * Calculate how long to pause when quota is exhausted
   */
  private calculatePauseDuration(remaining: number): number {
    // If we have a reset time, use it
    if (this.rateLimitResetAt) {
      const msUntilReset = this.rateLimitResetAt.getTime() - Date.now();
      if (msUntilReset > 0) {
        // Add small buffer to account for clock drift
        return Math.min(msUntilReset + 1000, this.autoResumeDelayMs * 2);
      }
    }

    // Otherwise use default, scaled by how close we are to 0
    const urgencyFactor = Math.max(
      1,
      (this.warningThreshold - remaining) / this.warningThreshold
    );
    return Math.round(this.autoResumeDelayMs * urgencyFactor);
  }

  /**
   * Get current status
   */
  getStatus(): RateLimitStatus {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      rateLimitRemaining: this.rateLimitRemaining,
      isPaused: this.isPaused,
      adaptiveDelayMs: this.adaptiveDelayMs,
      rateLimitCost: this.rateLimitCost,
    };
  }

  /**
   * Clear the queue (cancel pending requests)
   * @param silent - If true, don't reject pending promises (for cleanup)
   */
  clear(silent: boolean = false): void {
    const cancelledCount = this.queue.length;
    if (!silent) {
      for (const request of this.queue) {
        request.reject(new Error('Request cancelled - queue cleared'));
      }
    }
    this.queue = [];
    this.emit('cleared', { cancelledCount });
  }

  /**
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stop the rate limiter (silent cleanup)
   */
  stop(): void {
    this.clear(true); // Silent clear to avoid unhandled rejections
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    if (this.autoResumeTimeout) {
      clearTimeout(this.autoResumeTimeout);
      this.autoResumeTimeout = null;
    }
    if (this.staleCleanupInterval) {
      clearInterval(this.staleCleanupInterval);
      this.staleCleanupInterval = null;
    }
    // Remove all listeners to prevent memory leaks (#20)
    this.removeAllListeners();
  }
}
