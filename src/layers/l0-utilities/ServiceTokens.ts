/**
 * ServiceTokens - Type definitions for dependency injection
 *
 * Defines all services available through the ServiceRegistry.
 * Used for type-safe service resolution.
 */

import type { Logger } from './Logger';
import type { SystemMonitor } from './SystemMonitor';
import type { CredentialManager } from './CredentialManager';
import type { HealthCheck } from './HealthCheck';
import type { MetricsCollector } from './MetricsCollector';
import type { HousekeepingManager } from './HousekeepingManager';
import type { FileDownloadManager } from './FileDownloadManager';
import type { Database } from '../l1-persistence/Database';
import type { MigrationRunner } from '../l1-persistence/MigrationRunner';
import type { CourseRepository } from '../l1-persistence/repositories/CourseRepository';
import type { TaskRepository } from '../l1-persistence/repositories/TaskRepository';
import type { PolicyRepository } from '../l1-persistence/repositories/PolicyRepository';
import type { NotificationRepository } from '../l1-persistence/repositories/NotificationRepository';
import type { RateLimiter } from '../l2-daemon/RateLimiter';
import type { CircuitBreaker } from '../l2-daemon/CircuitBreaker';
import type { CanvasClient } from '../l2-daemon/CanvasClient';
import type { SyncEngine } from '../l2-daemon/SyncEngine';
import type { PriorityEngine } from '../l3-intelligence/PriorityEngine';
import type { PriorityOrchestrator } from '../l3-intelligence/orchestration/PriorityOrchestrator';
import type { RecommendationOrchestrator } from '../l3-intelligence/orchestration/RecommendationOrchestrator';
import type { InsightOrchestrator } from '../l3-intelligence/orchestration/InsightOrchestrator';
import type { WorkloadOrchestrator } from '../l3-intelligence/orchestration/WorkloadOrchestrator';
import type { BehaviorTrackingOrchestrator } from '../l3-intelligence/orchestration/BehaviorTrackingOrchestrator';
import type { AdaptiveLearningOrchestrator } from '../l3-intelligence/orchestration/AdaptiveLearningOrchestrator';
import type { GradeCalculationService } from '../l3-intelligence/domain/GradeCalculationService';
import type { GraceTokenService } from '../l3-intelligence/domain/GraceTokenService';
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
  | 'courseRepository'
  | 'taskRepository'
  | 'policyRepository'
  | 'notificationRepository'
  // L2 Daemon
  | 'rateLimiter'
  | 'circuitBreaker'
  | 'canvasClient'
  | 'syncEngine'
  // L3 Intelligence
  | 'priorityEngine'
  | 'priorityOrchestrator'
  | 'recommendationOrchestrator'
  | 'insightOrchestrator'
  | 'workloadOrchestrator'
  | 'behaviorTrackingOrchestrator'
  | 'adaptiveLearningOrchestrator'
  | 'gradeCalculationService'
  | 'graceTokenService'
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
  courseRepository: CourseRepository;
  taskRepository: TaskRepository;
  policyRepository: PolicyRepository;
  notificationRepository: NotificationRepository;
  // L2 Daemon
  rateLimiter: RateLimiter;
  circuitBreaker: CircuitBreaker;
  canvasClient: CanvasClient | null;
  syncEngine: SyncEngine | null;
  // L3 Intelligence
  priorityEngine: PriorityEngine;
  priorityOrchestrator: PriorityOrchestrator;
  recommendationOrchestrator: RecommendationOrchestrator;
  insightOrchestrator: InsightOrchestrator;
  workloadOrchestrator: WorkloadOrchestrator;
  behaviorTrackingOrchestrator: BehaviorTrackingOrchestrator;
  adaptiveLearningOrchestrator: AdaptiveLearningOrchestrator;
  gradeCalculationService: GradeCalculationService;
  graceTokenService: GraceTokenService;
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
  canvasBaseUrl: 'https://utoronto.instructure.com',
  enableMetrics: true,
  enableHealthCheck: true,
  enableHousekeeping: true,
  verboseLogging: false,
};
