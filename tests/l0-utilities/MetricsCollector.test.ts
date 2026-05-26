/**
 * MetricsCollector Tests
 *
 * Tests the metrics collection and persistence system.
 */

import fs from 'fs';
import path from 'path';
import {
  MetricsCollector,
  MetricsSummary,
} from '../../src/layers/l0-utilities/MetricsCollector';
import { Logger } from '../../src/layers/l0-utilities/Logger';

// Test directory for metrics database
const TEST_DIR = path.join(__dirname, '../temp-metrics');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-metrics.db');

describe('MetricsCollector', () => {
  let logger: Logger;
  let collector: MetricsCollector;

  beforeAll(() => {
    // Setup test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    logger = new Logger({ enableConsole: false, logDir: TEST_DIR });
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Remove test database before each test
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  afterEach(() => {
    if (collector) {
      collector.close();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });

      expect(collector).toBeDefined();
    });

    it('should accept custom options', () => {
      collector = new MetricsCollector({
        enabled: true,
        aggregationIntervalMs: 30000,
        retentionDays: 30,
        dbPath: TEST_DB_PATH,
        emitEvents: true,
        logger,
      });

      expect(collector).toBeDefined();
    });

    it('should not initialize database when disabled', () => {
      collector = new MetricsCollector({
        enabled: false,
        dbPath: TEST_DB_PATH,
        logger,
      });

      // Database file should not exist
      expect(fs.existsSync(TEST_DB_PATH)).toBe(false);
    });

    it('should create database file when enabled', () => {
      collector = new MetricsCollector({
        enabled: true,
        dbPath: TEST_DB_PATH,
        logger,
      });

      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    });
  });

  describe('increment', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should increment a counter', () => {
      collector.increment('api.requests');

      expect(collector.getCounter('api.requests')).toBe(1);
    });

    it('should increment by custom value', () => {
      collector.increment('api.requests', 5);

      expect(collector.getCounter('api.requests')).toBe(5);
    });

    it('should accumulate multiple increments', () => {
      collector.increment('api.requests');
      collector.increment('api.requests');
      collector.increment('api.requests', 3);

      expect(collector.getCounter('api.requests')).toBe(5);
    });

    it('should track multiple counters independently', () => {
      collector.increment('requests.success', 10);
      collector.increment('requests.failure', 2);

      expect(collector.getCounter('requests.success')).toBe(10);
      expect(collector.getCounter('requests.failure')).toBe(2);
    });
  });

  describe('setGauge', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should set a gauge value', () => {
      collector.setGauge('memory.used', 512);

      expect(collector.getGauge('memory.used')).toBe(512);
    });

    it('should overwrite previous gauge value', () => {
      collector.setGauge('memory.used', 512);
      collector.setGauge('memory.used', 768);

      expect(collector.getGauge('memory.used')).toBe(768);
    });

    it('should track multiple gauges independently', () => {
      collector.setGauge('memory.used', 512);
      collector.setGauge('cpu.percent', 45);

      expect(collector.getGauge('memory.used')).toBe(512);
      expect(collector.getGauge('cpu.percent')).toBe(45);
    });
  });

  describe('recordTiming', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should record a timing', () => {
      collector.recordTiming('api.latency', 150);

      const timing = collector.getTiming('api.latency');
      expect(timing?.count).toBe(1);
      expect(timing?.avg).toBe(150);
    });

    it('should calculate timing statistics', () => {
      collector.recordTiming('api.latency', 100);
      collector.recordTiming('api.latency', 200);
      collector.recordTiming('api.latency', 300);

      const timing = collector.getTiming('api.latency');
      expect(timing?.count).toBe(3);
      expect(timing?.avg).toBe(200);
      expect(timing?.min).toBe(100);
      expect(timing?.max).toBe(300);
    });

    it('should track multiple timings independently', () => {
      collector.recordTiming('api.latency', 100);
      collector.recordTiming('db.query', 50);

      expect(collector.getTiming('api.latency')?.avg).toBe(100);
      expect(collector.getTiming('db.query')?.avg).toBe(50);
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should return all metrics summary', () => {
      collector.increment('requests', 10);
      collector.setGauge('memory', 512);
      collector.recordTiming('latency', 100);

      const summary = collector.getSummary();

      expect(summary.counters.requests).toBe(10);
      expect(summary.gauges.memory).toBe(512);
      expect(summary.timings.latency.avg).toBe(100);
    });

    it('should return empty summary when no metrics', () => {
      const summary = collector.getSummary();

      expect(Object.keys(summary.counters)).toHaveLength(0);
      expect(Object.keys(summary.gauges)).toHaveLength(0);
      expect(Object.keys(summary.timings)).toHaveLength(0);
    });
  });

  describe('getSuccessRate', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should calculate success rate', () => {
      collector.increment('requests.success', 90);
      collector.increment('requests.total', 100);

      const rate = collector.getSuccessRate('requests.success', 'requests.total');
      expect(rate).toBe(0.9);
    });

    it('should return 1 when no requests', () => {
      const rate = collector.getSuccessRate('requests.success', 'requests.total');
      expect(rate).toBe(1);
    });

    it('should handle zero success', () => {
      collector.increment('requests.total', 100);

      const rate = collector.getSuccessRate('requests.success', 'requests.total');
      expect(rate).toBe(0);
    });
  });

  describe('flush', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should persist metrics to database', () => {
      collector.increment('api.requests', 10);
      collector.setGauge('memory', 512);
      collector.recordTiming('latency', 100);

      collector.flush();

      // Query the database to verify
      const results = collector.queryMetrics('api.requests');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should clear buffers after flush', () => {
      collector.increment('counter1', 5);
      collector.flush();

      // Recent values should still be there
      expect(collector.getCounter('counter1')).toBe(5);

      // Buffer is cleared, so second flush without new data writes nothing new
      collector.flush();
      const results = collector.queryMetrics('counter1');
      // First flush writes the value, second flush writes nothing (empty buffer)
      expect(results.length).toBe(1);
    });
  });

  describe('queryMetrics', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should query metrics by name', () => {
      collector.increment('api.requests', 10);
      collector.flush();

      const results = collector.queryMetrics('api.requests');

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('api.requests');
      expect(results[0].sum).toBe(10);
    });

    it('should support date range queries', () => {
      collector.increment('api.requests', 10);
      collector.flush();

      const since = new Date(Date.now() - 60000);
      const until = new Date(Date.now() + 60000);

      const results = collector.queryMetrics('api.requests', { since, until });

      expect(results.length).toBe(1);
    });

    it('should return empty array for non-existent metrics', () => {
      const results = collector.queryMetrics('non.existent');

      expect(results).toEqual([]);
    });

    it('should limit results', () => {
      // Create multiple entries
      for (let i = 0; i < 5; i++) {
        collector.increment('api.requests', 1);
        collector.flush();
      }

      const results = collector.queryMetrics('api.requests', { limit: 3 });

      expect(results.length).toBe(3);
    });
  });

  describe('purgeOldMetrics', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        retentionDays: 90,
        logger,
      });
    });

    it('should purge metrics based on retention period', () => {
      // Add some metrics
      collector.increment('test.metric', 10);
      collector.flush();

      // Purge with 90 days retention (should not purge recent data)
      const purged = collector.purgeOldMetrics(90);

      // Recent metrics should not be purged
      expect(purged).toBe(0);

      // Verify metrics are still there
      const results = collector.queryMetrics('test.metric');
      expect(results.length).toBe(1);
    });

    it('should return 0 when nothing to purge', () => {
      const purged = collector.purgeOldMetrics(90);

      expect(purged).toBe(0);
    });
  });

  describe('start and stop', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        aggregationIntervalMs: 50, // Short interval for testing
        logger,
      });
    });

    it('should start periodic flushing', async () => {
      collector.increment('test.metric', 1);
      collector.start();

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      collector.stop();

      const results = collector.queryMetrics('test.metric');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should stop periodic flushing', async () => {
      collector.start();
      collector.stop();

      // Add metric after stop
      collector.increment('after.stop', 1);

      // Wait to ensure no auto-flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = collector.queryMetrics('after.stop');
      expect(results.length).toBe(0); // Not flushed automatically
    });

    it('should flush remaining metrics on stop', () => {
      collector.increment('final.metric', 1);
      collector.start();
      collector.stop();

      const results = collector.queryMetrics('final.metric');
      expect(results.length).toBe(1);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should reset all in-memory metrics', () => {
      collector.increment('counter', 10);
      collector.setGauge('gauge', 50);
      collector.recordTiming('timing', 100);

      collector.reset();

      expect(collector.getCounter('counter')).toBe(0);
      expect(collector.getGauge('gauge')).toBeUndefined();
      expect(collector.getTiming('timing')).toBeUndefined();
    });
  });

  describe('getDatabaseSize', () => {
    it('should return database size', () => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        logger,
      });

      collector.increment('test', 1);
      collector.flush();

      const size = collector.getDatabaseSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should return 0 for non-existent database', () => {
      collector = new MetricsCollector({
        enabled: false,
        dbPath: path.join(TEST_DIR, 'nonexistent.db'),
        logger,
      });

      const size = collector.getDatabaseSize();
      expect(size).toBe(0);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        dbPath: TEST_DB_PATH,
        emitEvents: true,
        logger,
      });
    });

    it('should emit counter event', () => {
      const eventHandler = jest.fn();
      collector.on('counter', eventHandler);

      collector.increment('test.counter', 5);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test.counter',
          value: 5,
        })
      );
    });

    it('should emit gauge event', () => {
      const eventHandler = jest.fn();
      collector.on('gauge', eventHandler);

      collector.setGauge('test.gauge', 100);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test.gauge',
          value: 100,
        })
      );
    });

    it('should emit timing event', () => {
      const eventHandler = jest.fn();
      collector.on('timing', eventHandler);

      collector.recordTiming('test.timing', 50);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test.timing',
          value: 50,
        })
      );
    });

    it('should emit flush event', () => {
      const eventHandler = jest.fn();
      collector.on('flush', eventHandler);

      collector.flush();

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit started event', () => {
      const eventHandler = jest.fn();
      collector.on('started', eventHandler);

      collector.start();

      expect(eventHandler).toHaveBeenCalled();
      collector.stop();
    });

    it('should emit stopped event', () => {
      const eventHandler = jest.fn();
      collector.on('stopped', eventHandler);

      collector.start();
      collector.stop();

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit reset event', () => {
      const eventHandler = jest.fn();
      collector.on('reset', eventHandler);

      collector.reset();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('disabled mode', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        enabled: false,
        dbPath: TEST_DB_PATH,
        logger,
      });
    });

    it('should not record metrics when disabled', () => {
      collector.increment('test', 10);
      collector.setGauge('gauge', 50);
      collector.recordTiming('timing', 100);

      // All getters should return default values
      expect(collector.getCounter('test')).toBe(0);
      expect(collector.getGauge('gauge')).toBeUndefined();
      expect(collector.getTiming('timing')).toBeUndefined();
    });

    it('should not flush when disabled', () => {
      collector.increment('test', 10);
      collector.flush();

      // No database operations should occur
      expect(fs.existsSync(TEST_DB_PATH)).toBe(false);
    });
  });
});
