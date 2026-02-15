/**
 * L2 Daemon - Resilience Wrapper
 *
 * Unified wrapper combining RateLimiter and CircuitBreaker for API resilience.
 * When circuit is open, requests are rejected immediately (not queued).
 * Shares state between rate limiter pause and circuit breaker open.
 */

import { EventEmitter } from 'events';
import { RateLimiter, RateLimiterConfig } from './RateLimiter';
import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitOpenError,
} from './CircuitBreaker';
import { ComponentLogger, Logger } from '../../l0-utilities/Logger';

export interface ResilienceWrapperConfig {
  rateLimiter?: RateLimiterConfig;
  circuitBreaker?: CircuitBreakerOptions;
  logger?: Logger;
}

export interface ResilienceStatus {
  rateLimiter: {
    queueLength: number;
    activeRequests: number;
    isPaused: boolean;
  };
  circuitBreaker: {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
  };
  isAcceptingRequests: boolean;
}

/**
 * ResilienceWrapper combines rate limiting and circuit breaking
 *
 * Features:
 * - Rejects requests immediately when circuit is open (doesn't queue them)
 * - Pauses rate limiter when circuit opens
 * - Resumes rate limiter when circuit transitions to half-open
 * - Unified status reporting
 */
export class ResilienceWrapper extends EventEmitter {
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly log: ComponentLogger;

  constructor(config: ResilienceWrapperConfig = {}) {
    super();

    // Initialize components
    this.rateLimiter = new RateLimiter(config.rateLimiter);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker, config.logger);

    // Setup logger
    if (config.logger) {
      this.log = config.logger.child('resilienceWrapper');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('resilienceWrapper');
    }

    // Coordinate circuit breaker and rate limiter state
    this.setupEventCoordination();
  }

  /**
   * Setup event coordination between circuit breaker and rate limiter
   */
  private setupEventCoordination(): void {
    // When circuit opens, pause the rate limiter
    this.circuitBreaker.on('circuit-opened', ({ endpoint }) => {
      this.log.info(`Circuit opened for ${endpoint}, pausing rate limiter`);
      this.rateLimiter.pause();
      this.emit('circuit-opened', { endpoint });
    });

    // When circuit transitions to half-open, resume rate limiter for test request
    this.circuitBreaker.on('circuit-half-open', ({ endpoint }) => {
      this.log.info(`Circuit half-open for ${endpoint}, resuming rate limiter`);
      this.rateLimiter.resume();
      this.emit('circuit-half-open', { endpoint });
    });

    // When circuit closes, ensure rate limiter is resumed
    this.circuitBreaker.on('circuit-closed', ({ endpoint }) => {
      this.log.info(`Circuit closed for ${endpoint}`);
      this.rateLimiter.resume();
      this.emit('circuit-closed', { endpoint });
    });

    // Forward rate limiter events
    this.rateLimiter.on('rate-limited', (data) => {
      this.emit('rate-limited', data);
    });

    this.rateLimiter.on('queue-full', (data) => {
      this.emit('queue-full', data);
    });
  }

  /**
   * Execute a request with resilience protection
   *
   * @param fn - The function to execute
   * @param endpoint - Optional endpoint identifier for per-endpoint circuit tracking
   * @param priority - Optional priority for rate limiter queue (higher = more important)
   */
  async execute<T>(
    fn: () => Promise<T>,
    endpoint?: string,
    priority: number = 0
  ): Promise<T> {
    // Check circuit breaker FIRST - reject immediately if open
    if (!this.circuitBreaker.isAllowing(endpoint)) {
      this.log.debug(`Request rejected: circuit open for ${endpoint || 'global'}`);
      throw new CircuitOpenError(`Circuit breaker is open for ${endpoint || 'global'}`);
    }

    // Wrap the function with circuit breaker tracking
    const wrappedFn = async (): Promise<T> => {
      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess(endpoint);
        return result;
      } catch (error) {
        // Pass error so circuit breaker can differentiate transient vs non-transient
        this.circuitBreaker.recordFailure(endpoint, error);
        throw error;
      }
    };

    // Execute through rate limiter
    return this.rateLimiter.enqueue(wrappedFn, priority);
  }

  /**
   * Get unified status
   */
  getStatus(endpoint?: string): ResilienceStatus {
    const rlStatus = this.rateLimiter.getStatus();
    const cbStatus = this.circuitBreaker.getStatus(endpoint);

    return {
      rateLimiter: {
        queueLength: rlStatus.queueLength,
        activeRequests: rlStatus.activeRequests,
        isPaused: rlStatus.isPaused,
      },
      circuitBreaker: {
        state: cbStatus.state,
        failureCount: cbStatus.failureCount,
      },
      isAcceptingRequests: cbStatus.state !== 'open' && !rlStatus.isPaused,
    };
  }

  /**
   * Check if wrapper is accepting new requests
   */
  isAcceptingRequests(endpoint?: string): boolean {
    const status = this.getStatus(endpoint);
    return status.isAcceptingRequests;
  }

  /**
   * Update rate limit from response header
   */
  updateRateLimit(remaining: number): void {
    this.rateLimiter.updateRateLimit(remaining);
  }

  /**
   * Get the underlying rate limiter (for advanced configuration)
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get the underlying circuit breaker (for advanced configuration)
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Force circuit open
   */
  forceOpen(endpoint?: string): void {
    this.circuitBreaker.forceOpen(endpoint);
  }

  /**
   * Force circuit closed
   */
  forceClose(endpoint?: string): void {
    this.circuitBreaker.forceClose(endpoint);
  }

  /**
   * Reset all circuits
   */
  reset(): void {
    this.circuitBreaker.reset();
    this.rateLimiter.resume();
  }

  /**
   * Clear rate limiter queue
   */
  clearQueue(): void {
    this.rateLimiter.clear();
  }

  /**
   * Stop and cleanup
   */
  stop(): void {
    this.rateLimiter.stop();
    this.circuitBreaker.stop();
  }
}
