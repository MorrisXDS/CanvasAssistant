/**
 * CircuitBreaker Tests
 *
 * Tests the circuit breaker pattern for API resilience.
 */

import {
  CircuitBreaker,
  CircuitOpenError,
} from '../../src/layers/l2-daemon/resilience/CircuitBreaker';
import { Logger } from '../../src/layers/l0-utilities/Logger';

describe('CircuitBreaker', () => {
  let logger: Logger;
  let breaker: CircuitBreaker;

  beforeAll(() => {
    logger = new Logger({ enableConsole: false });
  });

  afterEach(() => {
    if (breaker) {
      breaker.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      breaker = new CircuitBreaker();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.isAllowing()).toBe(true);
    });

    it('should accept custom options', () => {
      breaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        maxResetTimeoutMs: 600000,
        useExponentialBackoff: true,
        perEndpoint: true,
        logger,
      });

      expect(breaker.getState()).toBe('closed');
    });

    it('should accept disabled state', () => {
      breaker = new CircuitBreaker({
        enabled: false,
        logger,
      });

      // Even with disabled, isAllowing should return true
      expect(breaker.isAllowing()).toBe(true);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 100, // Short for testing
        logger,
      });
    });

    it('should execute function when circuit is closed', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should record success on successful execution', async () => {
      await breaker.execute(() => Promise.resolve('success'));

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should record failure and re-throw on failed execution', async () => {
      const error = new Error('Test error');

      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow(
        'Test error'
      );
      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should open circuit after failure threshold', async () => {
      const error = new Error('Test error');

      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should reject requests when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      }

      expect(breaker.getState()).toBe('open');

      await expect(breaker.execute(() => Promise.resolve('success'))).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should allow request in half-open state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(breaker.getState()).toBe('half-open');

      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('should close circuit on success in half-open state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(breaker.getState()).toBe('half-open');

      await breaker.execute(() => Promise.resolve('success'));

      expect(breaker.getState()).toBe('closed');
    });

    it('should re-open circuit on failure in half-open state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(breaker.getState()).toBe('half-open');

      await breaker.execute(() => Promise.reject(new Error())).catch(() => {});

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('per-endpoint circuits', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
        perEndpoint: true,
        logger,
      });
    });

    it('should maintain separate circuits per endpoint', async () => {
      // Fail endpoint1
      for (let i = 0; i < 2; i++) {
        await breaker
          .execute(() => Promise.reject(new Error()), 'endpoint1')
          .catch(() => {});
      }

      expect(breaker.getState('endpoint1')).toBe('open');
      expect(breaker.getState('endpoint2')).toBe('closed');
    });

    it('should allow requests to healthy endpoints', async () => {
      // Open endpoint1
      for (let i = 0; i < 2; i++) {
        await breaker
          .execute(() => Promise.reject(new Error()), 'endpoint1')
          .catch(() => {});
      }

      // endpoint2 should still work
      const result = await breaker.execute(() => Promise.resolve('success'), 'endpoint2');
      expect(result).toBe('success');
    });

    it('should track status for each endpoint', async () => {
      await breaker.execute(() => Promise.resolve(), 'endpoint1');
      await breaker
        .execute(() => Promise.reject(new Error()), 'endpoint2')
        .catch(() => {});

      const status1 = breaker.getStatus('endpoint1');
      const status2 = breaker.getStatus('endpoint2');

      expect(status1.lastSuccess).toBeDefined();
      expect(status2.lastFailure).toBeDefined();
    });
  });

  describe('recordSuccess and recordFailure', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 100,
        logger,
      });
    });

    it('should reset failure count on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getFailureCount()).toBe(2);

      breaker.recordSuccess();
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should increment failure count on failure', () => {
      breaker.recordFailure();
      expect(breaker.getFailureCount()).toBe(1);

      breaker.recordFailure();
      expect(breaker.getFailureCount()).toBe(2);
    });
  });

  describe('forceOpen and forceClose', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        logger,
      });
    });

    it('should force circuit open', () => {
      expect(breaker.getState()).toBe('closed');

      breaker.forceOpen();

      expect(breaker.getState()).toBe('open');
      expect(breaker.isAllowing()).toBe(false);
    });

    it('should force circuit closed', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');

      breaker.forceClose();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.isAllowing()).toBe(true);
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should force open specific endpoint', () => {
      breaker = new CircuitBreaker({
        perEndpoint: true,
        logger,
      });

      breaker.forceOpen('specific-endpoint');

      expect(breaker.getState('specific-endpoint')).toBe('open');
      expect(breaker.getState()).toBe('closed'); // Global should be unaffected
    });
  });

  describe('exponential backoff', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
        maxResetTimeoutMs: 400,
        useExponentialBackoff: true,
        logger,
      });
    });

    it('should increase reset timeout on repeated failures', async () => {
      // First failure - opens circuit
      await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      expect(breaker.getState()).toBe('open');

      let status = breaker.getStatus();
      expect(status.resetTimeout).toBe(50);

      // Wait for half-open
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(breaker.getState()).toBe('half-open');

      // Fail again in half-open
      await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      expect(breaker.getState()).toBe('open');

      status = breaker.getStatus();
      expect(status.resetTimeout).toBe(100); // Doubled

      // Wait for half-open again
      await new Promise((resolve) => setTimeout(resolve, 110));
      expect(breaker.getState()).toBe('half-open');

      // Fail again
      await breaker.execute(() => Promise.reject(new Error())).catch(() => {});

      status = breaker.getStatus();
      expect(status.resetTimeout).toBe(200); // Doubled again
    });

    it('should cap reset timeout at max', async () => {
      // Trigger multiple failures to test cap
      for (let i = 0; i < 5; i++) {
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        if (breaker.getState() === 'half-open') {
          continue;
        }
        const status = breaker.getStatus();
        if (status.nextRetryAt) {
          await new Promise((resolve) =>
            setTimeout(resolve, status.nextRetryAt!.getTime() - Date.now() + 10)
          );
        }
      }

      const status = breaker.getStatus();
      expect(status.resetTimeout).toBeLessThanOrEqual(400);
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        logger,
      });
    });

    it('should return correct status structure', () => {
      const status = breaker.getStatus();

      expect(status).toHaveProperty('endpoint');
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('lastFailure');
      expect(status).toHaveProperty('lastSuccess');
      expect(status).toHaveProperty('resetTimeout');
      expect(status).toHaveProperty('nextRetryAt');
    });

    it('should update lastSuccess on success', () => {
      breaker.recordSuccess();
      const status = breaker.getStatus();

      expect(status.lastSuccess).toBeInstanceOf(Date);
    });

    it('should update lastFailure on failure', () => {
      breaker.recordFailure();
      const status = breaker.getStatus();

      expect(status.lastFailure).toBeInstanceOf(Date);
    });

    it('should calculate nextRetryAt when open', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }

      const status = breaker.getStatus();
      expect(status.state).toBe('open');
      expect(status.nextRetryAt).toBeInstanceOf(Date);
    });
  });

  describe('getAllStatuses', () => {
    it('should return all circuit statuses', () => {
      breaker = new CircuitBreaker({
        perEndpoint: true,
        endpoints: ['endpoint1', 'endpoint2'],
        logger,
      });

      const statuses = breaker.getAllStatuses();

      // Should have global + 2 endpoints
      expect(statuses.length).toBe(3);
      expect(statuses.some((s) => s.endpoint === 'global')).toBe(true);
      expect(statuses.some((s) => s.endpoint === 'endpoint1')).toBe(true);
      expect(statuses.some((s) => s.endpoint === 'endpoint2')).toBe(true);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        perEndpoint: true,
        failureThreshold: 2,
        resetTimeoutMs: 1000,
        logger,
      });
    });

    it('should reset all circuits', () => {
      // Open multiple circuits
      breaker.recordFailure('endpoint1');
      breaker.recordFailure('endpoint1');
      breaker.recordFailure('endpoint2');
      breaker.recordFailure('endpoint2');

      expect(breaker.getState('endpoint1')).toBe('open');
      expect(breaker.getState('endpoint2')).toBe('open');

      breaker.reset();

      expect(breaker.getState('endpoint1')).toBe('closed');
      expect(breaker.getState('endpoint2')).toBe('closed');
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('events', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 50,
        logger,
      });
    });

    it('should emit circuit-opened event', () => {
      const eventHandler = jest.fn();
      breaker.on('circuit-opened', eventHandler);

      breaker.recordFailure();
      breaker.recordFailure();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'global',
          failureCount: 2,
        })
      );
    });

    it('should emit circuit-half-open event', async () => {
      const eventHandler = jest.fn();
      breaker.on('circuit-half-open', eventHandler);

      breaker.recordFailure();
      breaker.recordFailure();

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'global',
        })
      );
    });

    it('should emit circuit-closed event', async () => {
      const eventHandler = jest.fn();
      breaker.on('circuit-closed', eventHandler);

      breaker.recordFailure();
      breaker.recordFailure();

      await new Promise((resolve) => setTimeout(resolve, 60));
      breaker.recordSuccess();

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit reset event', () => {
      const eventHandler = jest.fn();
      breaker.on('reset', eventHandler);

      breaker.reset();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('disabled mode', () => {
    it('should pass through all requests when disabled', async () => {
      breaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1,
        logger,
      });

      // Even after failures, should still execute
      await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
      await breaker.execute(() => Promise.reject(new Error())).catch(() => {});

      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });
  });

  describe('error type differentiation', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
        logger,
      });
    });

    describe('isTransientError', () => {
      it('should classify 500 server error as transient', () => {
        const error = { response: { status: 500 } };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify 502 bad gateway as transient', () => {
        const error = { response: { status: 502 } };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify 503 service unavailable as transient', () => {
        const error = { response: { status: 503 } };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify 504 gateway timeout as transient', () => {
        const error = { response: { status: 504 } };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify 429 rate limit as transient', () => {
        const error = { response: { status: 429 } };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify 401 unauthorized as non-transient', () => {
        const error = { response: { status: 401 } };
        expect(breaker.isTransientError(error)).toBe(false);
      });

      it('should classify 403 forbidden as non-transient', () => {
        const error = { response: { status: 403 } };
        expect(breaker.isTransientError(error)).toBe(false);
      });

      it('should classify 404 not found as non-transient', () => {
        const error = { response: { status: 404 } };
        expect(breaker.isTransientError(error)).toBe(false);
      });

      it('should classify 400 bad request as non-transient', () => {
        const error = { response: { status: 400 } };
        expect(breaker.isTransientError(error)).toBe(false);
      });

      it('should classify 422 unprocessable entity as non-transient', () => {
        const error = { response: { status: 422 } };
        expect(breaker.isTransientError(error)).toBe(false);
      });

      it('should classify ECONNREFUSED as transient', () => {
        const error = { code: 'ECONNREFUSED' };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify ETIMEDOUT as transient', () => {
        const error = { code: 'ETIMEDOUT' };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify ECONNRESET as transient', () => {
        const error = { code: 'ECONNRESET' };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify timeout message as transient', () => {
        const error = { message: 'Request timed out' };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify status on error directly', () => {
        const error = { status: 503 };
        expect(breaker.isTransientError(error)).toBe(true);
      });

      it('should classify direct 401 status as non-transient', () => {
        const error = { status: 401 };
        expect(breaker.isTransientError(error)).toBe(false);
      });

      it('should return true for null/undefined error', () => {
        expect(breaker.isTransientError(null)).toBe(true);
        expect(breaker.isTransientError(undefined)).toBe(true);
      });

      it('should return true for generic Error', () => {
        expect(breaker.isTransientError(new Error('Generic error'))).toBe(true);
      });
    });

    describe('recordFailure with error classification', () => {
      it('should not count 401 errors as failures', () => {
        const error = { response: { status: 401 } };

        breaker.recordFailure(undefined, error);
        breaker.recordFailure(undefined, error);

        expect(breaker.getFailureCount()).toBe(0);
        expect(breaker.getState()).toBe('closed');
      });

      it('should not count 404 errors as failures', () => {
        const error = { response: { status: 404 } };

        breaker.recordFailure(undefined, error);
        breaker.recordFailure(undefined, error);

        expect(breaker.getFailureCount()).toBe(0);
        expect(breaker.getState()).toBe('closed');
      });

      it('should count 500 errors as failures and open circuit', () => {
        const error = { response: { status: 500 } };

        breaker.recordFailure(undefined, error);
        breaker.recordFailure(undefined, error);

        expect(breaker.getFailureCount()).toBe(2);
        expect(breaker.getState()).toBe('open');
      });

      it('should count 503 errors as failures', () => {
        const error = { response: { status: 503 } };

        breaker.recordFailure(undefined, error);

        expect(breaker.getFailureCount()).toBe(1);
      });

      it('should count network errors as failures', () => {
        const error = { code: 'ECONNREFUSED' };

        breaker.recordFailure(undefined, error);
        breaker.recordFailure(undefined, error);

        expect(breaker.getFailureCount()).toBe(2);
        expect(breaker.getState()).toBe('open');
      });

      it('should count failures without error info (backward compat)', () => {
        breaker.recordFailure();
        breaker.recordFailure();

        expect(breaker.getFailureCount()).toBe(2);
        expect(breaker.getState()).toBe('open');
      });
    });

    describe('execute with error classification', () => {
      it('should not open circuit on 401 errors', async () => {
        const error = { response: { status: 401 } };

        for (let i = 0; i < 5; i++) {
          await breaker.execute(() => Promise.reject(error)).catch(() => {});
        }

        // Circuit should remain closed for auth errors
        expect(breaker.getState()).toBe('closed');
        expect(breaker.getFailureCount()).toBe(0);
      });

      it('should not open circuit on 403 errors', async () => {
        const error = { response: { status: 403 } };

        for (let i = 0; i < 5; i++) {
          await breaker.execute(() => Promise.reject(error)).catch(() => {});
        }

        expect(breaker.getState()).toBe('closed');
      });

      it('should not open circuit on 404 errors', async () => {
        const error = { response: { status: 404 } };

        for (let i = 0; i < 5; i++) {
          await breaker.execute(() => Promise.reject(error)).catch(() => {});
        }

        expect(breaker.getState()).toBe('closed');
      });

      it('should open circuit on 500 errors', async () => {
        const error = { response: { status: 500 } };

        await breaker.execute(() => Promise.reject(error)).catch(() => {});
        await breaker.execute(() => Promise.reject(error)).catch(() => {});

        expect(breaker.getState()).toBe('open');
      });

      it('should open circuit on network errors', async () => {
        const error = { code: 'ECONNREFUSED', message: 'Connection refused' };

        await breaker.execute(() => Promise.reject(error)).catch(() => {});
        await breaker.execute(() => Promise.reject(error)).catch(() => {});

        expect(breaker.getState()).toBe('open');
      });

      it('should still throw the error even if not counted', async () => {
        const error = { response: { status: 401 }, message: 'Unauthorized' };

        await expect(breaker.execute(() => Promise.reject(error))).rejects.toMatchObject({
          response: { status: 401 },
        });

        // Error was thrown but circuit not affected
        expect(breaker.getState()).toBe('closed');
      });
    });

    describe('mixed error scenarios', () => {
      it('should only count transient errors toward threshold', async () => {
        // Non-transient errors
        await breaker
          .execute(() => Promise.reject({ response: { status: 401 } }))
          .catch(() => {});
        await breaker
          .execute(() => Promise.reject({ response: { status: 404 } }))
          .catch(() => {});

        expect(breaker.getFailureCount()).toBe(0);

        // One transient error
        await breaker
          .execute(() => Promise.reject({ response: { status: 500 } }))
          .catch(() => {});

        expect(breaker.getFailureCount()).toBe(1);
        expect(breaker.getState()).toBe('closed');

        // Another transient error - should open
        await breaker
          .execute(() => Promise.reject({ response: { status: 503 } }))
          .catch(() => {});

        expect(breaker.getFailureCount()).toBe(2);
        expect(breaker.getState()).toBe('open');
      });

      it('should handle half-open state correctly with non-transient errors', async () => {
        // Open circuit with transient errors
        await breaker
          .execute(() => Promise.reject({ response: { status: 500 } }))
          .catch(() => {});
        await breaker
          .execute(() => Promise.reject({ response: { status: 500 } }))
          .catch(() => {});

        expect(breaker.getState()).toBe('open');

        // Wait for half-open
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(breaker.getState()).toBe('half-open');

        // Non-transient error in half-open should NOT reopen (doesn't count as failure)
        await breaker
          .execute(() => Promise.reject({ response: { status: 401 } }))
          .catch(() => {});

        // Should remain in half-open since 401 doesn't count
        expect(breaker.getState()).toBe('half-open');
      });
    });
  });
});
