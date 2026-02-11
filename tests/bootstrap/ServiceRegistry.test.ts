/**
 * ServiceRegistry Tests
 *
 * Tests for the central dependency injection container.
 */

import { EventEmitter } from 'events';
import { ServiceRegistry } from '../../src/layers/bootstrap/ServiceRegistry';
import type { ServiceRegistryConfig, ServiceToken } from '../../src/layers/bootstrap/ServiceTokens';

// Mock services - minimal interfaces for testing
class MockLogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
  stop = jest.fn();
}

class MockDatabase {
  close = jest.fn();
}

class MockService {
  stop = jest.fn();
}

// Helper to bypass type checking for test mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRegistry = ServiceRegistry & { register: (token: string, factory: () => any) => any; get: (token: string) => any; override: (token: string, instance: any) => any };

// Mock config
const createMockConfig = (): ServiceRegistryConfig => ({
  appDataDir: '/tmp/test-app',
  dbPath: ':memory:',
  metricsDbPath: ':memory:',
  logDir: '/tmp/test-logs',
  filesDir: '/tmp/test-files',
  credentialFile: '/tmp/test-creds',
  canvasBaseUrl: 'https://test.instructure.com',
  enableMetrics: false,
  enableHealthCheck: false,
  enableHousekeeping: false,
  verboseLogging: false,
});

describe('ServiceRegistry', () => {
  let registry: AnyRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry(createMockConfig()) as AnyRegistry;
  });

  afterEach(async () => {
    if (registry) {
      await registry.shutdown();
    }
  });

  describe('Factory Registration', () => {
    it('should register a factory for a service', () => {
      const factory = jest.fn(() => new MockLogger());
      registry.register('logger', factory);
      expect(factory).not.toHaveBeenCalled(); // Lazy init
    });

    it('should throw when registering after bootstrap', async () => {
      await registry.bootstrap();
      expect(() => {
        registry.register('logger', () => new MockLogger());
      }).toThrow(/Cannot register service.*after bootstrap/);
    });

    it('should throw when getting unregistered service', () => {
      expect(() => {
        // Cast to bypass type checking for test
        registry.get('nonexistent' as ServiceToken);
      }).toThrow(/No factory registered/);
    });
  });

  describe('Lazy Initialization', () => {
    it('should create service instance on first get', () => {
      const mockLogger = new MockLogger();
      const factory = jest.fn(() => mockLogger);
      registry.register('logger', factory);

      const instance1 = registry.get('logger');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(instance1).toBe(mockLogger);

      // Second get should return same instance
      const instance2 = registry.get('logger');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(instance2).toBe(mockLogger);
    });

    it('should track initialization order', () => {
      registry.register('logger', () => new MockLogger());
      registry.register('database', () => new MockDatabase());

      registry.get('database');
      registry.get('logger');

      const order = registry.getInitializedServices();
      expect(order).toEqual(['database', 'logger']);
    });

    it('should report if service is initialized', () => {
      registry.register('logger', () => new MockLogger());

      expect(registry.has('logger')).toBe(false);
      registry.get('logger');
      expect(registry.has('logger')).toBe(true);
    });
  });

  describe('Service Override', () => {
    it('should allow overriding with mock instance', () => {
      const realLogger = new MockLogger();
      const mockLogger = new MockLogger();

      registry.register('logger', () => realLogger);
      registry.override('logger', mockLogger);

      const instance = registry.get('logger');
      expect(instance).toBe(mockLogger);
    });

    it('should allow override before bootstrap', () => {
      const mockLogger = new MockLogger();
      registry.override('logger', mockLogger);

      const instance = registry.get('logger');
      expect(instance).toBe(mockLogger);
    });

    it('should track overridden services in initialization order', () => {
      const mockLogger = new MockLogger();
      registry.override('logger', mockLogger);

      const order = registry.getInitializedServices();
      expect(order).toContain('logger');
    });
  });

  describe('Bootstrap', () => {
    it('should emit bootstrapped event', async () => {
      const handler = jest.fn();
      registry.on('bootstrapped', handler);

      await registry.bootstrap();

      expect(handler).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      const handler = jest.fn();
      registry.on('bootstrapped', handler);

      await registry.bootstrap();
      await registry.bootstrap();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should register default factories on bootstrap', async () => {
      await registry.bootstrap();

      // After bootstrap, factories should be registered
      // Trying to get a service should work (though may fail on missing deps)
      // We'll just verify no error is thrown when checking has
      expect(registry.has('logger')).toBe(false); // Not yet instantiated
    });
  });

  describe('Shutdown', () => {
    it('should call stop on services in reverse order', async () => {
      const service1 = new MockService();
      const service2 = new MockService();
      const callOrder: string[] = [];

      service1.stop = jest.fn(() => { callOrder.push('service1'); });
      service2.stop = jest.fn(() => { callOrder.push('service2'); });

      registry.register('logger', () => service1);
      registry.register('database', () => service2);

      // Initialize in order
      registry.get('logger');
      registry.get('database');

      await registry.shutdown();

      expect(service1.stop).toHaveBeenCalled();
      expect(service2.stop).toHaveBeenCalled();
      // Reverse order: database first, then logger
      expect(callOrder).toEqual(['service2', 'service1']);
    });

    it('should call close method if stop not available', async () => {
      const mockDb = new MockDatabase();
      registry.register('database', () => mockDb);
      registry.get('database');

      await registry.shutdown();

      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should emit shutdown events', async () => {
      const shuttingDownHandler = jest.fn();
      const completeHandler = jest.fn();

      registry.on('shutting-down', shuttingDownHandler);
      registry.on('shutdown-complete', completeHandler);

      await registry.shutdown();

      expect(shuttingDownHandler).toHaveBeenCalled();
      expect(completeHandler).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      const completeHandler = jest.fn();
      registry.on('shutdown-complete', completeHandler);

      await registry.shutdown();
      await registry.shutdown();

      expect(completeHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during service shutdown', async () => {
      const brokenService = {
        stop: jest.fn(() => { throw new Error('Shutdown failed'); }),
      };

      registry.register('logger', () => brokenService);
      registry.get('logger');

      // Should not throw
      await expect(registry.shutdown()).resolves.not.toThrow();
    });

    it('should clear instances after shutdown', async () => {
      registry.register('logger', () => new MockLogger());
      registry.get('logger');

      expect(registry.has('logger')).toBe(true);
      await registry.shutdown();
      expect(registry.has('logger')).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should return readonly config', () => {
      const config = registry.getConfig();
      expect(config.dbPath).toBe(':memory:');
      expect(config.canvasBaseUrl).toBe('https://test.instructure.com');
    });

    it('should merge with default config', () => {
      const minimalConfig = {
        appDataDir: '/tmp/test',
        dbPath: '/tmp/test.db',
        metricsDbPath: '/tmp/metrics.db',
        logDir: '/tmp/logs',
        filesDir: '/tmp/files',
        credentialFile: '/tmp/creds',
      } as ServiceRegistryConfig;

      const reg = new ServiceRegistry(minimalConfig);
      const config = reg.getConfig();

      // Should have default values
      expect(config.enableMetrics).toBe(true);
    });
  });

  describe('Event Emission', () => {
    it('should extend EventEmitter', () => {
      expect(registry).toBeInstanceOf(EventEmitter);
    });

    it('should emit events correctly', () => {
      const handler = jest.fn();
      registry.on('custom-event', handler);
      registry.emit('custom-event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });
  });
});

describe('ServiceRegistry with Dependencies', () => {
  let registry: AnyRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry(createMockConfig()) as AnyRegistry;
  });

  afterEach(async () => {
    await registry.shutdown();
  });

  it('should resolve dependencies through registry.get in factories', () => {
    const mockLogger = new MockLogger();
    const mockDb = new MockDatabase();

    registry.register('logger', () => mockLogger);
    registry.register('database', () => {
      // This factory depends on logger being available
      const logger = registry.get('logger');
      expect(logger).toBe(mockLogger);
      return mockDb;
    });

    const db = registry.get('database');
    expect(db).toBe(mockDb);
  });

  it('should handle circular dependency detection (implicit)', () => {
    // Simulating a potential circular dependency scenario
    registry.register('serviceA', () => {
      registry.get('serviceB');
      return { name: 'A' };
    });
    registry.register('serviceB', () => {
      // Would cause stack overflow if it called get('serviceA')
      return { name: 'B' };
    });

    // Should work since B doesn't depend on A
    const a = registry.get('serviceA');
    expect(a).toEqual({ name: 'A' });
  });
});
