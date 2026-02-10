/**
 * L0 Utilities - Metrics Collector
 *
 * Collects application metrics with per-minute aggregation.
 * Persists to a separate metrics database for historical analysis.
 */

import { EventEmitter } from 'events';
import BetterSqlite3, { Database as SQLiteDatabase } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { MetricsCollectorConfig } from './AppConfig';
import { ComponentLogger, Logger } from './Logger';
import { DEFAULT_PATHS } from './DefaultPaths';

export type MetricType = 'counter' | 'gauge' | 'timing';

export interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface AggregatedMetric {
  name: string;
  type: MetricType;
  period: string; // e.g., '1min', '5min', '1hr'
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  timestamp: Date;
}

export interface MetricsCollectorOptions {
  enabled?: boolean;
  aggregationIntervalMs?: number;
  retentionDays?: number;
  dbPath?: string;
  emitEvents?: boolean;
  logger?: Logger;
}

export interface MetricsSummary {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  timings: Record<string, { count: number; avg: number; min: number; max: number }>;
}

/**
 * Metrics Collector for application telemetry
 *
 * Features:
 * - Per-minute aggregation
 * - Persistent storage in separate DB
 * - Rolling window queries
 * - Event emission for real-time UI
 */
export class MetricsCollector extends EventEmitter {
  private readonly enabled: boolean;
  private readonly aggregationIntervalMs: number;
  private readonly retentionDays: number;
  private readonly dbPath: string;
  private readonly emitEvents: boolean;
  private readonly log: ComponentLogger;

  private db: SQLiteDatabase | null = null;
  private aggregationTimer: NodeJS.Timeout | null = null;

  // In-memory buffers for current period
  private counterBuffer: Map<string, number> = new Map();
  private gaugeBuffer: Map<string, number> = new Map();
  private timingBuffer: Map<string, number[]> = new Map();

  // Cached recent values for quick access
  private recentCounters: Map<string, number> = new Map();
  private recentGauges: Map<string, number> = new Map();
  private recentTimings: Map<
    string,
    { count: number; sum: number; min: number; max: number }
  > = new Map();

  constructor(
    config?: MetricsCollectorConfig | MetricsCollectorOptions,
    logger?: Logger
  ) {
    super();

    // Apply defaults
    this.enabled = config?.enabled ?? true;
    this.aggregationIntervalMs = config?.aggregationIntervalMs ?? 60000;
    this.retentionDays = config?.retentionDays ?? 90;
    this.dbPath = config?.dbPath ?? DEFAULT_PATHS.metricsDb;
    this.emitEvents = config?.emitEvents ?? true;

    // Setup logger
    if (config && 'logger' in config && config.logger) {
      this.log = config.logger.child('metricsCollector');
    } else if (logger) {
      this.log = logger.child('metricsCollector');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('metricsCollector');
    }

    if (this.enabled) {
      this.initializeDatabase();
    }
  }

  /**
   * Initialize the metrics database
   */
  private initializeDatabase(): void {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');

      // Create metrics table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          period TEXT NOT NULL,
          count INTEGER NOT NULL,
          sum REAL NOT NULL,
          min REAL NOT NULL,
          max REAL NOT NULL,
          avg REAL NOT NULL,
          timestamp DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(name, timestamp);
        CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      `);

      this.log.info(`Metrics database initialized at ${this.dbPath}`);
    } catch (error) {
      this.log.error(
        'Failed to initialize metrics database',
        error instanceof Error ? error : undefined
      );
      this.emit('error', { type: 'db-init-failed', error });
    }
  }

  /**
   * Start collecting metrics
   */
  start(): void {
    if (!this.enabled || this.aggregationTimer) {
      return;
    }

    // Start aggregation timer
    this.aggregationTimer = setInterval(() => {
      this.flush();
    }, this.aggregationIntervalMs);

    this.log.info('Metrics collection started');
    this.emit('started');
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }

    // Flush remaining metrics
    this.flush();

    this.log.info('Metrics collection stopped');
    this.emit('stopped');
  }

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1): void {
    if (!this.enabled) return;

    const current = this.counterBuffer.get(name) || 0;
    this.counterBuffer.set(name, current + value);

    // Update recent values
    const recentTotal = (this.recentCounters.get(name) || 0) + value;
    this.recentCounters.set(name, recentTotal);

    if (this.emitEvents) {
      this.emit('counter', { name, value, total: recentTotal });
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number): void {
    if (!this.enabled) return;

    this.gaugeBuffer.set(name, value);
    this.recentGauges.set(name, value);

    if (this.emitEvents) {
      this.emit('gauge', { name, value });
    }
  }

  /**
   * Record a timing value (e.g., latency)
   */
  recordTiming(name: string, durationMs: number): void {
    if (!this.enabled) return;

    if (!this.timingBuffer.has(name)) {
      this.timingBuffer.set(name, []);
    }
    this.timingBuffer.get(name)!.push(durationMs);

    // Update recent timing stats
    const recent = this.recentTimings.get(name) || {
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
    };
    recent.count++;
    recent.sum += durationMs;
    recent.min = Math.min(recent.min, durationMs);
    recent.max = Math.max(recent.max, durationMs);
    this.recentTimings.set(name, recent);

    if (this.emitEvents) {
      this.emit('timing', { name, value: durationMs, avg: recent.sum / recent.count });
    }
  }

  /**
   * Flush buffered metrics to database
   */
  flush(): void {
    if (!this.enabled || !this.db) return;

    const timestamp = new Date();
    const period = '1min';

    try {
      const insertStmt = this.db.prepare(`
        INSERT INTO metrics (name, type, period, count, sum, min, max, avg, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Flush counters
      for (const [name, value] of this.counterBuffer) {
        insertStmt.run(
          name,
          'counter',
          period,
          1,
          value,
          value,
          value,
          value,
          timestamp.toISOString()
        );
      }

      // Flush gauges
      for (const [name, value] of this.gaugeBuffer) {
        insertStmt.run(
          name,
          'gauge',
          period,
          1,
          value,
          value,
          value,
          value,
          timestamp.toISOString()
        );
      }

      // Flush timings
      for (const [name, values] of this.timingBuffer) {
        if (values.length === 0) continue;

        const count = values.length;
        const sum = values.reduce((a, b) => a + b, 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = sum / count;

        insertStmt.run(
          name,
          'timing',
          period,
          count,
          sum,
          min,
          max,
          avg,
          timestamp.toISOString()
        );
      }

      // Clear buffers
      this.counterBuffer.clear();
      this.gaugeBuffer.clear();
      this.timingBuffer.clear();

      if (this.emitEvents) {
        this.emit('flush', { timestamp });
      }
    } catch (error) {
      this.log.error(
        'Failed to flush metrics',
        error instanceof Error ? error : undefined
      );
      this.emit('error', { type: 'flush-failed', error });
    }
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.recentCounters.get(name) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string): number | undefined {
    return this.recentGauges.get(name);
  }

  /**
   * Get timing stats
   */
  getTiming(
    name: string
  ): { count: number; avg: number; min: number; max: number } | undefined {
    const recent = this.recentTimings.get(name);
    if (!recent) return undefined;

    return {
      count: recent.count,
      avg: recent.count > 0 ? recent.sum / recent.count : 0,
      min: recent.min === Infinity ? 0 : recent.min,
      max: recent.max === -Infinity ? 0 : recent.max,
    };
  }

  /**
   * Get all current metrics summary
   */
  getSummary(): MetricsSummary {
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const timings: Record<
      string,
      { count: number; avg: number; min: number; max: number }
    > = {};

    for (const [name, value] of this.recentCounters) {
      counters[name] = value;
    }

    for (const [name, value] of this.recentGauges) {
      gauges[name] = value;
    }

    for (const [name, stats] of this.recentTimings) {
      timings[name] = {
        count: stats.count,
        avg: stats.count > 0 ? stats.sum / stats.count : 0,
        min: stats.min === Infinity ? 0 : stats.min,
        max: stats.max === -Infinity ? 0 : stats.max,
      };
    }

    return { counters, gauges, timings };
  }

  /**
   * Query historical metrics
   */
  queryMetrics(
    name: string,
    options: {
      period?: string;
      since?: Date;
      until?: Date;
      limit?: number;
    } = {}
  ): AggregatedMetric[] {
    if (!this.db) return [];

    const { period = '1min', since, until, limit = 100 } = options;

    try {
      let sql = 'SELECT * FROM metrics WHERE name = ? AND period = ?';
      const params: (string | number)[] = [name, period];

      if (since) {
        sql += ' AND timestamp >= ?';
        params.push(since.toISOString());
      }

      if (until) {
        sql += ' AND timestamp <= ?';
        params.push(until.toISOString());
      }

      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as {
        name: string;
        type: string;
        period: string;
        count: number;
        sum: number;
        min: number;
        max: number;
        avg: number;
        timestamp: string;
      }[];

      return rows.map((row) => ({
        name: row.name,
        type: row.type as MetricType,
        period: row.period,
        count: row.count,
        sum: row.sum,
        min: row.min,
        max: row.max,
        avg: row.avg,
        timestamp: new Date(row.timestamp),
      }));
    } catch (error) {
      this.log.error(
        'Failed to query metrics',
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get success rate for a metric (counter based)
   */
  getSuccessRate(successMetric: string, totalMetric: string): number {
    const success = this.recentCounters.get(successMetric) || 0;
    const total = this.recentCounters.get(totalMetric) || 0;

    if (total === 0) return 1; // No requests = 100% success
    return success / total;
  }

  /**
   * Purge old metrics (for housekeeping)
   */
  purgeOldMetrics(olderThanDays?: number): number {
    if (!this.db) return 0;

    const days = olderThanDays ?? this.retentionDays;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    try {
      const result = this.db
        .prepare('DELETE FROM metrics WHERE timestamp < ?')
        .run(cutoff.toISOString());

      this.log.info(`Purged ${result.changes} old metrics`);
      return result.changes;
    } catch (error) {
      this.log.error(
        'Failed to purge old metrics',
        error instanceof Error ? error : undefined
      );
      return 0;
    }
  }

  /**
   * Get database size in bytes
   */
  getDatabaseSize(): number {
    try {
      if (fs.existsSync(this.dbPath)) {
        return fs.statSync(this.dbPath).size;
      }
    } catch {
      // Ignore
    }
    return 0;
  }

  /**
   * Reset all metrics (clear everything)
   */
  reset(): void {
    this.counterBuffer.clear();
    this.gaugeBuffer.clear();
    this.timingBuffer.clear();
    this.recentCounters.clear();
    this.recentGauges.clear();
    this.recentTimings.clear();

    this.log.info('Metrics reset');
    this.emit('reset');
  }

  /**
   * Close the metrics collector
   */
  close(): void {
    this.stop();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.log.info('Metrics collector closed');
  }
}
