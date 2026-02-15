/**
 * ServiceTokens - Type definitions for dependency injection
 *
 * Defines all services available through the ServiceRegistry.
 * Used for type-safe service resolution.
 */

import type { Logger } from '../l0-utilities/Logger';
import type { SystemMonitor } from '../l0-utilities/SystemMonitor';
import type { CredentialManager } from '../l0-utilities/CredentialManager';
import type { HealthCheck } from '../l0-utilities/HealthCheck';
import type { MetricsCollector } from '../l0-utilities/MetricsCollector';
import type { HousekeepingManager } from '../l0-utilities/HousekeepingManager';
import type { FileDownloadManager } from '../l0-utilities/FileDownloadManager';
import type { Database } from '../l1-persistence/Database';
import type { MigrationRunner } from '../l1-persistence/MigrationRunner';
import type { VisibleDataProvider } from '../l1-persistence/VisibleDataProvider';
import type { CourseRepository } from '../l1-persistence/repositories/CourseRepository';
import type { TaskRepository } from '../l1-persistence/repositories/TaskRepository';
import type { NotificationRepository } from '../l1-persistence/repositories/NotificationRepository';
import type { RateLimiter } from '../l2-daemon/resilience/RateLimiter';
import type { CircuitBreaker } from '../l2-daemon/resilience/CircuitBreaker';
import type { CanvasClient } from '../l2-daemon/client/CanvasClient';
import type { SyncEngine } from '../l2-daemon/sync-engine/SyncEngine';
import type { GradeCalculationService } from '../l3-intelligence/domain/GradeCalculationService';
import type { CommandDispatcher } from '../l4-controller/CommandDispatcher';

/**
 * Token strings for service lookup.
 * Using literal types for compile-time safety.
 */
export type ServiceToken =
  // L0 Utilities
  | 'logger'
  | 'systemMonitor'
  | 'credentialManager'
  | 'healthCheck'
  | 'metricsCollector'
  | 'housekeepingManager'
  | 'fileDownloadManager'
  // L1 Persistence
  | 'database'
  | 'migrationRunner'
  | 'visibleDataProvider'
  | 'courseRepository'
  | 'taskRepository'
  | 'notificationRepository'
  // L2 Daemon
  | 'rateLimiter'
  | 'circuitBreaker'
  | 'canvasClient'
  | 'syncEngine'
  // L3 Intelligence
  | 'gradeCalculationService'
  // L4 Controller
  | 'commandDispatcher';

/**
 * Maps token strings to their service types.
 * Enables type-safe service resolution via registry.get().
 */
export interface ServiceDefinitions {
  // L0 Utilities
  logger: Logger;
  systemMonitor: SystemMonitor;
  credentialManager: CredentialManager;
  healthCheck: HealthCheck;
  metricsCollector: MetricsCollector;
  housekeepingManager: HousekeepingManager;
  fileDownloadManager: FileDownloadManager;
  // L1 Persistence
  database: Database;
  migrationRunner: MigrationRunner;
  visibleDataProvider: VisibleDataProvider;
  courseRepository: CourseRepository;
  taskRepository: TaskRepository;
  notificationRepository: NotificationRepository;
  // L2 Daemon
  rateLimiter: RateLimiter;
  circuitBreaker: CircuitBreaker;
  canvasClient: CanvasClient | null;
  syncEngine: SyncEngine | null;
  // L3 Intelligence
  gradeCalculationService: GradeCalculationService;
  // L4 Controller
  commandDispatcher: CommandDispatcher;
}

/**
 * Configuration options for the ServiceRegistry.
 */
export interface ServiceRegistryConfig {
  // Application paths
  appDataDir: string;
  dbPath: string;
  metricsDbPath: string;
  logDir: string;
  filesDir: string;
  credentialFile: string;

  // Canvas configuration
  canvasBaseUrl?: string;

  // Feature flags
  enableMetrics?: boolean;
  enableHealthCheck?: boolean;
  enableHousekeeping?: boolean;
  verboseLogging?: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_REGISTRY_CONFIG: Partial<ServiceRegistryConfig> = {
  canvasBaseUrl: '',
  enableMetrics: true,
  enableHealthCheck: true,
  enableHousekeeping: true,
  verboseLogging: false,
};
