/**
 * ResilienceWrapper Tests
 *
 * Tests for the unified resilience wrapper combining rate limiting and circuit breaking.
 */

import { ResilienceWrapper } from '../../src/layers/l2-daemon/ResilienceWrapper';
import { CircuitOpenError } from '../../src/layers/l2-daemon/CircuitBreaker';

describe('ResilienceWrapper', () => {
  let wrapper: ResilienceWrapper;

  beforeEach(() => {
    wrapper = new ResilienceWrapper({
      rateLimiter: {
        maxConcurrent: 3,
        minDelayMs: 10,
        maxRetries: 2,
      },
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 100,
      },
    });
  });

  afterEach(() => {
    wrapper.stop();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultWrapper = new ResilienceWrapper();
      expect(defaultWrapper).toBeDefined();
      defaultWrapper.stop();
    });

    it('should initialize with custom config', () => {
      const customWrapper = new ResilienceWrapper({
        rateLimiter: { maxConcurrent: 5 },
        circuitBreaker: { failureThreshold: 5 },
      });
      expect(customWrapper).toBeDefined();
      customWrapper.stop();
    });
  });

  describe('execute', () => {
    it('should execute successful requests', async () => {
      const result = await wrapper.execute(async () => 'success');

      expect(result).toBe('success');
    });

    it('should pass through errors from executed function', async () => {
      await expect(
        wrapper.execute(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });

    it('should reject immediately when circuit is open', async () => {
      // Force circuit open
      wrapper.forceOpen('test-endpoint');

      await expect(wrapper.execute(async () => 'success', 'test-endpoint')).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should allow requests when circuit is closed', async () => {
      const result = await wrapper.execute(async () => 'result', 'endpoint');

      expect(result).toBe('result');
    });

    it('should track failures through circuit breaker', async () => {
      // Execute failing requests
      for (let i = 0; i < 3; i++) {
        try {
          await wrapper.execute(
            async () => {
              throw new Error('failure');
            },
            'failing-endpoint'
          );
        } catch {
          // Expected to fail
        }
      }

      // Circuit should now be open
      const status = wrapper.getStatus('failing-endpoint');
      expect(status.circuitBreaker.failureCount).toBeGreaterThan(0);
    });

    it('should track successes through circuit breaker', async () => {
      await wrapper.execute(async () => 'success', 'endpoint');

      const status = wrapper.getStatus('endpoint');
      expect(status.circuitBreaker.state).toBe('closed');
    });

    it('should respect priority in rate limiter queue', async () => {
      const results: number[] = [];

      // Pause rate limiter to queue requests
      wrapper.getRateLimiter().pause();

      // Queue requests with different priorities
      const p1 = wrapper.execute(
        async () => {
          results.push(1);
          return 1;
        },
        'endpoint',
        1
      );
      const p2 = wrapper.execute(
        async () => {
          results.push(2);
          return 2;
        },
        'endpoint',
        10
      ); // Higher priority
      const p3 = wrapper.execute(
        async () => {
          results.push(3);
          return 3;
        },
        'endpoint',
        5
      );

      // Resume and let requests execute
      wrapper.getRateLimiter().resume();

      await Promise.all([p1, p2, p3]);

      // Higher priority should execute first
      expect(results[0]).toBe(2); // Priority 10
    });
  });

  describe('getStatus', () => {
    it('should return combined status', () => {
      const status = wrapper.getStatus();

      expect(status.rateLimiter).toBeDefined();
      expect(status.rateLimiter.queueLength).toBeDefined();
      expect(status.rateLimiter.activeRequests).toBeDefined();
      expect(status.rateLimiter.isPaused).toBeDefined();

      expect(status.circuitBreaker).toBeDefined();
      expect(status.circuitBreaker.state).toBeDefined();
      expect(status.circuitBreaker.failureCount).toBeDefined();

      expect(status.isAcceptingRequests).toBeDefined();
    });

    it('should report accepting requests when circuit closed and not paused', () => {
      const status = wrapper.getStatus();

      expect(status.isAcceptingRequests).toBe(true);
    });

    it('should report not accepting requests when circuit open', () => {
      wrapper.forceOpen();

      const status = wrapper.getStatus();

      expect(status.circuitBreaker.state).toBe('open');
      expect(status.isAcceptingRequests).toBe(false);
    });
  });

  describe('isAcceptingRequests', () => {
    it('should return true when accepting', () => {
      expect(wrapper.isAcceptingRequests()).toBe(true);
    });

    it('should return false when circuit open', () => {
      wrapper.forceOpen();

      expect(wrapper.isAcceptingRequests()).toBe(false);
    });
  });

  describe('updateRateLimit', () => {
    it('should update rate limiter', () => {
      wrapper.updateRateLimit(500);

      // This should affect rate limiter internal state
      // We can verify by checking the status doesn't throw
      expect(() => wrapper.getStatus()).not.toThrow();
    });
  });

  describe('getRateLimiter', () => {
    it('should return the rate limiter instance', () => {
      const rl = wrapper.getRateLimiter();

      expect(rl).toBeDefined();
      expect(typeof rl.enqueue).toBe('function');
    });
  });

  describe('getCircuitBreaker', () => {
    it('should return the circuit breaker instance', () => {
      const cb = wrapper.getCircuitBreaker();

      expect(cb).toBeDefined();
      expect(typeof cb.isAllowing).toBe('function');
    });
  });

  describe('forceOpen', () => {
    it('should force circuit open', () => {
      wrapper.forceOpen();

      const status = wrapper.getStatus();
      expect(status.circuitBreaker.state).toBe('open');
    });

    it('should force circuit open for specific endpoint', () => {
      wrapper.forceOpen('specific-endpoint');

      const status = wrapper.getStatus('specific-endpoint');
      expect(status.circuitBreaker.state).toBe('open');
    });
  });

  describe('forceClose', () => {
    it('should force circuit closed', () => {
      wrapper.forceOpen();
      wrapper.forceClose();

      const status = wrapper.getStatus();
      expect(status.circuitBreaker.state).toBe('closed');
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker and resume rate limiter', () => {
      wrapper.forceOpen();
      wrapper.getRateLimiter().pause();

      wrapper.reset();

      const status = wrapper.getStatus();
      expect(status.circuitBreaker.state).toBe('closed');
      expect(status.rateLimiter.isPaused).toBe(false);
    });
  });

  describe('clearQueue', () => {
    it('should clear rate limiter queue', () => {
      wrapper.getRateLimiter().pause();

      // Queue some requests (they won't execute because paused)
      wrapper.execute(async () => 'test').catch(() => {});
      wrapper.execute(async () => 'test').catch(() => {});

      wrapper.clearQueue();

      const status = wrapper.getStatus();
      expect(status.rateLimiter.queueLength).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop without error', () => {
      expect(() => wrapper.stop()).not.toThrow();
    });

    it('should stop even when called multiple times', () => {
      wrapper.stop();
      expect(() => wrapper.stop()).not.toThrow();
    });
  });

  describe('event coordination', () => {
    it('should emit circuit-opened event', (done) => {
      wrapper.on('circuit-opened', ({ endpoint }) => {
        // Global circuit uses 'global' as the endpoint identifier
        expect(endpoint).toBe('global');
        done();
      });

      wrapper.forceOpen();
    });

    it('should emit circuit-closed event', (done) => {
      wrapper.forceOpen();

      wrapper.on('circuit-closed', () => {
        done();
      });

      wrapper.forceClose();
    });

    it('should pause rate limiter when circuit opens', () => {
      wrapper.forceOpen();

      const status = wrapper.getStatus();
      expect(status.rateLimiter.isPaused).toBe(true);
    });

    it('should resume rate limiter when circuit closes', () => {
      wrapper.forceOpen();
      wrapper.forceClose();

      const status = wrapper.getStatus();
      expect(status.rateLimiter.isPaused).toBe(false);
    });
  });
});
