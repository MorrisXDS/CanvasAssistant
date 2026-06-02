/**
 * Tests for Layer 2 Daemon Configuration
 */

import {
  DEFAULT_DAEMON_CONFIG,
  type DaemonConfig,
} from '../../src/layers/l2-daemon/DaemonConfig';

describe('DaemonConfig', () => {
  describe('DEFAULT_DAEMON_CONFIG', () => {
    test('canvasApi defaults are sensible', () => {
      const api = DEFAULT_DAEMON_CONFIG.canvasApi;
      expect(api.timeoutMs).toBe(30000);
      expect(api.pageSize).toBe(100);
      expect(api.defaultRateLimit).toBe(700);
    });

    test('rateLimiter defaults are sensible', () => {
      const rl = DEFAULT_DAEMON_CONFIG.rateLimiter;
      expect(rl.maxConcurrent).toBeGreaterThan(0);
      expect(rl.minDelayMs).toBeGreaterThan(0);
      expect(rl.maxRetries).toBeGreaterThanOrEqual(0);
      expect(rl.baseBackoffMs).toBeGreaterThan(0);
      expect(rl.maxBackoffMs).toBeGreaterThanOrEqual(rl.baseBackoffMs);
    });

    test('circuitBreaker defaults are sensible', () => {
      const cb = DEFAULT_DAEMON_CONFIG.circuitBreaker;
      expect(cb.enabled).toBe(true);
      expect(cb.failureThreshold).toBeGreaterThan(0);
      expect(cb.resetTimeoutMs).toBeGreaterThan(0);
      expect(cb.maxResetTimeoutMs).toBeGreaterThanOrEqual(cb.resetTimeoutMs);
    });

    test('sync priorities are valid', () => {
      const sync = DEFAULT_DAEMON_CONFIG.sync;
      expect(sync.coursePriority).toBeGreaterThan(0);
      expect(sync.taskPriority).toBeGreaterThan(0);
      expect(sync.defaultPriority).toBeGreaterThan(0);
    });

    test('htmlContentSync defaults are sensible', () => {
      const hcs = DEFAULT_DAEMON_CONFIG.htmlContentSync;
      expect(hcs.enabled).toBe(true);
      expect(hcs.urlRewriting).toBe('local');
      expect(hcs.maxConcurrentDownloads).toBeGreaterThan(0);
    });

    test('inputValidator defaults are sensible', () => {
      const iv = DEFAULT_DAEMON_CONFIG.inputValidator;
      expect(['strict', 'lenient']).toContain(iv.strictness);
      expect(['strip', 'sanitize', 'keep']).toContain(iv.htmlHandling);
    });
  });

  describe('Type structure', () => {
    test('DaemonConfig has all expected sections', () => {
      const config: DaemonConfig = DEFAULT_DAEMON_CONFIG;
      expect(config).toHaveProperty('canvasApi');
      expect(config).toHaveProperty('rateLimiter');
      expect(config).toHaveProperty('circuitBreaker');
      expect(config).toHaveProperty('sync');
      expect(config).toHaveProperty('htmlContentSync');
      expect(config).toHaveProperty('inputValidator');
    });

    test('circuitBreaker endpoints is an array', () => {
      expect(Array.isArray(DEFAULT_DAEMON_CONFIG.circuitBreaker.endpoints)).toBe(true);
      expect(DEFAULT_DAEMON_CONFIG.circuitBreaker.endpoints.length).toBeGreaterThan(0);
    });
  });
});
