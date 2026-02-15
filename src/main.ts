import { app, protocol } from 'electron';

// L0 - Utilities
import { Logger } from './layers/l0-utilities/Logger';
import { SystemMonitor } from './layers/l0-utilities/SystemMonitor';
import { CredentialManager } from './layers/l0-utilities/CredentialManager';
import { HealthCheck } from './layers/l0-utilities/HealthCheck';
import { MetricsCollector } from './layers/l0-utilities/MetricsCollector';
import { HousekeepingManager } from './layers/l0-utilities/HousekeepingManager';
import { FileDownloadManager } from './layers/l0-utilities/FileDownloadManager';
import { FileWatcher } from './layers/l0-utilities/FileWatcher';

// L1 - Persistence
import { Database, MigrationRunner } from './layers/l1-persistence';

// L2 - Daemon
import { RateLimiter, CircuitBreaker } from './layers/l2-daemon';

// Crash Protection
import { CrashProtectionManager } from './lifecycle/CrashProtectionManager';

// Lifecycle
import {
  CONFIG_DIR,
  LOG_DIR,
  DB_PATH,
  METRICS_DB_PATH,
  CREDENTIAL_FILE,
  FILES_DIR,
  ensureDirectories,
} from './lifecycle/appPaths';
import { AppLifecycle } from './lifecycle/AppLifecycle';

// ============================================================================
// DIRECTORY INITIALIZATION - Must happen before any service that writes to disk
// ============================================================================
ensureDirectories();

// ============================================================================
// CRASH PROTECTION - Must be early, before other services
// ============================================================================
const crashProtectionManager = new CrashProtectionManager({
  configDir: CONFIG_DIR,
});

// ============================================================================
// SINGLE INSTANCE LOCK - Must be checked before any service initialization
// ============================================================================
// Multiple instances cause: SQLite BUSY errors, WAL corruption, credential conflicts,
// duplicate API calls, and settings file corruption

// Windows: set app user model ID for proper taskbar grouping and tray icon display
if (process.platform === 'win32') {
  app.setAppUserModelId('com.canvasassistant.app');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Another instance is already running - exit immediately and synchronously
  // eslint-disable-next-line cross-platform/no-console-in-main -- Logger not yet initialized
  console.warn('[CID] Another instance is already running. Exiting.');
  app.exit(0);
}

// ============================================================================
// IMMUTABLE SERVICES - Created before app.whenReady(), module-scope const
// ============================================================================

const logger = new Logger({ logDir: LOG_DIR, enableConsole: true });
const systemMonitor = new SystemMonitor({ pollIntervalMs: 30000 });
const credentialManager = new CredentialManager({
  serviceName: 'CanvasAssistant',
  accountName: 'canvas-api-token',
  enableFileFallback: true,
  fallbackFilePath: CREDENTIAL_FILE,
  logger,
});
const metricsCollector = new MetricsCollector({
  enabled: true,
  dbPath: METRICS_DB_PATH,
  aggregationIntervalMs: 60000,
  retentionDays: 90,
  logger,
});
const healthCheck = new HealthCheck({
  enabled: true,
  intervalMs: 60000,
  runOnStartup: true,
  logger,
});
const housekeepingManager = new HousekeepingManager(
  {
    enabled: true,
    logDir: LOG_DIR,
    dataDir: CONFIG_DIR,
    metricsCollector,
    schedule: { runOnStartup: false },
    retention: { logsDays: 30, metricsDays: 90 },
  },
  logger
);
const fileDownloadManager = new FileDownloadManager({
  baseDir: FILES_DIR,
  maxConcurrent: 10,
  logger,
});
const fileWatcher = new FileWatcher({
  baseDir: FILES_DIR,
  logger,
  autoStart: false,
  debounceMs: 500,
});

// L1 - Persistence
const databaseLogger = logger.child('database');
const commandDispatcherLogger = logger.child('commandDispatcher');
const database = new Database({
  dbPath: DB_PATH,
  verbose: false,
  logger: databaseLogger,
});
const migrationRunner = new MigrationRunner(database);

// L2 - Daemon (stateless config components)
const rateLimiter = new RateLimiter({ maxConcurrent: 6, minDelayMs: 50 });
const circuitBreaker = new CircuitBreaker({
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  useExponentialBackoff: true,
  logger,
});

// Set crash protection dependencies
crashProtectionManager.setDependencies({
  logger,
  database,
  getMainWindow: () => lifecycle.getMainWindowForCrashProtection(),
});
crashProtectionManager.registerErrorHandlers();

// ============================================================================
// EVENT WIRING - SystemMonitor and CircuitBreaker events
// ============================================================================

systemMonitor.start();

systemMonitor.on('state-change', (state) => {
  logger.info(`System state changed: ${systemMonitor.getStateDescription()}`);
  metricsCollector.increment('system.state_change');
  if (!state.canSync) {
    logger.warn('Sync disabled due to system state (battery + unfocused)');
  }
});

circuitBreaker.on('circuit-opened', ({ endpoint }) => {
  logger.warn(`Circuit breaker opened for ${endpoint}`);
  metricsCollector.increment('circuit_breaker.opened');
});

circuitBreaker.on('circuit-closed', ({ endpoint }) => {
  logger.info(`Circuit breaker closed for ${endpoint}`);
  metricsCollector.increment('circuit_breaker.closed');
});

// Register custom protocol for canvas files - must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'canvas-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// ============================================================================
// APP LIFECYCLE - Holds all mutable state and lifecycle methods
// ============================================================================

const lifecycle = new AppLifecycle({
  logger,
  database,
  migrationRunner,
  systemMonitor,
  credentialManager,
  healthCheck,
  metricsCollector,
  housekeepingManager,
  fileDownloadManager,
  fileWatcher,
  rateLimiter,
  circuitBreaker,
  crashProtectionManager,
  databaseLogger,
  commandDispatcherLogger,
});

// ============================================================================
// ELECTRON APP EVENT WIRING
// ============================================================================

app.on('second-instance', () => {
  lifecycle.handleSecondInstance();
});

app.whenReady().then(() => lifecycle.onReady());

app.on('before-quit', (event) => lifecycle.onBeforeQuit(event));
app.on('window-all-closed', () => lifecycle.onWindowAllClosed());
app.on('quit', () => lifecycle.onQuit());
