/**
 * HousekeepingManager Tests
 *
 * Tests the cleanup and maintenance system for logs, metrics, and databases.
 */

import fs from 'fs';
import path from 'path';
import { HousekeepingManager } from '../../src/layers/l0-utilities/HousekeepingManager';
import { MetricsCollector } from '../../src/layers/l0-utilities/MetricsCollector';
import { Logger } from '../../src/layers/l0-utilities/Logger';

// Test directories
const TEST_DIR = path.join(__dirname, '../temp-housekeeping');
const TEST_LOG_DIR = path.join(TEST_DIR, 'logs');
const TEST_DATA_DIR = path.join(TEST_DIR, 'data');
const TEST_TEMP_DIR = path.join(TEST_DATA_DIR, 'temp');
const TEST_CACHE_DIR = path.join(TEST_DATA_DIR, 'cache');

describe('HousekeepingManager', () => {
  let logger: Logger;
  let manager: HousekeepingManager;

  beforeAll(() => {
    // Create test directories
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });

    logger = new Logger({
      enableConsole: false,
      logDir: TEST_LOG_DIR,
      format: 'text',
      directoryStructure: {
        useStructuredDirs: false,
        currentWeekDays: 7,
        retentionWeeks: 13,
      },
    });
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear test directories before each test (rmSync handles nested dirs from Logger)
    [TEST_LOG_DIR, TEST_TEMP_DIR, TEST_CACHE_DIR].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      manager = new HousekeepingManager();

      const stats = manager.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.lastRun).toBeNull();
    });

    it('should accept custom options', () => {
      manager = new HousekeepingManager({
        enabled: true,
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        schedule: {
          runAt: '04:00',
          runOnStartup: false,
        },
        retention: {
          logsDays: 14,
          metricsDays: 30,
          tempFileHours: 12,
          syncCacheDays: 3,
        },
        database: {
          vacuumFrequency: 'daily',
          walCheckpointOnClose: true,
        },
        diskSpaceWarningMb: 1000,
        logger,
      });

      const stats = manager.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.scheduleRunAt).toBe('04:00');
    });

    it('should accept disabled state', () => {
      manager = new HousekeepingManager({
        enabled: false,
        logger,
      });

      const stats = manager.getStats();
      expect(stats.enabled).toBe(false);
    });
  });

  describe('cleanupOldLogs', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        retention: {
          logsDays: 7,
        },
        logger,
      });
    });

    it('should delete log files older than retention period', async () => {
      // Create old log file
      const oldLogPath = path.join(TEST_LOG_DIR, 'old.log');
      fs.writeFileSync(oldLogPath, 'old log content');
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      fs.utimesSync(oldLogPath, oldDate, oldDate);

      // Create new log file
      const newLogPath = path.join(TEST_LOG_DIR, 'new.log');
      fs.writeFileSync(newLogPath, 'new log content');

      const result = await manager.cleanupOldLogs();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(fs.existsSync(oldLogPath)).toBe(false);
      expect(fs.existsSync(newLogPath)).toBe(true);
    });

    it('should cleanup compressed log files', async () => {
      const oldLogPath = path.join(TEST_LOG_DIR, 'old.log.gz');
      fs.writeFileSync(oldLogPath, 'compressed content');
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldLogPath, oldDate, oldDate);

      const result = await manager.cleanupOldLogs();

      expect(result.success).toBe(true);
      expect(fs.existsSync(oldLogPath)).toBe(false);
    });

    it('should not delete non-log files', async () => {
      const txtPath = path.join(TEST_LOG_DIR, 'readme.txt');
      fs.writeFileSync(txtPath, 'readme content');
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      fs.utimesSync(txtPath, oldDate, oldDate);

      const result = await manager.cleanupOldLogs();

      expect(result.itemsProcessed).toBe(0);
      expect(fs.existsSync(txtPath)).toBe(true);
    });
  });

  describe('cleanupTempFiles', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        retention: {
          tempFileHours: 24,
        },
        logger,
      });
    });

    it('should delete temp files older than retention period', async () => {
      // Create old temp file
      const oldTempPath = path.join(TEST_TEMP_DIR, 'old.tmp');
      fs.writeFileSync(oldTempPath, 'old temp content');
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      fs.utimesSync(oldTempPath, oldDate, oldDate);

      // Create new temp file
      const newTempPath = path.join(TEST_TEMP_DIR, 'new.tmp');
      fs.writeFileSync(newTempPath, 'new temp content');

      const result = await manager.cleanupTempFiles();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(fs.existsSync(oldTempPath)).toBe(false);
      expect(fs.existsSync(newTempPath)).toBe(true);
    });
  });

  describe('cleanupSyncCache', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        retention: {
          syncCacheDays: 7,
        },
        logger,
      });
    });

    it('should delete cache files older than retention period', async () => {
      // Create old cache file
      const oldCachePath = path.join(TEST_CACHE_DIR, 'old.cache');
      fs.writeFileSync(oldCachePath, 'old cache content');
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      fs.utimesSync(oldCachePath, oldDate, oldDate);

      // Create new cache file
      const newCachePath = path.join(TEST_CACHE_DIR, 'new.cache');
      fs.writeFileSync(newCachePath, 'new cache content');

      const result = await manager.cleanupSyncCache();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(fs.existsSync(oldCachePath)).toBe(false);
      expect(fs.existsSync(newCachePath)).toBe(true);
    });
  });

  describe('cleanupMetrics', () => {
    it('should purge old metrics when collector provided', async () => {
      const metricsCollector = new MetricsCollector({
        dbPath: path.join(TEST_DATA_DIR, 'metrics.db'),
        retentionDays: 90,
        logger,
      });

      manager = new HousekeepingManager(
        {
          logDir: TEST_LOG_DIR,
          dataDir: TEST_DATA_DIR,
          retention: {
            metricsDays: 30,
          },
          logger,
        },
        logger,
        metricsCollector
      );

      // Add some metrics
      metricsCollector.increment('test.metric', 1);
      metricsCollector.flush();

      const result = await manager.cleanupMetrics();

      expect(result.success).toBe(true);
      metricsCollector.close();
    });

    it('should succeed when no collector provided', async () => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        logger,
      });

      const result = await manager.cleanupMetrics();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(0);
    });
  });

  describe('runCleanup', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        retention: {
          logsDays: 7,
          tempFileHours: 24,
          syncCacheDays: 7,
        },
        logger,
      });
    });

    it('should run all cleanup tasks', async () => {
      const report = await manager.runCleanup();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('results');
      expect(report).toHaveProperty('totalBytesFreed');
      expect(report).toHaveProperty('warnings');
      expect(report).toHaveProperty('diskSpaceStatus');

      // Should have results for each task
      const taskNames = report.results.map((r) => r.task);
      expect(taskNames).toContain('cleanup-logs');
      expect(taskNames).toContain('cleanup-metrics');
      expect(taskNames).toContain('cleanup-temp');
      expect(taskNames).toContain('cleanup-sync-cache');
    });

    it('should update lastRun after cleanup', async () => {
      expect(manager.getStats().lastRun).toBeNull();

      await manager.runCleanup();

      expect(manager.getStats().lastRun).toBeInstanceOf(Date);
    });

    it('should calculate total bytes freed', async () => {
      // Create files to delete
      const oldLogPath = path.join(TEST_LOG_DIR, 'old.log');
      fs.writeFileSync(oldLogPath, 'x'.repeat(1000)); // 1000 bytes
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldLogPath, oldDate, oldDate);

      const report = await manager.runCleanup();

      expect(report.totalBytesFreed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('forceCleanup', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        logger,
      });
    });

    it('should trigger immediate cleanup', async () => {
      const report = await manager.forceCleanup();

      expect(report).toHaveProperty('timestamp');
      expect(report.results.length).toBeGreaterThan(0);
    });
  });

  describe('estimateCleanup', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        retention: {
          logsDays: 7,
          tempFileHours: 24,
          syncCacheDays: 7,
        },
        logger,
      });
    });

    it('should estimate cleanup without deleting', async () => {
      // Create files
      const oldLogPath = path.join(TEST_LOG_DIR, 'old.log');
      fs.writeFileSync(oldLogPath, 'x'.repeat(500));
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldLogPath, oldDate, oldDate);

      const estimate = await manager.estimateCleanup();

      expect(estimate.logs.count).toBe(1);
      expect(estimate.logs.bytes).toBe(500);
      expect(estimate.total).toBeGreaterThanOrEqual(500);

      // File should still exist
      expect(fs.existsSync(oldLogPath)).toBe(true);
    });
  });

  describe('checkDiskSpace', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        diskSpaceWarningMb: 500,
        logger,
      });
    });

    it('should return disk space status', () => {
      const status = manager.checkDiskSpace();

      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('isLow');
      expect(status).toHaveProperty('warningThreshold');
      expect(typeof status.available).toBe('number');
      expect(typeof status.isLow).toBe('boolean');
    });
  });

  describe('start and stop', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        enabled: true,
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        schedule: {
          runAt: '03:00',
          runOnStartup: false,
        },
        logger,
      });
    });

    it('should start scheduler', () => {
      const startedHandler = jest.fn();
      manager.on('started', startedHandler);

      manager.start();

      expect(startedHandler).toHaveBeenCalled();
    });

    it('should stop scheduler', () => {
      const stoppedHandler = jest.fn();
      manager.on('stopped', stoppedHandler);

      manager.start();
      manager.stop();

      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('should not start when disabled', () => {
      manager = new HousekeepingManager({
        enabled: false,
        logger,
      });

      const startedHandler = jest.fn();
      manager.on('started', startedHandler);

      manager.start();

      expect(startedHandler).not.toHaveBeenCalled();
    });

    it('should run on startup when configured', async () => {
      manager = new HousekeepingManager({
        enabled: true,
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        schedule: {
          runAt: '03:00',
          runOnStartup: true,
        },
        logger,
      });

      const cleanupHandler = jest.fn();
      manager.on('cleanup-complete', cleanupHandler);

      manager.start();

      // Wait for startup cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cleanupHandler).toHaveBeenCalled();
      manager.stop();
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        enabled: true,
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        schedule: {
          runAt: '03:00',
        },
        logger,
      });
    });

    it('should return current stats', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('lastRun');
      expect(stats).toHaveProperty('lastVacuum');
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('scheduleRunAt');
    });

    it('should update lastRun after cleanup', async () => {
      expect(manager.getStats().lastRun).toBeNull();

      await manager.runCleanup();

      const stats = manager.getStats();
      expect(stats.lastRun).toBeInstanceOf(Date);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        logger,
      });
    });

    it('should emit cleanup-started event', async () => {
      const eventHandler = jest.fn();
      manager.on('cleanup-started', eventHandler);

      await manager.runCleanup();

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit cleanup-complete event', async () => {
      const eventHandler = jest.fn();
      manager.on('cleanup-complete', eventHandler);

      await manager.runCleanup();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
          results: expect.any(Array),
        })
      );
    });

    it('should emit disk-space-warning event when low', async () => {
      // Create manager with very high threshold to trigger warning
      manager = new HousekeepingManager({
        logDir: TEST_LOG_DIR,
        dataDir: TEST_DATA_DIR,
        diskSpaceWarningMb: Number.MAX_SAFE_INTEGER / 1024 / 1024, // Unrealistic threshold
        logger,
      });

      const eventHandler = jest.fn();
      manager.on('disk-space-warning', eventHandler);

      await manager.runCleanup();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle missing directories gracefully', async () => {
      manager = new HousekeepingManager({
        logDir: path.join(TEST_DIR, 'nonexistent-logs'),
        dataDir: path.join(TEST_DIR, 'nonexistent-data'),
        logger,
      });

      const report = await manager.runCleanup();

      // Should complete without throwing
      expect(report).toBeDefined();
      report.results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });
  });
});
