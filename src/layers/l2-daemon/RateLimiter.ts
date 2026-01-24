import { EventEmitter } from 'events';
import { RateLimiterConfig as AppRateLimiterConfig } from '../l0-utilities/AppConfig';
import type { ComponentLogger } from '../l0-utilities/Logger';

export interface RateLimiterConfig {
  maxConcurrent?: number; // Max concurrent requests (default: 3)
  minDelayMs?: number; // Min delay between requests (default: 100ms)
  maxRetries?: number; // Max retries on failure (default: 3)
  baseBackoffMs?: number; // Base backoff for retries (default: 2000ms)
  maxBackoffMs?: number; // Max backoff cap (default: 16000ms)
  warningThreshold?: number; // Rate limit warning threshold (default: 10)
  autoResumeDelayMs?: number; // Auto-resume delay after warning (default: 5000ms)
  maxQueueSize?: number; // Max queue size before rejecting (default: 100)
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
  private readonly maxQueueSize: number;

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
    this.maxQueueSize = (config as RateLimiterConfig).maxQueueSize ?? 100;
    this.log = (config as RateLimiterConfig).logger ?? null;
  }

  /**
   * Add a request to the queue
   * @throws Error if queue is full (maxQueueSize exceeded)
   */
  enqueue<T>(
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      if (this.queue.length >= this.maxQueueSize) {
        this.log?.debug(` QUEUE FULL: ${this.queue.length}/${this.maxQueueSize}`);
        const error = new Error(`Queue full: exceeded max size of ${this.maxQueueSize}`);
        this.emit('queue-full', {
          queueLength: this.queue.length,
          maxQueueSize: this.maxQueueSize,
        });
        reject(error);
        return;
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
      const insertIndex = this.queue.findIndex(
        (r) => r.priority < priority
      );
      if (insertIndex === -1) {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        this.queue.splice(insertIndex, 0, request as QueuedRequest<unknown>);
      }

      this.log?.debug(` ENQUEUE: ${request.id}, priority=${priority}, queue_length=${this.queue.length}, active=${this.activeRequests}`);
      this.emit('queued', { id: request.id, queueLength: this.queue.length });
      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused) {
      this.log?.debug(` PAUSED: not processing queue`);
      return;
    }
    if (this.activeRequests >= this.maxConcurrent) {
      this.log?.debug(` AT CAPACITY: ${this.activeRequests}/${this.maxConcurrent} active, waiting...`);
      return;
    }
    if (this.queue.length === 0) return;

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;
    this.log?.debug(` START: ${request.id}, active=${this.activeRequests}/${this.maxConcurrent}, queue=${this.queue.length}`);
    this.emit('request-start', { id: request.id, active: this.activeRequests });

    try {
      const startTime = Date.now();
      const result = await request.execute();
      const duration = Date.now() - startTime;
      this.activeRequests--;
      request.resolve(result);
      this.log?.debug(` COMPLETE: ${request.id} in ${duration}ms, active=${this.activeRequests}`);
      this.emit('request-complete', { id: request.id, active: this.activeRequests });
    } catch (error) {
      this.activeRequests--;
      this.log?.debug(` ERROR: ${request.id} - ${error}`);
      await this.handleRequestError(request, error);
    }

    // Small delay before next request
    await this.delay(this.minDelayMs);

    // Continue processing
    this.processQueue();
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

    this.log?.debug(` HANDLE ERROR: ${request.id}, isRateLimited=${isRateLimited}, isRetryable=${isRetryable}, retries=${request.retries}/${this.maxRetries}`);

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
      this.log?.debug(` RETRY: ${request.id}, attempt=${request.retries + 1}/${this.maxRetries}, backoff=${backoff}ms`);
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
    this.emit('paused');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.isPaused = false;
    this.emit('resumed');
    this.processQueue();
  }

  /**
   * Update rate limit remaining from response headers
   */
  updateRateLimit(remaining: number): void {
    this.rateLimitRemaining = remaining;
    this.emit('rate-limit-updated', { remaining });

    // Auto-pause if below warning threshold
    if (remaining < this.warningThreshold) {
      this.pause();
      this.emit('rate-limit-warning', { remaining });

      // Clear any existing auto-resume timeout
      if (this.autoResumeTimeout) {
        clearTimeout(this.autoResumeTimeout);
      }

      // Auto-resume after configured delay
      this.autoResumeTimeout = setTimeout(() => {
        this.autoResumeTimeout = null;
        this.resume();
      }, this.autoResumeDelayMs);
    }
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
  }
}
