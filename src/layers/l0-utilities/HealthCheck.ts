/**
 * L0 Utilities - Health Check
 *
 * Monitors application health through configurable probes.
 * Reports status and recommended actions for degraded states.
 */

import { EventEmitter } from 'events';
import { HealthCheckConfig } from './AppConfig';
import { ComponentLogger, Logger } from './Logger';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthProbe {
  name: string;
  check: () => Promise<HealthStatus> | HealthStatus;
  /** Optional recommended action if probe returns degraded/unhealthy */
  recommendedAction?: string;
}

export interface ProbeResult {
  name: string;
  status: HealthStatus;
  lastChecked: Date;
  error?: string;
  recommendedAction?: string;
}

export interface HealthReport {
  overallStatus: HealthStatus;
  probes: ProbeResult[];
  lastChecked: Date;
  recommendations: string[];
}

export interface HealthCheckOptions {
  enabled?: boolean;
  intervalMs?: number;
  runOnStartup?: boolean;
  thresholds?: {
    dbLatencyMs?: number;
    memoryMb?: number;
    apiFailures?: number;
    diskSpaceMb?: number;
  };
  logger?: Logger;
}

/**
 * Health Check Manager
 *
 * Features:
 * - Configurable health probes
 * - Periodic health polling
 * - Event emission on state changes
 * - Recommended actions for degraded states
 */
export class HealthCheck extends EventEmitter {
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly runOnStartup: boolean;
  private readonly thresholds: Required<NonNullable<HealthCheckOptions['thresholds']>>;
  private readonly log: ComponentLogger;

  private probes: Map<string, HealthProbe> = new Map();
  private probeResults: Map<string, ProbeResult> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private lastOverallStatus: HealthStatus = 'healthy';
  private isRunning: boolean = false;

  constructor(config?: HealthCheckConfig | HealthCheckOptions, logger?: Logger) {
    super();

    // Apply defaults
    this.enabled = config?.enabled ?? true;
    this.intervalMs = config?.intervalMs ?? 60000;
    this.runOnStartup = config?.runOnStartup ?? true;
    this.thresholds = {
      dbLatencyMs: config?.thresholds?.dbLatencyMs ?? 500,
      memoryMb: config?.thresholds?.memoryMb ?? 500,
      apiFailures: config?.thresholds?.apiFailures ?? 10,
      diskSpaceMb: config?.thresholds?.diskSpaceMb ?? 500,
    };

    // Setup logger
    if (config && 'logger' in config && config.logger) {
      this.log = config.logger.child('healthCheck');
    } else if (logger) {
      this.log = logger.child('healthCheck');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('healthCheck');
    }

    // Register built-in probes
    this.registerBuiltInProbes();
  }

  /**
   * Register built-in system health probes
   */
  private registerBuiltInProbes(): void {
    // Memory probe
    this.registerProbe({
      name: 'memory',
      check: () => this.checkMemory(),
      recommendedAction: 'Consider restarting the application or closing unused features',
    });

    // Process health probe
    this.registerProbe({
      name: 'process',
      check: () => this.checkProcess(),
      recommendedAction: 'Check for blocking operations or infinite loops',
    });
  }

  /**
   * Check memory usage
   */
  private checkMemory(): HealthStatus {
    const memoryUsage = process.memoryUsage();
    const heapUsedMb = memoryUsage.heapUsed / (1024 * 1024);

    if (heapUsedMb > this.thresholds.memoryMb) {
      return 'unhealthy';
    }
    if (heapUsedMb > this.thresholds.memoryMb * 0.8) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Check process health
   */
  private checkProcess(): HealthStatus {
    // Basic process health - check if event loop is responsive
    // In a real implementation, you might track event loop lag
    try {
      // If we can execute this, the process is at least running
      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }

  /**
   * Register a health probe
   */
  registerProbe(probe: HealthProbe): void {
    this.probes.set(probe.name, probe);
    this.log.debug(`Registered health probe: ${probe.name}`);
  }

  /**
   * Unregister a health probe
   */
  unregisterProbe(name: string): boolean {
    const removed = this.probes.delete(name);
    if (removed) {
      this.probeResults.delete(name);
      this.log.debug(`Unregistered health probe: ${name}`);
    }
    return removed;
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (!this.enabled) {
      this.log.info('Health checks disabled');
      return;
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.log.info('Starting health check monitoring');
    this.emit('started');

    // Run on startup if configured
    if (this.runOnStartup) {
      this.runChecks().catch((err) => {
        this.log.error('Initial health check failed', err);
      });
    }

    // Start periodic polling
    this.pollInterval = setInterval(() => {
      this.runChecks().catch((err) => {
        this.log.error('Periodic health check failed', err);
      });
    }, this.intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    this.log.info('Stopped health check monitoring');
    this.emit('stopped');
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<HealthReport> {
    const probeResults: ProbeResult[] = [];
    const now = new Date();

    for (const [name, probe] of this.probes) {
      try {
        const status = await probe.check();
        const result: ProbeResult = {
          name,
          status,
          lastChecked: now,
          recommendedAction: status !== 'healthy' ? probe.recommendedAction : undefined,
        };
        probeResults.push(result);
        this.probeResults.set(name, result);
      } catch (error) {
        const result: ProbeResult = {
          name,
          status: 'unhealthy',
          lastChecked: now,
          error: error instanceof Error ? error.message : 'Unknown error',
          recommendedAction: probe.recommendedAction,
        };
        probeResults.push(result);
        this.probeResults.set(name, result);
        this.log.error(
          `Health probe '${name}' failed`,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(probeResults);

    // Collect recommendations
    const recommendations = probeResults
      .filter((r) => r.status !== 'healthy' && r.recommendedAction)
      .map((r) => `[${r.name}] ${r.recommendedAction}`);

    const report: HealthReport = {
      overallStatus,
      probes: probeResults,
      lastChecked: now,
      recommendations,
    };

    // Emit events if status changed
    if (overallStatus !== this.lastOverallStatus) {
      this.log.info(
        `Health status changed: ${this.lastOverallStatus} -> ${overallStatus}`
      );
      this.emit('health-changed', {
        previousStatus: this.lastOverallStatus,
        currentStatus: overallStatus,
        report,
      });

      if (overallStatus === 'degraded') {
        this.emit('degraded', { report, recommendations });
      } else if (overallStatus === 'unhealthy') {
        this.emit('unhealthy', { report, recommendations });
      } else if (overallStatus === 'healthy' && this.lastOverallStatus !== 'healthy') {
        this.emit('recovered', { report });
      }

      this.lastOverallStatus = overallStatus;
    }

    this.emit('check-complete', { report });
    return report;
  }

  /**
   * Get current health status without running checks
   */
  getStatus(): HealthReport {
    const probeResults = Array.from(this.probeResults.values());
    const overallStatus = this.calculateOverallStatus(probeResults);
    const recommendations = probeResults
      .filter((r) => r.status !== 'healthy' && r.recommendedAction)
      .map((r) => `[${r.name}] ${r.recommendedAction}`);

    return {
      overallStatus,
      probes: probeResults,
      lastChecked:
        probeResults.length > 0
          ? new Date(Math.max(...probeResults.map((r) => r.lastChecked.getTime())))
          : new Date(0),
      recommendations,
    };
  }

  /**
   * Get a specific probe's result
   */
  getProbeResult(name: string): ProbeResult | undefined {
    return this.probeResults.get(name);
  }

  /**
   * Check if health monitoring is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Calculate overall status from probe results
   */
  private calculateOverallStatus(results: ProbeResult[]): HealthStatus {
    if (results.length === 0) {
      return 'healthy';
    }

    const hasUnhealthy = results.some((r) => r.status === 'unhealthy');
    const hasDegraded = results.some((r) => r.status === 'degraded');

    if (hasUnhealthy) {
      return 'unhealthy';
    }
    if (hasDegraded) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Get thresholds
   */
  getThresholds(): typeof this.thresholds {
    return { ...this.thresholds };
  }

  /**
   * Create a database latency probe
   * Helper for L1 integration
   */
  static createDatabaseProbe(
    measureLatency: () => number,
    thresholdMs: number = 500
  ): HealthProbe {
    return {
      name: 'database',
      check: () => {
        const latency = measureLatency();
        if (latency > thresholdMs) {
          return 'unhealthy';
        }
        if (latency > thresholdMs * 0.5) {
          return 'degraded';
        }
        return 'healthy';
      },
      recommendedAction: 'Check database connection and consider running VACUUM',
    };
  }

  /**
   * Create an API failure tracking probe
   * Helper for L2 integration
   */
  static createApiFailureProbe(
    getFailureCount: () => number,
    threshold: number = 10
  ): HealthProbe {
    return {
      name: 'canvas-api',
      check: () => {
        const failures = getFailureCount();
        if (failures >= threshold) {
          return 'unhealthy';
        }
        if (failures >= threshold * 0.5) {
          return 'degraded';
        }
        return 'healthy';
      },
      recommendedAction: 'Check internet connection or Canvas API status',
    };
  }

  /**
   * Create a disk space probe
   * Helper for housekeeping integration
   */
  static createDiskSpaceProbe(
    getFreeMb: () => number,
    thresholdMb: number = 500
  ): HealthProbe {
    return {
      name: 'disk-space',
      check: () => {
        const freeMb = getFreeMb();
        if (freeMb < thresholdMb) {
          return 'unhealthy';
        }
        if (freeMb < thresholdMb * 2) {
          return 'degraded';
        }
        return 'healthy';
      },
      recommendedAction: 'Free up disk space or run housekeeping cleanup',
    };
  }
}
