/**
 * TestRegistry - Test Helper for Dependency Injection
 *
 * Provides a pre-configured ServiceRegistry with common mocks
 * for easy test setup.
 */

import { ServiceRegistry } from '../../src/layers/l0-utilities/ServiceRegistry';
import type {
  ServiceToken,
  ServiceDefinitions,
  ServiceRegistryConfig,
} from '../../src/layers/l0-utilities/ServiceTokens';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Mock logger that captures log calls for assertions.
 */
export class MockLogger {
  public readonly logs: Array<{ level: string; message: string; args: unknown[] }> = [];

  private log(level: string, message: string, ...args: unknown[]): void {
    this.logs.push({ level, message, args });
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  child(_context: Record<string, unknown>): MockLogger {
    return this;
  }

  clear(): void {
    this.logs.length = 0;
  }

  hasLog(level: string, messagePattern?: string | RegExp): boolean {
    return this.logs.some((log) => {
      if (log.level !== level) return false;
      if (!messagePattern) return true;
      if (typeof messagePattern === 'string') {
        return log.message.includes(messagePattern);
      }
      return messagePattern.test(log.message);
    });
  }
}

/**
 * Mock metrics collector that captures metric events.
 */
export class MockMetricsCollector {
  public readonly metrics: Array<{
    name: string;
    value: number;
    labels?: Record<string, string>;
  }> = [];

  record(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.push({ name, value, labels });
  }

  increment(name: string, labels?: Record<string, string>): void {
    this.record(name, 1, labels);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  timing(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.record(`${name}_ms`, durationMs, labels);
  }

  clear(): void {
    this.metrics.length = 0;
  }

  start(): void {}
  stop(): void {}
}

/**
 * Mock health check that always reports healthy.
 */
export class MockHealthCheck {
  getStatus(): { overall: 'healthy' } {
    return { overall: 'healthy' };
  }

  start(): void {}
  stop(): void {}
}

/**
 * Options for creating a test registry.
 */
export interface TestRegistryOptions {
  /** Use an in-memory SQLite database instead of file */
  useInMemoryDb?: boolean;
  /** Provide custom mocks for specific services */
  mocks?: Partial<ServiceDefinitions>;
  /** Additional config overrides */
  config?: Partial<ServiceRegistryConfig>;
}

/**
 * Create a test registry with common mocks pre-configured.
 *
 * @example
 * ```typescript
 * const { registry, cleanup } = await createTestRegistry();
 *
 * // Use the registry
 * const db = registry.get('database');
 *
 * // Clean up after test
 * cleanup();
 * ```
 */
export async function createTestRegistry(options: TestRegistryOptions = {}): Promise<{
  registry: ServiceRegistry;
  cleanup: () => void;
  tempDir: string;
  mockLogger: MockLogger;
  mockMetrics: MockMetricsCollector;
}> {
  // Create temp directory for test data
  const tempDir = mkdtempSync(join(tmpdir(), 'cid-test-'));

  // Create config
  const config: ServiceRegistryConfig = {
    appDataDir: tempDir,
    dbPath: options.useInMemoryDb ? ':memory:' : join(tempDir, 'test.db'),
    metricsDbPath: join(tempDir, 'metrics.db'),
    logDir: join(tempDir, 'logs'),
    filesDir: join(tempDir, 'files'),
    credentialFile: join(tempDir, 'credentials'),
    verboseLogging: false,
    enableMetrics: false,
    enableHealthCheck: false,
    enableHousekeeping: false,
    ...options.config,
  };

  // Create registry
  const registry = new ServiceRegistry(config);
  await registry.bootstrap();

  // Create default mocks
  const mockLogger = new MockLogger();
  const mockMetrics = new MockMetricsCollector();
  const mockHealthCheck = new MockHealthCheck();

  // Override with mocks
  registry.override('logger', mockLogger as unknown as ServiceDefinitions['logger']);
  registry.override(
    'metricsCollector',
    mockMetrics as unknown as ServiceDefinitions['metricsCollector']
  );
  registry.override(
    'healthCheck',
    mockHealthCheck as unknown as ServiceDefinitions['healthCheck']
  );

  // Apply custom mocks
  if (options.mocks) {
    for (const [token, mock] of Object.entries(options.mocks)) {
      registry.override(token as ServiceToken, mock as ServiceDefinitions[typeof token]);
    }
  }

  // Initialize database
  const db = registry.get('database');
  db.initialize();

  // Run migrations
  const migrationRunner = registry.get('migrationRunner');
  migrationRunner.runMigrations();

  // Cleanup function
  const cleanup = () => {
    try {
      // Close database
      if (registry.has('database')) {
        const db = registry.get('database');
        db.close();
      }

      // Remove temp directory
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    registry,
    cleanup,
    tempDir,
    mockLogger,
    mockMetrics,
  };
}

/**
 * Create a minimal test database (no full registry).
 *
 * @example
 * ```typescript
 * const { db, cleanup } = await createTestDatabase();
 * // Use db
 * cleanup();
 * ```
 */
export async function createTestDatabase(): Promise<{
  db: ServiceDefinitions['database'];
  cleanup: () => void;
  tempDir: string;
}> {
  const tempDir = mkdtempSync(join(tmpdir(), 'cid-test-'));
  const dbPath = join(tempDir, 'test.db');

  // Dynamically import to avoid circular dependencies
  const { Database } = await import('../../src/layers/l1-persistence/Database');
  const { MigrationRunner } =
    await import('../../src/layers/l1-persistence/MigrationRunner');

  const db = new Database({ dbPath });
  db.initialize();

  const migrationRunner = new MigrationRunner(db);
  migrationRunner.runMigrations();

  const cleanup = () => {
    try {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { db, cleanup, tempDir };
}
