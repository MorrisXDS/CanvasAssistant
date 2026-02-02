import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { LoggerConfig } from './AppConfig';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Log format options
 */
export type LogFormat = 'text' | 'json';

/**
 * Minimal logging interface used for dependency injection
 * This interface allows for easy mocking/no-op implementations
 */
export interface ILogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  timed(message: string, durationMs: number, data?: Record<string, unknown>): void;
  startTimer(): { end: () => { durationMs: number; durationFormatted: string } };
  endTimer(
    timer: { end: () => { durationMs: number; durationFormatted: string } },
    message: string,
    data?: Record<string, unknown>
  ): { durationMs: number; durationFormatted: string };
  getComponent(): string;
}

/**
 * Create a no-op logger that silently discards all logs
 * Useful for cases where logging is optional
 */
export function createNoopLogger(component: string = 'unknown'): ILogger {
  const noop = () => {};
  const noopTiming = { durationMs: 0, durationFormatted: '0ms' };

  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    timed: noop,
    startTimer: () => ({ end: () => noopTiming }),
    endTimer: () => noopTiming,
    getComponent: () => component,
  };
}

/**
 * Calculate ISO week number for a date
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get the log file path with year/week/day structure
 * logs/2026/week-05/2026-01-29.json
 */
export function getLogFilePath(
  logDir: string,
  date: Date = new Date(),
  format: LogFormat = 'json'
): string {
  const year = date.getFullYear();
  const week = getISOWeekNumber(date);
  const weekStr = week.toString().padStart(2, '0');
  const dateStr = date.toISOString().split('T')[0];
  const ext = format === 'json' ? 'json' : 'log';

  return path.join(logDir, year.toString(), `week-${weekStr}`, `${dateStr}.${ext}`);
}

/**
 * Performance timing helper for measuring operation duration
 */
export interface TimingResult {
  durationMs: number;
  durationFormatted: string;
}

/**
 * Create a timing helper for performance measurements
 */
export function createTimer(): { end: () => TimingResult } {
  const start = process.hrtime.bigint();

  return {
    end: (): TimingResult => {
      const end = process.hrtime.bigint();
      const durationNs = Number(end - start);
      const durationMs = durationNs / 1_000_000;

      let durationFormatted: string;
      if (durationMs < 1) {
        durationFormatted = `${(durationMs * 1000).toFixed(0)}µs`;
      } else if (durationMs < 1000) {
        durationFormatted = `${durationMs.toFixed(1)}ms`;
      } else {
        durationFormatted = `${(durationMs / 1000).toFixed(2)}s`;
      }

      return { durationMs, durationFormatted };
    },
  };
}

/**
 * Structured log entry for JSON format
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: string;
  component?: string;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
  };
  duration?: number;
}

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

export interface RotationConfig {
  frequency: 'daily' | 'hourly';
  compress: boolean;
  maxFiles: string; // e.g., '30d' for 30 days
  maxSize?: string; // e.g., '20m' for 20MB
}

/**
 * Directory structure configuration
 */
export interface DirectoryStructureConfig {
  /** Use year/week/day subdirectory structure (default: true) */
  useStructuredDirs: boolean;
  /** Number of days in current week to keep as daily files (default: 7) */
  currentWeekDays: number;
  /** Number of weeks to keep before deleting (default: 13 = ~90 days) */
  retentionWeeks: number;
}

export interface LoggerOptions {
  logDir?: string;
  logFilename?: string;
  logLevel?: LogLevel;
  maxFileSize?: number;
  maxFiles?: number;
  apiKeyMinLength?: number;
  componentLevels?: ComponentLogLevels;
  rotation?: RotationConfig;
  enableConsole?: boolean;
  /** Log output format: 'text' for human-readable, 'json' for structured (default: 'json') */
  format?: LogFormat;
  /** Directory structure configuration */
  directoryStructure?: DirectoryStructureConfig;
}

// Default values (used when no config provided)
const DEFAULT_LOGGER_OPTIONS: Required<
  Omit<LoggerOptions, 'componentLevels' | 'rotation' | 'directoryStructure'>
> & {
  componentLevels: ComponentLogLevels;
  rotation: RotationConfig;
  directoryStructure: DirectoryStructureConfig;
} = {
  logDir: 'logs',
  logFilename: 'cid',
  logLevel: 'info',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  apiKeyMinLength: 32,
  enableConsole: true,
  format: 'json',
  componentLevels: {},
  rotation: {
    frequency: 'daily',
    compress: true,
    maxFiles: '30d',
    maxSize: '20m',
  },
  directoryStructure: {
    useStructuredDirs: true,
    currentWeekDays: 7,
    retentionWeeks: 13,
  },
};

/**
 * Enhanced Logger with daily rotation, compression, and per-component log levels
 *
 * Supports:
 * - JSON structured output format
 * - Year/week/day directory structure for log files
 * - Per-component log levels
 * - PII redaction
 * - Timing utilities for performance logging
 */
export class Logger {
  private logger: winston.Logger;
  private readonly apiKeyMinLength: number;
  private readonly componentLevels: ComponentLogLevels;
  private readonly defaultLevel: LogLevel;
  private readonly logFormat: LogFormat;
  private readonly logDir: string;
  private readonly directoryStructure: DirectoryStructureConfig;
  private childLoggers: Map<string, winston.Logger> = new Map();

  /**
   * Create a new Logger instance
   * @param config - LoggerConfig from AppConfig, or LoggerOptions for custom config
   */
  constructor(config?: LoggerConfig | LoggerOptions) {
    const options = { ...DEFAULT_LOGGER_OPTIONS, ...config };

    this.logDir = options.logDir;
    const logFilename = options.logFilename;
    this.defaultLevel = options.logLevel as LogLevel;
    this.apiKeyMinLength = options.apiKeyMinLength;
    this.componentLevels = options.componentLevels || {};
    this.logFormat = options.format || 'json';
    this.directoryStructure =
      options.directoryStructure || DEFAULT_LOGGER_OPTIONS.directoryStructure;

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const rotation = options.rotation || DEFAULT_LOGGER_OPTIONS.rotation;

    // Create format based on configuration
    let fileFormat: winston.Logform.Format;

    if (this.logFormat === 'json') {
      // JSON structured format
      fileFormat = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        winston.format.errors({ stack: true }),
        winston.format((info) => {
          // Build structured log entry
          const entry: StructuredLogEntry = {
            timestamp: info.timestamp as string,
            level: info.level,
            message: info.message as string,
          };

          if (info.component) {
            entry.component = info.component as string;
          }

          if (info.data) {
            entry.data = info.data as Record<string, unknown>;
          }

          if (info.stack) {
            entry.error = {
              message: info.message as string,
              stack: info.stack as string,
            };
          }

          if (info.duration !== undefined) {
            entry.duration = info.duration as number;
          }

          // Replace the message with stringified JSON
          info.message = JSON.stringify(entry);
          return info;
        })(),
        winston.format.printf(({ message }) => message as string)
      );
    } else {
      // Text format for human readability
      fileFormat = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack, component }) => {
          const componentTag = component ? `[${component}]` : '';
          const logMessage = `${timestamp} [${level.toUpperCase()}]${componentTag}: ${message}`;
          return stack ? `${logMessage}\n${stack}` : logMessage;
        })
      );
    }

    const transports: winston.transport[] = [];

    // Use structured directory if enabled
    if (this.directoryStructure.useStructuredDirs) {
      // For structured directories, we use DailyRotateFile but with custom date pattern
      // that achieves year/week/day structure
      const ext = this.logFormat === 'json' ? 'json' : 'log';

      // Pre-create today's directory structure since file-stream-rotator
      // doesn't handle nested directory creation properly
      const now = new Date();
      const year = now.getFullYear();
      const week = getISOWeekNumber(now);
      const weekStr = week.toString().padStart(2, '0');
      const todayDir = path.join(this.logDir, year.toString(), `week-${weekStr}`);
      if (!fs.existsSync(todayDir)) {
        fs.mkdirSync(todayDir, { recursive: true });
      }

      // DailyRotateFile supports directory patterns in the filename
      // We use %DATE% which gets replaced with the datePattern result
      const dailyRotateTransport = new DailyRotateFile({
        filename: path.join(this.logDir, '%DATE%.' + ext),
        // Use a custom date pattern that creates year/week-XX/YYYY-MM-DD structure
        datePattern: 'YYYY/[week-]WW/YYYY-MM-DD',
        zippedArchive: false, // Don't auto-compress, HousekeepingManager handles weekly compression
        maxFiles: `${this.directoryStructure.retentionWeeks * 7}d`,
        format: fileFormat,
        // Create directory if it doesn't exist (this helps with future directories)
        createSymlink: false,
      });

      // Handle new file creation (creates directory for next day/week if needed)
      dailyRotateTransport.on('new', (newFilename: string) => {
        const dir = path.dirname(newFilename);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      transports.push(dailyRotateTransport);
    } else {
      // Use daily rotating file transport with compression (legacy behavior)
      const ext = this.logFormat === 'json' ? 'json' : 'log';
      const dailyRotateTransport = new DailyRotateFile({
        filename: path.join(this.logDir, `${logFilename}-%DATE%.${ext}`),
        datePattern: rotation.frequency === 'hourly' ? 'YYYY-MM-DD-HH' : 'YYYY-MM-DD',
        zippedArchive: rotation.compress,
        maxSize: rotation.maxSize,
        maxFiles: rotation.maxFiles,
        format: fileFormat,
      });

      // Handle rotation events
      dailyRotateTransport.on('rotate', (oldFilename, newFilename) => {
        this.info(
          `Log rotated: ${path.basename(oldFilename)} -> ${path.basename(newFilename)}`
        );
      });

      dailyRotateTransport.on('archive', (zipFilename) => {
        this.debug(`Log archived: ${path.basename(zipFilename)}`);
      });

      transports.push(dailyRotateTransport);
    }

    // Console transport for development
    if (options.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, component }) => {
              const componentTag = component ? `[${component}]` : '';
              return `${timestamp} [${level}]${componentTag}: ${message}`;
            })
          ),
        })
      );
    }

    this.logger = winston.createLogger({
      level: this.defaultLevel,
      format: fileFormat,
      transports,
    });
  }

  /**
   * Create a child logger for a specific component
   * Component loggers respect per-component log level configuration
   */
  child(component: string): ComponentLogger {
    if (!this.childLoggers.has(component)) {
      const componentLevel = this.componentLevels[component] || this.defaultLevel;
      const childLogger = this.logger.child({ component });
      childLogger.level = componentLevel;
      this.childLoggers.set(component, childLogger);
    }
    return new ComponentLogger(
      this.childLoggers.get(component)!,
      component,
      this.apiKeyMinLength
    );
  }

  /**
   * Log info message with PII redaction
   * @param message - Log message
   * @param data - Optional structured data to include in log entry
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(
      this.redactPII(message),
      data ? { data: this.redactDataPII(data) } : undefined
    );
  }

  /**
   * Log warning message with PII redaction
   * @param message - Log message
   * @param data - Optional structured data to include in log entry
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(
      this.redactPII(message),
      data ? { data: this.redactDataPII(data) } : undefined
    );
  }

  /**
   * Log error message with PII redaction
   * @param message - Log message
   * @param error - Optional Error object with stack trace
   * @param data - Optional structured data to include in log entry
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const redactedMessage = this.redactPII(message);
    const logData: Record<string, unknown> = {};

    if (error) {
      logData.stack = error.stack;
    }
    if (data) {
      logData.data = this.redactDataPII(data);
    }

    this.logger.error(
      redactedMessage,
      Object.keys(logData).length > 0 ? logData : undefined
    );
  }

  /**
   * Log debug message with PII redaction
   * @param message - Log message
   * @param data - Optional structured data to include in log entry
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(
      this.redactPII(message),
      data ? { data: this.redactDataPII(data) } : undefined
    );
  }

  /**
   * Log with timing information
   * @param message - Log message
   * @param durationMs - Duration in milliseconds
   * @param data - Optional additional structured data
   */
  timed(message: string, durationMs: number, data?: Record<string, unknown>): void {
    this.logger.info(this.redactPII(message), {
      duration: durationMs,
      data: data ? this.redactDataPII(data) : undefined,
    });
  }

  /**
   * Redact personally identifiable information (PII) from log messages
   */
  private redactPII(message: string): string {
    let redacted = message;

    // Redact Bearer tokens
    redacted = redacted.replace(/Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g, 'Bearer [REDACTED]');

    // Redact email addresses
    redacted = redacted.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL_REDACTED]'
    );

    // Redact potential API keys (strings longer than configured length)
    const keyPattern = new RegExp(`\\b[A-Za-z0-9]{${this.apiKeyMinLength},}\\b`, 'g');
    redacted = redacted.replace(keyPattern, '[KEY_REDACTED]');

    // Redact Canvas API tokens
    redacted = redacted.replace(
      /\bcanvas[_-]?token[_-]?[A-Za-z0-9]+/gi,
      '[CANVAS_TOKEN_REDACTED]'
    );

    return redacted;
  }

  /**
   * Redact PII from structured data objects
   */
  private redactDataPII(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      // Check for sensitive key names
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('auth')
      ) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        redacted[key] = this.redactPII(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactDataPII(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Flush all pending log writes to disk
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      const transport = this.logger.transports.find((t) => t instanceof DailyRotateFile);

      if (transport) {
        const stream = (transport as unknown as { logStream?: NodeJS.WritableStream })
          .logStream;
        if (stream && typeof stream.once === 'function') {
          stream.once('finish', resolve);
          stream.end();
          return;
        }
      }

      // Fallback: small delay for async writes
      setTimeout(resolve, 50);
    });
  }

  /**
   * Close logger and flush pending logs
   */
  close(): void {
    this.logger.close();
  }

  /**
   * Get the log directory path
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Get directory structure configuration
   */
  getDirectoryStructure(): DirectoryStructureConfig {
    return this.directoryStructure;
  }

  /**
   * Clear all log files (used for app reset)
   * WARNING: This will delete ALL log data
   */
  async clearAllLogs(): Promise<{ filesDeleted: number; bytesFreed: number }> {
    let filesDeleted = 0;
    let bytesFreed = 0;

    try {
      // Recursively delete all files in log directory
      const deleteRecursive = (dirPath: string): void => {
        if (!fs.existsSync(dirPath)) return;

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            deleteRecursive(fullPath);
            // Remove empty directory
            try {
              fs.rmdirSync(fullPath);
            } catch {
              // Ignore if not empty or other errors
            }
          } else {
            // Delete file and count
            try {
              const stats = fs.statSync(fullPath);
              bytesFreed += stats.size;
              fs.unlinkSync(fullPath);
              filesDeleted++;
            } catch {
              // Ignore file deletion errors
            }
          }
        }
      };

      deleteRecursive(this.logDir);
    } catch {
      // Ignore errors during cleanup
    }

    return { filesDeleted, bytesFreed };
  }
}

/**
 * Component-scoped logger with automatic component tagging
 * Supports structured data logging and timing measurements
 */
export class ComponentLogger {
  private logger: winston.Logger;
  private readonly component: string;
  private apiKeyMinLength: number;

  constructor(logger: winston.Logger, component: string, apiKeyMinLength: number) {
    this.logger = logger;
    this.component = component;
    this.apiKeyMinLength = apiKeyMinLength;
  }

  /**
   * Log info message with optional structured data
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(
      this.redactPII(message),
      data ? { data: this.redactDataPII(data) } : undefined
    );
  }

  /**
   * Log warning message with optional structured data
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(
      this.redactPII(message),
      data ? { data: this.redactDataPII(data) } : undefined
    );
  }

  /**
   * Log error message with optional Error and structured data
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const redactedMessage = this.redactPII(message);
    const logData: Record<string, unknown> = {};

    if (error) {
      logData.stack = error.stack;
    }
    if (data) {
      logData.data = this.redactDataPII(data);
    }

    this.logger.error(
      redactedMessage,
      Object.keys(logData).length > 0 ? logData : undefined
    );
  }

  /**
   * Log debug message with optional structured data
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(
      this.redactPII(message),
      data ? { data: this.redactDataPII(data) } : undefined
    );
  }

  /**
   * Log with timing information
   */
  timed(message: string, durationMs: number, data?: Record<string, unknown>): void {
    this.logger.info(this.redactPII(message), {
      duration: durationMs,
      data: data ? this.redactDataPII(data) : undefined,
    });
  }

  /**
   * Create a timer for measuring operation duration
   * Usage:
   *   const timer = this.log.startTimer();
   *   // ... do work ...
   *   this.log.endTimer(timer, 'Operation completed');
   */
  startTimer(): { end: () => TimingResult } {
    return createTimer();
  }

  /**
   * End a timer and log the result
   */
  endTimer(
    timer: { end: () => TimingResult },
    message: string,
    data?: Record<string, unknown>
  ): TimingResult {
    const result = timer.end();
    this.timed(`${message} - ${result.durationFormatted}`, result.durationMs, data);
    return result;
  }

  /**
   * Get the component name
   */
  getComponent(): string {
    return this.component;
  }

  private redactPII(message: string): string {
    let redacted = message;

    redacted = redacted.replace(/Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g, 'Bearer [REDACTED]');

    redacted = redacted.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL_REDACTED]'
    );

    const keyPattern = new RegExp(`\\b[A-Za-z0-9]{${this.apiKeyMinLength},}\\b`, 'g');
    redacted = redacted.replace(keyPattern, '[KEY_REDACTED]');

    redacted = redacted.replace(
      /\bcanvas[_-]?token[_-]?[A-Za-z0-9]+/gi,
      '[CANVAS_TOKEN_REDACTED]'
    );

    return redacted;
  }

  /**
   * Redact PII from structured data objects
   */
  private redactDataPII(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('auth')
      ) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        redacted[key] = this.redactPII(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactDataPII(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}
