export {
  Logger,
  ComponentLogger,
  createTimer,
  getLogFilePath,
  createNoopLogger,
  type LoggerOptions,
  type RotationConfig,
  type DirectoryStructureConfig,
  type LogFormat,
  type TimingResult,
  type StructuredLogEntry,
  type ILogger,
} from './Logger';
export {
  SystemMonitor,
  type SystemState,
  type SystemMonitorOptions,
} from './SystemMonitor';

// Dependency Injection
export {
  ServiceRegistry,
  type ServiceFactory,
  type ServiceCleanup,
} from './ServiceRegistry';
export type {
  ServiceToken,
  ServiceDefinitions,
  ServiceRegistryConfig,
} from './ServiceTokens';
export { DEFAULT_REGISTRY_CONFIG } from './ServiceTokens';

// Feature Flags
export { FeatureFlags, FlagType, FlagCategory, FLAG_DEFINITIONS } from './FeatureFlags';
export type {
  FlagKey,
  FlagValue,
  FlagDefinition,
  FeatureFlagsOptions,
} from './FeatureFlags';
export {
  CredentialManager,
  type CredentialManagerOptions,
  type CredentialStatus,
} from './CredentialManager';
export {
  CryptoManager,
  type CryptoManagerOptions,
  type EncryptedData,
  type PasswordStrength,
} from './CryptoManager';
export {
  HealthCheck,
  type HealthCheckOptions,
  type HealthStatus,
  type HealthProbe,
  type ProbeResult,
  type HealthReport,
} from './HealthCheck';
export {
  MetricsCollector,
  type MetricsCollectorOptions,
  type MetricEntry,
  type MetricType,
  type AggregatedMetric,
  type MetricsSummary,
} from './MetricsCollector';
export {
  HousekeepingManager,
  type HousekeepingManagerOptions,
  type CleanupResult,
  type HousekeepingReport,
} from './HousekeepingManager';
export {
  FileDownloadManager,
  type FileDownloadManagerConfig,
  type DownloadRequest,
  type DownloadResult,
  type DownloadProgress,
} from './FileDownloadManager';
export { FileWatcher, type FileWatcherConfig, type FileChangeEvent } from './FileWatcher';
export {
  IdleStateManager,
  type IdleStateManagerConfig,
  type SystemPowerState,
} from './IdleStateManager';
export { AppConfig, DEFAULT_APP_CONFIG } from './AppConfig';
export {
  PathBuilder,
  createPathBuilder,
  sanitizeCourseCode,
  sanitizeModuleName,
  sanitizeTitle,
  sanitizeFolderPath,
  type PathBuilderConfig,
} from './PathBuilder';
export {
  getDaysUntilDue,
  getHoursUntilDue,
  isToday,
  isTomorrow,
  formatDate,
  formatTime,
  formatDateTime,
  getCurrentTimezoneAbbr,
  getCurrentTimezoneOffset,
  isInDST,
  toStartOfDay,
  toEndOfDay,
  getMsUntil,
  parseISO,
  now,
} from './DateUtils';
export type {
  AppConfigData,
  LogLevel,
  // Utilities
  UtilitiesConfig,
  LoggerConfig,
  ComponentLogLevels,
  LogRotationConfig,
  SystemMonitorConfig,
  HealthCheckConfig,
  CredentialManagerConfig,
  MetricsCollectorConfig,
  HousekeepingConfig,
  // Persistence
  PersistenceConfig,
  DatabaseConfig,
  // Daemon
  DaemonConfig,
  CanvasApiConfig,
  RateLimiterConfig,
  CircuitBreakerConfig,
  SyncConfig,
  HtmlContentSyncConfig,
  PolicyDetectionConfig,
  InputValidatorConfig,
  // Intelligence
  IntelligenceConfig,
  PriorityConfig as PriorityConfigData,
  FactorWeightsConfig,
  UrgencyCurveConfig,
  RiskThresholdsConfig,
  RiskMultipliersConfig,
  RefreshTierConfig,
  PolicyEvaluatorConfig,
} from './AppConfig';
