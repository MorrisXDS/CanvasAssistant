import { EventEmitter } from 'events';

export interface RateLimiterConfig {
  maxConcurrent?: number; // Max concurrent requests (default: 3)
  minDelayMs?: number; // Min delay between requests (default: 100ms)
  maxRetries?: number; // Max retries on failure (default: 3)
  baseBackoffMs?: number; // Base backoff for retries (default: 2000ms)
  maxBackoffMs?: number; // Max backoff cap (default: 16000ms)
}

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

  private readonly maxConcurrent: number;
  private readonly minDelayMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(config: RateLimiterConfig = {}) {
    super();
    this.maxConcurrent = config.maxConcurrent ?? 3;
    this.minDelayMs = config.minDelayMs ?? 100;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseBackoffMs = config.baseBackoffMs ?? 2000;
    this.maxBackoffMs = config.maxBackoffMs ?? 16000;
  }

  /**
   * Add a request to the queue
   */
  enqueue<T>(
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
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

      this.emit('queued', { id: request.id, queueLength: this.queue.length });
      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused) return;
    if (this.activeRequests >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;
    this.emit('request-start', { id: request.id, active: this.activeRequests });

    try {
      const result = await request.execute();
      this.activeRequests--;
      request.resolve(result);
      this.emit('request-complete', { id: request.id, active: this.activeRequests });
    } catch (error) {
      this.activeRequests--;
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

    if (isRateLimited) {
      // Pause all requests and retry with backoff
      this.pause();
      const backoff = this.calculateBackoff(request.retries);
      this.emit('rate-limited', { backoffMs: backoff, retries: request.retries });

      await this.delay(backoff);
      this.resume();

      // Re-queue with incremented retry count
      request.retries++;
      this.queue.unshift(request); // Add to front
      this.processQueue();
      return;
    }

    if (isRetryable && request.retries < this.maxRetries) {
      const backoff = this.calculateBackoff(request.retries);
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
    this.emit('request-failed', {
      id: request.id,
      error,
      retries: request.retries,
    });
    request.reject(error);
  }

  /**
   * Calculate exponential backoff
   */
  private calculateBackoff(retryCount: number): number {
    const backoff = this.baseBackoffMs * Math.pow(2, retryCount);
    return Math.min(backoff, this.maxBackoffMs);
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

    // Auto-pause if very low
    if (remaining < 10) {
      this.pause();
      this.emit('rate-limit-warning', { remaining });

      // Auto-resume after a delay
      setTimeout(() => this.resume(), 5000);
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
  }
}
