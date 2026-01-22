/**
 * HealthCheck Tests
 *
 * Tests the health monitoring system with configurable probes.
 */

import { HealthCheck, HealthProbe, HealthStatus, HealthReport } from '../../src/layers/l0-utilities/HealthCheck';
import { Logger } from '../../src/layers/l0-utilities/Logger';

describe('HealthCheck', () => {
  let logger: Logger;
  let healthCheck: HealthCheck;

  beforeAll(() => {
    logger = new Logger({ enableConsole: false });
  });

  afterEach(() => {
    if (healthCheck) {
      healthCheck.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      healthCheck = new HealthCheck();
      const report = healthCheck.getStatus();

      expect(report.overallStatus).toBe('healthy');
      expect(report.probes).toBeDefined();
    });

    it('should accept custom options', () => {
      healthCheck = new HealthCheck({
        enabled: true,
        intervalMs: 30000,
        runOnStartup: false,
        thresholds: {
          dbLatencyMs: 100,
          memoryMb: 200,
          apiFailures: 5,
          diskSpaceMb: 1000,
        },
        logger,
      });

      // Verify it's initialized and can start
      expect(healthCheck.isActive()).toBe(false);
      healthCheck.start();
      expect(healthCheck.isActive()).toBe(true);
    });

    it('should accept disabled state', () => {
      healthCheck = new HealthCheck({
        enabled: false,
        logger,
      });

      // When disabled, start() should not activate the health check
      healthCheck.start();
      expect(healthCheck.isActive()).toBe(false);
    });
  });

  describe('registerProbe', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        logger,
      });
    });

    it('should register a custom probe', async () => {
      const probe: HealthProbe = {
        name: 'test-probe',
        check: () => 'healthy',
      };

      healthCheck.registerProbe(probe);
      // Need to run checks to populate results
      await healthCheck.runChecks();
      const report = healthCheck.getStatus();

      expect(report.probes.some(p => p.name === 'test-probe')).toBe(true);
    });

    it('should support async probe checks', async () => {
      const probe: HealthProbe = {
        name: 'async-probe',
        check: async (): Promise<HealthStatus> => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'healthy';
        },
      };

      healthCheck.registerProbe(probe);
      await healthCheck.runChecks();
      const report = healthCheck.getStatus();

      const probeResult = report.probes.find(p => p.name === 'async-probe');
      expect(probeResult?.status).toBe('healthy');
    });

    it('should allow recommended actions', async () => {
      const probe: HealthProbe = {
        name: 'action-probe',
        check: () => 'degraded',
        recommendedAction: 'Restart the service',
      };

      healthCheck.registerProbe(probe);
      await healthCheck.runChecks();
      const report = healthCheck.getStatus();

      // Recommendations include probe name prefix
      expect(report.recommendations.some(r => r.includes('Restart the service'))).toBe(true);
    });
  });

  describe('unregisterProbe', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        logger,
      });
    });

    it('should remove a registered probe', async () => {
      const probe: HealthProbe = {
        name: 'removable-probe',
        check: () => 'healthy',
      };

      healthCheck.registerProbe(probe);
      await healthCheck.runChecks();
      expect(healthCheck.getStatus().probes.some(p => p.name === 'removable-probe')).toBe(true);

      healthCheck.unregisterProbe('removable-probe');
      // After unregistering, next run won't include the probe
      await healthCheck.runChecks();
      expect(healthCheck.getStatus().probes.some(p => p.name === 'removable-probe')).toBe(false);
    });
  });

  describe('runChecks', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        logger,
      });
    });

    it('should run all registered probes', async () => {
      const probeChecked = jest.fn().mockReturnValue('healthy');

      healthCheck.registerProbe({
        name: 'check-probe',
        check: probeChecked,
      });

      await healthCheck.runChecks();

      expect(probeChecked).toHaveBeenCalled();
    });

    it('should return a health report', async () => {
      const report = await healthCheck.runChecks();

      expect(report).toHaveProperty('overallStatus');
      expect(report).toHaveProperty('probes');
      expect(report).toHaveProperty('lastChecked');
      expect(report).toHaveProperty('recommendations');
    });

    it('should update lastChecked timestamp', async () => {
      const beforeCheck = new Date();
      await healthCheck.runChecks();
      const report = healthCheck.getStatus();
      const afterCheck = new Date();

      expect(report.lastChecked.getTime()).toBeGreaterThanOrEqual(beforeCheck.getTime());
      expect(report.lastChecked.getTime()).toBeLessThanOrEqual(afterCheck.getTime());
    });

    it('should handle probe errors gracefully', async () => {
      healthCheck.registerProbe({
        name: 'error-probe',
        check: () => {
          throw new Error('Probe failed');
        },
      });

      const report = await healthCheck.runChecks();
      const errorProbe = report.probes.find(p => p.name === 'error-probe');

      expect(errorProbe?.status).toBe('unhealthy');
      expect(errorProbe?.error).toBeDefined();
    });
  });

  describe('overall status calculation', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        logger,
      });
    });

    it('should be healthy when all probes are healthy', async () => {
      healthCheck.registerProbe({ name: 'probe-1', check: () => 'healthy' });
      healthCheck.registerProbe({ name: 'probe-2', check: () => 'healthy' });

      const report = await healthCheck.runChecks();
      expect(report.overallStatus).toBe('healthy');
    });

    it('should be degraded when any probe is degraded', async () => {
      healthCheck.registerProbe({ name: 'probe-1', check: () => 'healthy' });
      healthCheck.registerProbe({ name: 'probe-2', check: () => 'degraded' });

      const report = await healthCheck.runChecks();
      expect(report.overallStatus).toBe('degraded');
    });

    it('should be unhealthy when any probe is unhealthy', async () => {
      healthCheck.registerProbe({ name: 'probe-1', check: () => 'healthy' });
      healthCheck.registerProbe({ name: 'probe-2', check: () => 'degraded' });
      healthCheck.registerProbe({ name: 'probe-3', check: () => 'unhealthy' });

      const report = await healthCheck.runChecks();
      expect(report.overallStatus).toBe('unhealthy');
    });
  });

  describe('start and stop', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        intervalMs: 100, // Short interval for testing
        runOnStartup: false,
        logger,
      });
    });

    it('should start periodic checks', async () => {
      const checkSpy = jest.fn().mockReturnValue('healthy');
      healthCheck.registerProbe({ name: 'periodic-probe', check: checkSpy });

      healthCheck.start();

      // Wait for at least one check cycle
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(checkSpy).toHaveBeenCalled();
      healthCheck.stop();
    });

    it('should stop periodic checks', async () => {
      const checkSpy = jest.fn().mockReturnValue('healthy');
      healthCheck.registerProbe({ name: 'stop-probe', check: checkSpy });

      healthCheck.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      healthCheck.stop();

      const callCount = checkSpy.mock.calls.length;
      await new Promise(resolve => setTimeout(resolve, 150));

      // Call count should not have increased after stop
      expect(checkSpy.mock.calls.length).toBe(callCount);
    });

    it('should not start when disabled', () => {
      healthCheck = new HealthCheck({
        enabled: false,
        logger,
      });

      const checkSpy = jest.fn().mockReturnValue('healthy');
      healthCheck.registerProbe({ name: 'disabled-probe', check: checkSpy });

      healthCheck.start();

      expect(healthCheck.isActive()).toBe(false);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        logger,
      });
    });

    it('should emit check-complete event', async () => {
      const eventHandler = jest.fn();
      healthCheck.on('check-complete', eventHandler);

      await healthCheck.runChecks();

      expect(eventHandler).toHaveBeenCalled();
      // The event payload has 'report' property
      expect(eventHandler.mock.calls[0][0]).toHaveProperty('report');
    });

    it('should emit health-changed event when status changes', async () => {
      const eventHandler = jest.fn();
      healthCheck.on('health-changed', eventHandler);

      // First check - sets initial status
      healthCheck.registerProbe({ name: 'changing-probe', check: () => 'healthy' });
      await healthCheck.runChecks();

      // Unregister and re-register with unhealthy status to trigger change
      healthCheck.unregisterProbe('changing-probe');
      healthCheck.registerProbe({ name: 'changing-probe', check: () => 'unhealthy' });
      await healthCheck.runChecks();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('static factory methods', () => {
    it('should create a database probe', () => {
      const probe = HealthCheck.createDatabaseProbe(
        () => 100, // latency getter (synchronous)
        500 // threshold
      );

      expect(probe.name).toBe('database');
      expect(probe.check).toBeDefined();
    });

    it('should create an API failure probe', () => {
      const probe = HealthCheck.createApiFailureProbe(
        () => 5, // failure count getter
        10 // threshold
      );

      expect(probe.name).toBe('canvas-api');
      expect(probe.check).toBeDefined();
    });

    it('should create a disk space probe', () => {
      const probe = HealthCheck.createDiskSpaceProbe(
        () => 1000, // available MB getter
        500 // threshold
      );

      expect(probe.name).toBe('disk-space');
      expect(probe.check).toBeDefined();
    });

    it('should return healthy status when within thresholds', () => {
      const probe = HealthCheck.createDatabaseProbe(
        () => 100, // Well under threshold
        500
      );

      const status = probe.check();
      expect(status).toBe('healthy');
    });

    it('should return degraded status when approaching threshold', () => {
      const probe = HealthCheck.createDatabaseProbe(
        () => 300, // 60% of threshold (above 50%)
        500
      );

      const status = probe.check();
      expect(status).toBe('degraded');
    });

    it('should return unhealthy status when over threshold', () => {
      const probe = HealthCheck.createDatabaseProbe(
        () => 600, // Over threshold
        500
      );

      const status = probe.check();
      expect(status).toBe('unhealthy');
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        logger,
      });
    });

    it('should return current health report', () => {
      const report = healthCheck.getStatus();

      expect(report).toHaveProperty('overallStatus');
      expect(report).toHaveProperty('probes');
      expect(report).toHaveProperty('lastChecked');
      expect(report).toHaveProperty('recommendations');
    });

    it('should return updated report after checks', async () => {
      healthCheck.registerProbe({
        name: 'status-probe',
        check: () => 'degraded',
        recommendedAction: 'Check system resources',
      });

      await healthCheck.runChecks();
      const report = healthCheck.getStatus();

      expect(report.overallStatus).toBe('degraded');
      // Recommendations include probe name prefix
      expect(report.recommendations.some(r => r.includes('Check system resources'))).toBe(true);
    });
  });

  describe('isActive', () => {
    it('should report enabled state correctly', () => {
      healthCheck = new HealthCheck({ enabled: true, logger });
      healthCheck.start();
      expect(healthCheck.isActive()).toBe(true);

      healthCheck.stop();
      const disabledCheck = new HealthCheck({ enabled: false, logger });
      disabledCheck.start();
      expect(disabledCheck.isActive()).toBe(false);
    });

    it('should report running state correctly', () => {
      healthCheck = new HealthCheck({
        enabled: true,
        runOnStartup: false,
        intervalMs: 1000,
        logger,
      });

      expect(healthCheck.isActive()).toBe(false);

      healthCheck.start();
      expect(healthCheck.isActive()).toBe(true);

      healthCheck.stop();
      expect(healthCheck.isActive()).toBe(false);
    });
  });
});
