/**
 * L0 Utilities - Application Configuration
 *
 * Centralized configuration system for all application settings.
 * Supports environment variable overrides, validation, and persistence.
 */

import { EventEmitter } from 'events';
import { DEFAULT_PATHS } from './DefaultPaths';

// ============================================================================
// Common Types
// ============================================================================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// ============================================================================
// Layer 0: Utilities Configuration
// ============================================================================

export interface ComponentLogLevels {
  healthCheck?: LogLevel;
  circuitBreaker?: LogLevel;
  credentialManager?: LogLevel;
  metricsCollector?: LogLevel;
  housekeeping?: LogLevel;
  rateLimiter?: LogLevel;
  syncEngine?: LogLevel;
  canvasClient?: LogLevel;
  priorityEngine?: LogLevel;
  database?: LogLevel;
  [key: string]: LogLevel | undefined;
}

export interface LogRotationConfig {
  /** Rotation frequency */
  frequency: 'daily' | 'hourly';
  /** Compress rotated logs */
  compress: boolean;
  /** Max files to keep (e.g., '30d' for 30 days) */
  maxFiles: string;
  /** Max size per file (e.g., '20m' for 20MB) */
  maxSize: string;
}

export interface LoggerConfig {
  /** Log directory path */
  logDir: string;
  /** Log filename (without extension) */
  logFilename: string;
  /** Default log level */
  logLevel: LogLevel;
  /** Max log file size in bytes (legacy, use rotation.maxSize) */
  maxFileSize: number;
  /** Max number of log files (legacy, use rotation.maxFiles) */
  maxFiles: number;
  /** Minimum length to detect API keys for redaction */
  apiKeyMinLength: number;
  /** Per-component log levels */
  componentLevels: ComponentLogLevels;
  /** Log rotation configuration */
  rotation: LogRotationConfig;
  /** Enable console output */
  enableConsole: boolean;
}

export interface SystemMonitorConfig {
  /** Polling interval for system state in ms */
  pollIntervalMs: number;
}

export interface HealthCheckConfig {
  /** Enable health checks */
  enabled: boolean;
  /** Health check polling interval in ms */
  intervalMs: number;
  /** Run health check on startup */
  runOnStartup: boolean;
  /** Thresholds for unhealthy status */
  thresholds: {
    /** Database write latency threshold in ms */
    dbLatencyMs: number;
    /** Memory usage threshold in MB */
    memoryMb: number;
    /** Consecutive API failures threshold */
    apiFailures: number;
    /** Disk space warning threshold in MB */
    diskSpaceMb: number;
  };
}

export interface CredentialManagerConfig {
  /** Service name for keychain storage */
  serviceName: string;
  /** Account name for keychain storage */
  accountName: string;
  /** Enable fallback to encrypted file if keychain unavailable */
  enableFileFallback: boolean;
  /** Path for encrypted file fallback */
  fallbackFilePath: string;
  /** Validate token on retrieval */
  validateOnRetrieve: boolean;
}

export interface MetricsCollectorConfig {
  /** Enable metrics collection */
  enabled: boolean;
  /** Aggregation interval in ms (1 minute = 60000) */
  aggregationIntervalMs: number;
  /** Retention period in days */
  retentionDays: number;
  /** Path to metrics database */
  dbPath: string;
  /** Emit update events */
  emitEvents: boolean;
}

export interface HousekeepingConfig {
  /** Enable automatic housekeeping */
  enabled: boolean;
  /** Schedule settings */
  schedule: {
    /** Time to run daily cleanup (HH:MM format) */
    runAt: string;
    /** Run cleanup on application startup */
    runOnStartup: boolean;
  };
  /** Retention periods */
  retention: {
    /** Log retention in days */
    logsDays: number;
    /** Metrics retention in days */
    metricsDays: number;
    /** Temp file retention in hours */
    tempFileHours: number;
    /** Sync cache retention in days */
    syncCacheDays: number;
  };
  /** Database maintenance settings */
  database: {
    /** VACUUM frequency */
    vacuumFrequency: 'daily' | 'weekly' | 'monthly';
    /** Checkpoint WAL on close */
    walCheckpointOnClose: boolean;
  };
  /** Disk space warning threshold in MB (triggers UI warning) */
  diskSpaceWarningMb: number;
}

export interface UtilitiesConfig {
  logger: LoggerConfig;
  systemMonitor: SystemMonitorConfig;
  healthCheck: HealthCheckConfig;
  credentialManager: CredentialManagerConfig;
  metricsCollector: MetricsCollectorConfig;
  housekeeping: HousekeepingConfig;
}

// ============================================================================
// Layer 1: Persistence Configuration
// ============================================================================

export interface DatabaseConfig {
  /** SQLite cache size in KB */
  cacheSizeKb: number;
  /** Memory-mapped I/O size in bytes */
  mmapSizeBytes: number;
  /** Enable WAL mode */
  walMode: boolean;
}

export interface PersistenceConfig {
  database: DatabaseConfig;
  /** Default target grade for new courses */
  defaultTargetGrade: number;
}

// ============================================================================
// Layer 2: Daemon Configuration
// ============================================================================

export interface CanvasApiConfig {
  /** HTTP request timeout in ms */
  timeoutMs: number;
  /** Pagination page size */
  pageSize: number;
  /** Default rate limit remaining value */
  defaultRateLimit: number;
}

export interface RateLimiterConfig {
  /** Max concurrent requests */
  maxConcurrent: number;
  /** Min delay between requests in ms */
  minDelayMs: number;
  /** Max retry attempts */
  maxRetries: number;
  /** Base backoff for retries in ms */
  baseBackoffMs: number;
  /** Max backoff cap in ms */
  maxBackoffMs: number;
  /** Rate limit warning threshold */
  warningThreshold: number;
  /** Auto-resume delay after warning in ms */
  autoResumeDelayMs: number;
}

export interface CircuitBreakerConfig {
  /** Enable circuit breaker */
  enabled: boolean;
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Initial reset timeout in ms */
  resetTimeoutMs: number;
  /** Max reset timeout in ms (for exponential backoff) */
  maxResetTimeoutMs: number;
  /** Use exponential backoff for reset timeout */
  useExponentialBackoff: boolean;
  /** Per-endpoint circuit breakers */
  perEndpoint: boolean;
  /** Endpoints to track (if perEndpoint is true) */
  endpoints: string[];
}

export interface SyncConfig {
  /** Priority for course sync operations */
  coursePriority: number;
  /** Priority for task sync operations */
  taskPriority: number;
  /** Default sync queue priority */
  defaultPriority: number;
}

export interface HtmlContentSyncConfig {
  /** Whether to save HTML content files (pages, assignments, announcements) */
  enabled: boolean;
  /** URL rewriting mode for offline access: 'local' rewrites to local paths, 'original' keeps Canvas URLs */
  urlRewriting: 'local' | 'original';
  /** Extract and download embedded images */
  downloadImages: boolean;
  /** Extract and download linked files */
  downloadLinkedFiles: boolean;
  /** Max concurrent downloads for resources */
  maxConcurrentDownloads: number;
}

export interface PolicyDetectionConfig {
  /** Confidence boost for pattern matches */
  patternBoost: number;
}

export interface InputValidatorConfig {
  /** Validation strictness: 'strict' | 'lenient' */
  strictness: 'strict' | 'lenient';
  /** Log validation warnings */
  logWarnings: boolean;
  /** HTML handling in text fields: 'strip' | 'sanitize' | 'keep' */
  htmlHandling: 'strip' | 'sanitize' | 'keep';
}

export interface DaemonConfig {
  canvasApi: CanvasApiConfig;
  rateLimiter: RateLimiterConfig;
  circuitBreaker: CircuitBreakerConfig;
  sync: SyncConfig;
  htmlContentSync: HtmlContentSyncConfig;
  policyDetection: PolicyDetectionConfig;
  inputValidator: InputValidatorConfig;
}

// ============================================================================
// Layer 3: Intelligence Configuration
// ============================================================================

export interface RefreshTierConfig {
  /** Minimum hours until deadline to use this tier */
  minHoursUntilDue: number;
  /** Refresh interval in ms */
  refreshIntervalMs: number;
  /** Human-readable name */
  name: string;
}

export interface FactorWeightsConfig {
  /** Weight for time urgency factor */
  urgency: number;
  /** Weight for task weight/points factor */
  taskWeight: number;
  /** Weight for course gap to target factor */
  courseGap: number;
  /** Weight for policy adjustments */
  policyAdjustment: number;
  /** Weight for dependency blocking */
  dependencyBlocking: number;
  /** Weight for partial credit potential (overdue) */
  partialCredit: number;
  /** Weight for failure risk (overdue) */
  failureRisk: number;
}

export interface UrgencyCurveConfig {
  /** Hours threshold for "critical" urgency */
  criticalHours: number;
  /** Hours threshold for "high" urgency */
  highHours: number;
  /** Hours threshold for "medium" urgency */
  mediumHours: number;
  /** Multiplier for critical urgency */
  criticalMultiplier: number;
  /** Multiplier for high urgency */
  highMultiplier: number;
  /** Multiplier for medium urgency */
  mediumMultiplier: number;
  /** Multiplier for low urgency */
  lowMultiplier: number;
}

export interface RiskThresholdsConfig {
  /** Grade drop percentage for critical risk */
  criticalDropPercent: number;
  /** Grade drop percentage for high risk */
  highDropPercent: number;
  /** Grade drop percentage for medium risk */
  mediumDropPercent: number;
}

export interface RiskMultipliersConfig {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface PriorityConfig {
  /** Refresh tier configuration */
  refreshTiers: RefreshTierConfig[];
  /** Factor weights for score calculation */
  factorWeights: FactorWeightsConfig;
  /** Urgency curve parameters */
  urgencyCurve: UrgencyCurveConfig;
  /** Risk level thresholds */
  riskThresholds: RiskThresholdsConfig;
  /** Risk multipliers for overdue calculation */
  riskMultipliers: RiskMultipliersConfig;
  /** Hours to assume task submitted after deadline */
  assumeSubmittedAfterHours: number;
  /** Whether to include 0-weight tasks in active queue */
  includeZeroWeightInActive: boolean;
  /** Base score for urgency calculation */
  urgencyBaseScoreMax: number;
  /** Course gap impact multiplier */
  courseGapImpactMultiplier: number;
  /** Course gap impact cap */
  courseGapImpactMax: number;
  /** Base risk impact score */
  riskBaseImpactScore: number;
  /** Default next refresh interval in ms */
  defaultNextRefreshIntervalMs: number;
  /** Default daily refresh interval in ms */
  defaultDailyRefreshIntervalMs: number;
}

export interface PolicyEvaluatorConfig {
  /** Grace token boost factor base */
  graceTokenBoostFactorBase: number;
  /** Grace token boost reduction per token */
  graceTokenBoostReductionPerToken: number;
  /** Grace token adjustment impact */
  graceTokenAdjustmentImpact: number;
  /** Grace token minor adjustment */
  graceTokenMinorAdjustment: number;
  /** Late submission urgent adjustment */
  lateSubmissionUrgentAdjustment: number;
  /** Late submission past cutoff adjustment */
  lateSubmissionPastCutoffAdjustment: number;
  /** Low penalty adjustment */
  lowPenaltyAdjustment: number;
  /** Drop lowest adjustment */
  dropLowestAdjustment: number;
  /** Weight transfer source adjustment */
  weightTransferSourceAdjustment: number;
  /** Weight transfer target adjustment */
  weightTransferTargetAdjustment: number;
}

export interface IntelligenceConfig {
  priority: PriorityConfig;
  policyEvaluator: PolicyEvaluatorConfig;
}

// ============================================================================
// Complete Application Configuration
// ============================================================================

export interface AppConfigData {
  utilities: UtilitiesConfig;
  persistence: PersistenceConfig;
  daemon: DaemonConfig;
  intelligence: IntelligenceConfig;
}

// ============================================================================
// Default Configuration Values
// ============================================================================

export const DEFAULT_APP_CONFIG: AppConfigData = {
  utilities: {
    logger: {
      logDir: DEFAULT_PATHS.logs,
      logFilename: 'cid',
      logLevel: 'info',
      maxFileSize: 10 * 1024 * 1024, // 10MB (legacy)
      maxFiles: 5, // (legacy)
      apiKeyMinLength: 32,
      componentLevels: {},
      rotation: {
        frequency: 'daily',
        compress: true,
        maxFiles: '30d',
        maxSize: '20m',
      },
      enableConsole: true,
    },
    systemMonitor: {
      pollIntervalMs: 5000,
    },
    healthCheck: {
      enabled: true,
      intervalMs: 60000, // 1 minute
      runOnStartup: true,
      thresholds: {
        dbLatencyMs: 500,
        memoryMb: 500,
        apiFailures: 10,
        diskSpaceMb: 500,
      },
    },
    credentialManager: {
      serviceName: 'CanvasIntegrationDashboard',
      accountName: 'canvas-api-token',
      enableFileFallback: true,
      fallbackFilePath: DEFAULT_PATHS.credentials,
      validateOnRetrieve: true,
    },
    metricsCollector: {
      enabled: true,
      aggregationIntervalMs: 60000, // 1 minute
      retentionDays: 90,
      dbPath: DEFAULT_PATHS.metricsDb,
      emitEvents: true,
    },
    housekeeping: {
      enabled: true,
      schedule: {
        runAt: '02:00',
        runOnStartup: false,
      },
      retention: {
        logsDays: 30,
        metricsDays: 90,
        tempFileHours: 24,
        syncCacheDays: 7,
      },
      database: {
        vacuumFrequency: 'weekly',
        walCheckpointOnClose: true,
      },
      diskSpaceWarningMb: 500,
    },
  },

  persistence: {
    database: {
      cacheSizeKb: 64000, // 64MB
      mmapSizeBytes: 268435456, // 256MB
      walMode: true,
    },
    defaultTargetGrade: 85.0,
  },

  daemon: {
    canvasApi: {
      timeoutMs: 30000,
      pageSize: 100,
      defaultRateLimit: 700,
    },
    rateLimiter: {
      maxConcurrent: 3,
      minDelayMs: 100,
      maxRetries: 3,
      baseBackoffMs: 2000,
      maxBackoffMs: 16000,
      warningThreshold: 10,
      autoResumeDelayMs: 5000,
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      resetTimeoutMs: 30000, // 30 seconds
      maxResetTimeoutMs: 300000, // 5 minutes
      useExponentialBackoff: true,
      perEndpoint: true,
      endpoints: ['courses', 'assignments', 'submissions', 'users'],
    },
    sync: {
      coursePriority: 10,
      taskPriority: 5,
      defaultPriority: 10,
    },
    htmlContentSync: {
      enabled: true,
      urlRewriting: 'local',
      downloadImages: true,
      downloadLinkedFiles: true,
      maxConcurrentDownloads: 3,
    },
    policyDetection: {
      patternBoost: 0.15,
    },
    inputValidator: {
      strictness: 'lenient',
      logWarnings: true,
      htmlHandling: 'sanitize',
    },
  },

  intelligence: {
    priority: {
      refreshTiers: [
        { minHoursUntilDue: 72, refreshIntervalMs: 24 * 60 * 60 * 1000, name: 'daily' },
        {
          minHoursUntilDue: 24,
          refreshIntervalMs: 6 * 60 * 60 * 1000,
          name: 'sixHourly',
        },
        { minHoursUntilDue: 0, refreshIntervalMs: 30 * 60 * 1000, name: 'halfHourly' },
      ],
      factorWeights: {
        urgency: 1.0,
        taskWeight: 1.0,
        courseGap: 0.8,
        policyAdjustment: 1.0,
        dependencyBlocking: 1.5,
        partialCredit: 0.7,
        failureRisk: 1.2,
      },
      urgencyCurve: {
        criticalHours: 6,
        highHours: 24,
        mediumHours: 72,
        criticalMultiplier: 3.0,
        highMultiplier: 2.0,
        mediumMultiplier: 1.5,
        lowMultiplier: 1.0,
      },
      riskThresholds: {
        criticalDropPercent: 10,
        highDropPercent: 5,
        mediumDropPercent: 2,
      },
      riskMultipliers: {
        low: 0.5,
        medium: 1.0,
        high: 1.5,
        critical: 2.0,
      },
      assumeSubmittedAfterHours: 48,
      includeZeroWeightInActive: true,
      urgencyBaseScoreMax: 100,
      courseGapImpactMultiplier: 1.5,
      courseGapImpactMax: 30,
      riskBaseImpactScore: 20,
      defaultNextRefreshIntervalMs: 30 * 60 * 1000,
      defaultDailyRefreshIntervalMs: 24 * 60 * 60 * 1000,
    },
    policyEvaluator: {
      graceTokenBoostFactorBase: 1.5,
      graceTokenBoostReductionPerToken: 0.1,
      graceTokenAdjustmentImpact: 20,
      graceTokenMinorAdjustment: 5,
      lateSubmissionUrgentAdjustment: 15,
      lateSubmissionPastCutoffAdjustment: -100,
      lowPenaltyAdjustment: -5,
      dropLowestAdjustment: -10,
      weightTransferSourceAdjustment: -8,
      weightTransferTargetAdjustment: 10,
    },
  },
};

// ============================================================================
// Environment Variable Mapping
// ============================================================================

interface EnvMapping {
  envVar: string;
  path: string[];
  type: 'string' | 'number' | 'boolean';
}

const ENV_MAPPINGS: EnvMapping[] = [
  // Logger
  { envVar: 'CID_LOG_DIR', path: ['utilities', 'logger', 'logDir'], type: 'string' },
  { envVar: 'CID_LOG_LEVEL', path: ['utilities', 'logger', 'logLevel'], type: 'string' },
  {
    envVar: 'CID_LOG_MAX_SIZE',
    path: ['utilities', 'logger', 'maxFileSize'],
    type: 'number',
  },
  {
    envVar: 'CID_LOG_MAX_FILES',
    path: ['utilities', 'logger', 'maxFiles'],
    type: 'number',
  },

  // System Monitor
  {
    envVar: 'CID_MONITOR_POLL_INTERVAL',
    path: ['utilities', 'systemMonitor', 'pollIntervalMs'],
    type: 'number',
  },

  // Health Check
  {
    envVar: 'CID_HEALTH_INTERVAL',
    path: ['utilities', 'healthCheck', 'intervalMs'],
    type: 'number',
  },
  {
    envVar: 'CID_HEALTH_DB_LATENCY',
    path: ['utilities', 'healthCheck', 'thresholds', 'dbLatencyMs'],
    type: 'number',
  },
  {
    envVar: 'CID_HEALTH_MEMORY',
    path: ['utilities', 'healthCheck', 'thresholds', 'memoryMb'],
    type: 'number',
  },

  // Housekeeping
  {
    envVar: 'CID_HOUSEKEEPING_LOGS_DAYS',
    path: ['utilities', 'housekeeping', 'retention', 'logsDays'],
    type: 'number',
  },
  {
    envVar: 'CID_HOUSEKEEPING_METRICS_DAYS',
    path: ['utilities', 'housekeeping', 'retention', 'metricsDays'],
    type: 'number',
  },

  // Database
  {
    envVar: 'CID_DB_CACHE_SIZE',
    path: ['persistence', 'database', 'cacheSizeKb'],
    type: 'number',
  },
  {
    envVar: 'CID_DB_MMAP_SIZE',
    path: ['persistence', 'database', 'mmapSizeBytes'],
    type: 'number',
  },

  // Canvas API
  {
    envVar: 'CID_CANVAS_TIMEOUT',
    path: ['daemon', 'canvasApi', 'timeoutMs'],
    type: 'number',
  },
  {
    envVar: 'CID_CANVAS_PAGE_SIZE',
    path: ['daemon', 'canvasApi', 'pageSize'],
    type: 'number',
  },

  // Rate Limiter
  {
    envVar: 'CID_RATE_MAX_CONCURRENT',
    path: ['daemon', 'rateLimiter', 'maxConcurrent'],
    type: 'number',
  },
  {
    envVar: 'CID_RATE_MIN_DELAY',
    path: ['daemon', 'rateLimiter', 'minDelayMs'],
    type: 'number',
  },
  {
    envVar: 'CID_RATE_MAX_RETRIES',
    path: ['daemon', 'rateLimiter', 'maxRetries'],
    type: 'number',
  },

  // Circuit Breaker
  {
    envVar: 'CID_CIRCUIT_FAILURE_THRESHOLD',
    path: ['daemon', 'circuitBreaker', 'failureThreshold'],
    type: 'number',
  },
  {
    envVar: 'CID_CIRCUIT_RESET_TIMEOUT',
    path: ['daemon', 'circuitBreaker', 'resetTimeoutMs'],
    type: 'number',
  },

  // Priority
  {
    envVar: 'CID_DEFAULT_TARGET_GRADE',
    path: ['persistence', 'defaultTargetGrade'],
    type: 'number',
  },
  {
    envVar: 'CID_URGENCY_CRITICAL_HOURS',
    path: ['intelligence', 'priority', 'urgencyCurve', 'criticalHours'],
    type: 'number',
  },
  {
    envVar: 'CID_URGENCY_HIGH_HOURS',
    path: ['intelligence', 'priority', 'urgencyCurve', 'highHours'],
    type: 'number',
  },
];

// ============================================================================
// AppConfig Class
// ============================================================================

/**
 * Application Configuration Manager
 *
 * Centralized configuration for all application settings.
 * Supports environment variable overrides and runtime updates.
 */
export class AppConfig extends EventEmitter {
  private config: AppConfigData;
  private static instance: AppConfig | null = null;

  constructor(initialConfig?: Partial<AppConfigData>) {
    super();
    this.config = this.deepMerge<AppConfigData>(DEFAULT_APP_CONFIG, initialConfig || {});
    this.applyEnvironmentOverrides();
  }

  /**
   * Get singleton instance
   */
  static getInstance(initialConfig?: Partial<AppConfigData>): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig(initialConfig);
    }
    return AppConfig.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    AppConfig.instance = null;
  }

  /**
   * Get the full configuration
   */
  getConfig(): Readonly<AppConfigData> {
    return this.config;
  }

  /**
   * Get utilities configuration
   */
  getUtilities(): Readonly<UtilitiesConfig> {
    return this.config.utilities;
  }

  /**
   * Get persistence configuration
   */
  getPersistence(): Readonly<PersistenceConfig> {
    return this.config.persistence;
  }

  /**
   * Get daemon configuration
   */
  getDaemon(): Readonly<DaemonConfig> {
    return this.config.daemon;
  }

  /**
   * Get intelligence configuration
   */
  getIntelligence(): Readonly<IntelligenceConfig> {
    return this.config.intelligence;
  }

  /**
   * Get a specific config value by path
   */
  get<T>(path: string): T | undefined {
    const parts = path.split('.');
    let current: unknown = this.config;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current as T;
  }

  /**
   * Update configuration
   */
  update(updates: Partial<AppConfigData>): void {
    const oldConfig = this.deepClone(this.config);
    this.config = this.deepMerge<AppConfigData>(this.config, updates);
    this.emit('config-changed', { oldConfig, newConfig: this.config, updates });
  }

  /**
   * Update a specific section
   */
  updateSection<K extends keyof AppConfigData>(
    section: K,
    updates: Partial<AppConfigData[K]>
  ): void {
    const oldValue = this.deepClone(this.config[section]);
    this.config[section] = this.deepMerge<AppConfigData[K]>(
      this.config[section],
      updates
    );
    this.emit('section-changed', { section, oldValue, newValue: this.config[section] });
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.config = this.deepClone(DEFAULT_APP_CONFIG);
    this.applyEnvironmentOverrides();
    this.emit('config-reset');
  }

  /**
   * Export configuration as JSON
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(json: string): void {
    try {
      const imported = JSON.parse(json) as Partial<AppConfigData>;
      this.update(imported);
    } catch (error) {
      throw new Error(`Invalid configuration JSON: ${error}`);
    }
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate logger
    if (this.config.utilities.logger.maxFileSize <= 0) {
      errors.push('utilities.logger.maxFileSize must be positive');
    }
    if (this.config.utilities.logger.maxFiles <= 0) {
      errors.push('utilities.logger.maxFiles must be positive');
    }

    // Validate health check
    if (this.config.utilities.healthCheck.intervalMs <= 0) {
      errors.push('utilities.healthCheck.intervalMs must be positive');
    }
    if (this.config.utilities.healthCheck.thresholds.dbLatencyMs <= 0) {
      errors.push('utilities.healthCheck.thresholds.dbLatencyMs must be positive');
    }

    // Validate housekeeping
    if (this.config.utilities.housekeeping.retention.logsDays <= 0) {
      errors.push('utilities.housekeeping.retention.logsDays must be positive');
    }
    if (this.config.utilities.housekeeping.retention.metricsDays <= 0) {
      errors.push('utilities.housekeeping.retention.metricsDays must be positive');
    }

    // Validate database
    if (this.config.persistence.database.cacheSizeKb <= 0) {
      errors.push('persistence.database.cacheSizeKb must be positive');
    }

    // Validate rate limiter
    if (this.config.daemon.rateLimiter.maxConcurrent <= 0) {
      errors.push('daemon.rateLimiter.maxConcurrent must be positive');
    }
    if (this.config.daemon.rateLimiter.maxRetries < 0) {
      errors.push('daemon.rateLimiter.maxRetries cannot be negative');
    }

    // Validate circuit breaker
    if (this.config.daemon.circuitBreaker.failureThreshold <= 0) {
      errors.push('daemon.circuitBreaker.failureThreshold must be positive');
    }
    if (this.config.daemon.circuitBreaker.resetTimeoutMs <= 0) {
      errors.push('daemon.circuitBreaker.resetTimeoutMs must be positive');
    }

    // Validate priority
    if (this.config.intelligence.priority.refreshTiers.length === 0) {
      errors.push('intelligence.priority.refreshTiers cannot be empty');
    }

    // Validate urgency curve ordering
    const curve = this.config.intelligence.priority.urgencyCurve;
    if (curve.criticalHours >= curve.highHours) {
      errors.push('urgencyCurve.criticalHours must be less than highHours');
    }
    if (curve.highHours >= curve.mediumHours) {
      errors.push('urgencyCurve.highHours must be less than mediumHours');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    for (const mapping of ENV_MAPPINGS) {
      const envValue = process.env[mapping.envVar];
      if (envValue !== undefined) {
        this.setByPath(mapping.path, this.parseEnvValue(envValue, mapping.type));
      }
    }
  }

  /**
   * Parse environment variable value
   */
  private parseEnvValue(
    value: string,
    type: 'string' | 'number' | 'boolean'
  ): string | number | boolean {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value.toLowerCase() === 'true' || value === '1';
      default:
        return value;
    }
  }

  /**
   * Set a value by path
   */
  private setByPath(path: string[], value: unknown): void {
    let current: Record<string, unknown> = this.config as unknown as Record<
      string,
      unknown
    >;

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]] as Record<string, unknown>;
    }

    current[path[path.length - 1]] = value;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    if (typeof target !== 'object' || target === null) {
      return (source ?? target) as T;
    }

    const result = { ...target } as T;

    for (const key of Object.keys(source as object) as (keyof T)[]) {
      const sourceValue = source[key];
      const targetValue = (result as Record<keyof T, unknown>)[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<keyof T, unknown>)[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Partial<Record<string, unknown>>
        );
      } else if (sourceValue !== undefined) {
        (result as Record<keyof T, unknown>)[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Deep clone an object
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

export default AppConfig;
