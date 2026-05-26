/**
 * ServiceRegistry Integration Tests
 *
 * Tests event emission, shutdown ordering, and idempotency
 * beyond what the basic mock-based tests cover.
 */

import { ServiceRegistry } from '../../src/layers/bootstrap/ServiceRegistry';

describe('ServiceRegistry - Integration', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry({
      appDataDir: '/tmp/cid-test',
      dbPath: '/tmp/cid-test/db.sqlite',
      metricsDbPath: '/tmp/cid-test/metrics.db',
      logDir: '/tmp/cid-test/logs',
      filesDir: '/tmp/cid-test/files',
      credentialFile: '/tmp/cid-test/.credentials',
    });
  });

  afterEach(async () => {
    await registry.shutdown();
  });

  describe('Event emission', () => {
    test('emits bootstrapped event on bootstrap()', async () => {
      const handler = jest.fn();
      registry.on('bootstrapped', handler);
      await registry.bootstrap();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits shutting-down event on shutdown()', async () => {
      const handler = jest.fn();
      await registry.bootstrap();
      registry.on('shutting-down', handler);
      await registry.shutdown();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits shutdown-complete event after shutdown()', async () => {
      const handler = jest.fn();
      await registry.bootstrap();
      registry.on('shutdown-complete', handler);
      await registry.shutdown();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Idempotency', () => {
    test('bootstrap() is idempotent', async () => {
      const handler = jest.fn();
      registry.on('bootstrapped', handler);

      await registry.bootstrap();
      await registry.bootstrap();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('shutdown() is idempotent', async () => {
      const handler = jest.fn();
      await registry.bootstrap();
      registry.on('shutdown-complete', handler);

      await registry.shutdown();
      await registry.shutdown();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Service registration and retrieval', () => {
    test('registered factory is called lazily on first get()', () => {
      const factory = jest.fn().mockReturnValue({ value: 42 });
      registry.register('logger' as any, factory);

      // Factory not called yet
      expect(factory).not.toHaveBeenCalled();

      // get() triggers lazy initialization
      const service = registry.get('logger' as any);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(service).toEqual({ value: 42 });
    });

    test('subsequent get() returns same instance', () => {
      const obj = { value: 'singleton' };
      registry.register('logger' as any, () => obj);

      const first = registry.get('logger' as any);
      const second = registry.get('logger' as any);

      expect(first).toBe(second);
    });

    test('override() replaces service instance', () => {
      registry.register('logger' as any, () => ({ value: 'original' }));

      const override = { value: 'replaced' };
      registry.override('logger' as any, override);

      expect(registry.get('logger' as any)).toBe(override);
    });

    test('has() returns false for unregistered service', () => {
      expect(registry.has('nonexistent' as any)).toBe(false);
    });
  });

  describe('Shutdown cleanup', () => {
    test('calls stop() on services that have it', async () => {
      const service = { stop: jest.fn() };
      registry.override('logger' as any, service);
      await registry.bootstrap();

      await registry.shutdown();

      expect(service.stop).toHaveBeenCalledTimes(1);
    });

    test('calls close() on services that have it', async () => {
      const service = { close: jest.fn() };
      registry.override('database' as any, service);
      await registry.bootstrap();

      await registry.shutdown();

      expect(service.close).toHaveBeenCalledTimes(1);
    });

    test('shutdown does not throw if service cleanup fails', async () => {
      const service = {
        stop: jest.fn().mockImplementation(() => {
          throw new Error('cleanup failed');
        }),
      };
      registry.override('logger' as any, service);
      await registry.bootstrap();

      // Should not throw
      await expect(registry.shutdown()).resolves.not.toThrow();
    });
  });
});
