/**
 * ServiceRegistry - Central Service Container
 *
 * Manages the lifecycle of all application services with:
 * - Lazy initialization via factory pattern
 * - Type-safe service resolution
 * - Proper shutdown sequence (reverse order)
 * - Override support for testing
 */

import { EventEmitter } from 'events';
import type {
  ServiceToken,
  ServiceDefinitions,
  ServiceRegistryConfig,
} from './ServiceTokens';
import { DEFAULT_REGISTRY_CONFIG } from './ServiceTokens';

/**
 * Factory function type for creating service instances.
 */
export type ServiceFactory<T> = () => T;

/**
 * Cleanup function type for service shutdown.
 */
export type ServiceCleanup = () => void | Promise<void>;

/**
 * Interface for services with cleanup methods.
 */
interface CleanableService {
  stop?: () => void | Promise<void>;
  close?: () => void | Promise<void>;
  shutdown?: () => void | Promise<void>;
}

/**
 * ServiceRegistry - Central dependency injection container.
 *
 * Usage:
 * ```typescript
 * const registry = new ServiceRegistry(config);
 * await registry.bootstrap();
 * const logger = registry.get('logger');
 * ```
 */
export class ServiceRegistry extends EventEmitter {
  private readonly config: ServiceRegistryConfig;
  private readonly instances: Map<ServiceToken, unknown> = new Map();
  private readonly factories: Map<ServiceToken, ServiceFactory<unknown>> = new Map();
  private readonly initializationOrder: ServiceToken[] = [];
  private isBootstrapped = false;
  private isShuttingDown = false;

  constructor(config: ServiceRegistryConfig) {
    super();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  /**
   * Register a factory for a service.
   */
  register<K extends ServiceToken>(
    token: K,
    factory: ServiceFactory<ServiceDefinitions[K]>
  ): this {
    if (this.isBootstrapped) {
      throw new Error(`Cannot register service '${token}' after bootstrap`);
    }
    this.factories.set(token, factory as ServiceFactory<unknown>);
    return this;
  }

  /**
   * Get a service instance. Creates it if not yet instantiated.
   */
  get<K extends ServiceToken>(token: K): ServiceDefinitions[K] {
    if (!this.instances.has(token)) {
      const factory = this.factories.get(token);
      if (!factory) {
        throw new Error(`No factory registered for service '${token}'`);
      }

      const instance = factory();
      this.instances.set(token, instance);
      this.initializationOrder.push(token);
    }

    return this.instances.get(token) as ServiceDefinitions[K];
  }

  /**
   * Override a service with a mock (for testing).
   * Can be called before or after bootstrap.
   */
  override<K extends ServiceToken>(token: K, instance: ServiceDefinitions[K]): this {
    this.instances.set(token, instance);
    if (!this.initializationOrder.includes(token)) {
      this.initializationOrder.push(token);
    }
    return this;
  }

  /**
   * Check if a service has been instantiated.
   */
  has(token: ServiceToken): boolean {
    return this.instances.has(token);
  }

  /**
   * Get the configuration.
   */
  getConfig(): Readonly<ServiceRegistryConfig> {
    return this.config;
  }

  /**
   * Bootstrap the registry by registering all default factories.
   * Services are still lazily instantiated.
   */
  async bootstrap(): Promise<void> {
    if (this.isBootstrapped) {
      return;
    }

    // Register all service factories
    this.registerDefaultFactories();

    // Mark as bootstrapped
    this.isBootstrapped = true;

    this.emit('bootstrapped');
  }

  /**
   * Register default factories for all services.
   * Override this method in subclasses to customize.
   */
  protected registerDefaultFactories(): void {
    const config = this.config;

    // L0 Utilities
    this.register('logger', () => {
      const { Logger } = require('../l0-utilities/Logger');
      return new Logger({
        logDir: config.logDir,
        enableConsole: config.verboseLogging,
      });
    });

    this.register('systemMonitor', () => {
      const { SystemMonitor } = require('../l0-utilities/SystemMonitor');
      return new SystemMonitor({ pollIntervalMs: 30000 });
    });

    this.register('credentialManager', () => {
      const { CredentialManager } = require('../l0-utilities/CredentialManager');
      return new CredentialManager({
        serviceName: 'CanvasAssistant',
        accountName: 'canvas-api-token',
        enableFileFallback: true,
        fallbackFilePath: config.credentialFile,
        logger: this.get('logger'),
      });
    });

    this.register('metricsCollector', () => {
      const { MetricsCollector } = require('../l0-utilities/MetricsCollector');
      return new MetricsCollector({
        enabled: config.enableMetrics ?? true,
        dbPath: config.metricsDbPath,
        aggregationIntervalMs: 60000,
        retentionDays: 90,
        logger: this.get('logger'),
      });
    });

    this.register('healthCheck', () => {
      const { HealthCheck } = require('../l0-utilities/HealthCheck');
      return new HealthCheck({
        enabled: config.enableHealthCheck ?? true,
        intervalMs: 60000,
        runOnStartup: true,
        logger: this.get('logger'),
      });
    });

    this.register('housekeepingManager', () => {
      const { HousekeepingManager } = require('../l0-utilities/HousekeepingManager');
      return new HousekeepingManager({
        enabled: config.enableHousekeeping ?? true,
        logDir: config.logDir,
        dataDir: config.appDataDir,
        metricsCollector: this.get('metricsCollector'),
        schedule: { runOnStartup: false },
        retention: { logsDays: 30, metricsDays: 90 },
      });
    });

    this.register('fileDownloadManager', () => {
      const { FileDownloadManager } = require('../l0-utilities/FileDownloadManager');
      return new FileDownloadManager({
        baseDir: config.filesDir,
        maxConcurrent: 10,
        logger: this.get('logger'),
      });
    });

    // L1 Persistence
    this.register('database', () => {
      const { Database } = require('../l1-persistence/Database');
      return new Database({
        dbPath: config.dbPath,
        verbose: config.verboseLogging,
      });
    });

    this.register('migrationRunner', () => {
      const { MigrationRunner } = require('../l1-persistence/MigrationRunner');
      return new MigrationRunner(this.get('database'));
    });

    this.register('visibleDataProvider', () => {
      const { VisibleDataProvider } = require('../l1-persistence/VisibleDataProvider');
      return new VisibleDataProvider(this.get('database'));
    });

    // L1 Repositories
    this.register('courseRepository', () => {
      const {
        CourseRepository,
      } = require('../l1-persistence/repositories/CourseRepository');
      return new CourseRepository(this.get('database'));
    });

    this.register('taskRepository', () => {
      const { TaskRepository } = require('../l1-persistence/repositories/TaskRepository');
      return new TaskRepository(this.get('database'));
    });

    this.register('notificationRepository', () => {
      const {
        NotificationRepository,
      } = require('../l1-persistence/repositories/NotificationRepository');
      return new NotificationRepository(this.get('database'));
    });

    // L2 Daemon
    this.register('rateLimiter', () => {
      const { RateLimiter } = require('../l2-daemon/RateLimiter');
      // Canvas allows ~700 requests/min (~11.7 req/sec)
      // Use 6 concurrent with 50ms min delay for ~12 req/sec throughput
      return new RateLimiter({ maxConcurrent: 6, minDelayMs: 50 });
    });

    this.register('circuitBreaker', () => {
      const { CircuitBreaker } = require('../l2-daemon/CircuitBreaker');
      return new CircuitBreaker({
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        useExponentialBackoff: true,
        logger: this.get('logger'),
      });
    });

    // Canvas client and sync engine are nullable (require credentials)
    this.register('canvasClient', () => null);
    this.register('syncEngine', () => null);

    // L3 Intelligence
    this.register('gradeCalculationService', () => {
      const {
        GradeCalculationService,
      } = require('../l3-intelligence/domain/GradeCalculationService');
      return new GradeCalculationService();
    });

    // L4 Controller
    this.register('commandDispatcher', () => {
      const { CommandDispatcher } = require('../l4-controller/CommandDispatcher');
      return new CommandDispatcher({
        db: this.get('database'),
      });
    });
  }

  /**
   * Initialize a Canvas client with credentials.
   */
  async initializeCanvasClient(token: string, baseUrl?: string): Promise<boolean> {
    try {
      const { CanvasClient } = require('../l2-daemon/CanvasClient');
      const { SyncEngine } = require('../l2-daemon/SyncEngine');

      // Get rate limiter for adaptive throttling
      const rateLimiter = this.get('rateLimiter');

      const client = new CanvasClient({
        baseUrl:
          baseUrl || this.config.canvasBaseUrl || '',
        accessToken: token,
        // Wire up rate limit feedback for adaptive throttling
        onRateLimit: (remaining: number) => rateLimiter?.updateRateLimit?.(remaining),
      });

      // Validate token
      const circuitBreaker = this.get('circuitBreaker');
      const validation = (await circuitBreaker.execute(() => client.validateToken())) as {
        valid: boolean;
        user?: { name: string };
        error?: string;
      };

      if (!validation.valid) {
        return false;
      }

      // Store client
      this.override('canvasClient', client);

      // Initialize sync engine with visibility filtering
      const syncEngine = new SyncEngine({
        client,
        db: this.get('database'),
        rateLimiter: this.get('rateLimiter'),
        visibleDataProvider: this.get('visibleDataProvider'),
      });
      this.override('syncEngine', syncEngine);

      this.emit('canvas-initialized', { user: validation.user });
      return true;
    } catch (error) {
      this.emit('canvas-init-error', { error });
      return false;
    }
  }

  /**
   * Shutdown all services in reverse initialization order.
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    this.emit('shutting-down');

    // Shutdown in reverse order
    const reversed = [...this.initializationOrder].reverse();

    for (const token of reversed) {
      const instance = this.instances.get(token) as CleanableService | null;
      if (!instance) continue;

      try {
        // Try various cleanup methods
        if (typeof instance.stop === 'function') {
          await instance.stop();
        } else if (typeof instance.close === 'function') {
          await instance.close();
        } else if (typeof instance.shutdown === 'function') {
          await instance.shutdown();
        }
      } catch (error) {
        // Use logger if available, otherwise silently fail during shutdown
        const logger = this.instances.get('logger') as
          | { error?: (msg: string, err?: Error) => void }
          | undefined;
        logger?.error?.(
          `Error shutting down ${token}`,
          error instanceof Error ? error : undefined
        );
      }
    }

    this.instances.clear();
    this.emit('shutdown-complete');
  }

  /**
   * Get list of initialized service tokens.
   */
  getInitializedServices(): ServiceToken[] {
    return [...this.initializationOrder];
  }
}
