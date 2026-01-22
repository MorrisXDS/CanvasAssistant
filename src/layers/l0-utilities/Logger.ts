import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { LoggerConfig } from './AppConfig';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

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
}

// Default values (used when no config provided)
const DEFAULT_LOGGER_OPTIONS: Required<Omit<LoggerOptions, 'componentLevels' | 'rotation'>> & {
  componentLevels: ComponentLogLevels;
  rotation: RotationConfig;
} = {
  logDir: 'logs',
  logFilename: 'cid',
  logLevel: 'info',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  apiKeyMinLength: 32,
  enableConsole: true,
  componentLevels: {},
  rotation: {
    frequency: 'daily',
    compress: true,
    maxFiles: '30d',
    maxSize: '20m',
  },
};

/**
 * Enhanced Logger with daily rotation, compression, and per-component log levels
 */
export class Logger {
  private logger: winston.Logger;
  private readonly apiKeyMinLength: number;
  private readonly componentLevels: ComponentLogLevels;
  private readonly defaultLevel: LogLevel;
  private childLoggers: Map<string, winston.Logger> = new Map();

  /**
   * Create a new Logger instance
   * @param config - LoggerConfig from AppConfig, or LoggerOptions for custom config
   */
  constructor(config?: LoggerConfig | LoggerOptions) {
    const options = { ...DEFAULT_LOGGER_OPTIONS, ...config };

    const logDir = options.logDir;
    const logFilename = options.logFilename;
    this.defaultLevel = options.logLevel as LogLevel;
    this.apiKeyMinLength = options.apiKeyMinLength;
    this.componentLevels = options.componentLevels || {};

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const rotation = options.rotation || DEFAULT_LOGGER_OPTIONS.rotation;

    // Common format for all transports
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, component }) => {
        const componentTag = component ? `[${component}]` : '';
        const logMessage = `${timestamp} [${level.toUpperCase()}]${componentTag}: ${message}`;
        return stack ? `${logMessage}\n${stack}` : logMessage;
      })
    );

    const transports: winston.transport[] = [];

    // Daily rotating file transport with compression
    const dailyRotateTransport = new DailyRotateFile({
      filename: path.join(logDir, `${logFilename}-%DATE%.log`),
      datePattern: rotation.frequency === 'hourly' ? 'YYYY-MM-DD-HH' : 'YYYY-MM-DD',
      zippedArchive: rotation.compress,
      maxSize: rotation.maxSize,
      maxFiles: rotation.maxFiles,
      format: logFormat,
    });

    // Handle rotation events
    dailyRotateTransport.on('rotate', (oldFilename, newFilename) => {
      this.info(`Log rotated: ${path.basename(oldFilename)} -> ${path.basename(newFilename)}`);
    });

    dailyRotateTransport.on('archive', (zipFilename) => {
      this.debug(`Log archived: ${path.basename(zipFilename)}`);
    });

    transports.push(dailyRotateTransport);

    // Console transport for development
    if (options.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
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
      format: logFormat,
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
    return new ComponentLogger(this.childLoggers.get(component)!, component, this.apiKeyMinLength);
  }

  /**
   * Log info message with PII redaction
   */
  info(message: string): void {
    this.logger.info(this.redactPII(message));
  }

  /**
   * Log warning message with PII redaction
   */
  warn(message: string): void {
    this.logger.warn(this.redactPII(message));
  }

  /**
   * Log error message with PII redaction
   */
  error(message: string, error?: Error): void {
    const redactedMessage = this.redactPII(message);
    if (error) {
      this.logger.error(redactedMessage, { stack: error.stack });
    } else {
      this.logger.error(redactedMessage);
    }
  }

  /**
   * Log debug message with PII redaction
   */
  debug(message: string): void {
    this.logger.debug(this.redactPII(message));
  }

  /**
   * Redact personally identifiable information (PII) from log messages
   */
  private redactPII(message: string): string {
    let redacted = message;

    // Redact Bearer tokens
    redacted = redacted.replace(
      /Bearer\s+[A-Za-z0-9_\-\.~+/]+=*/g,
      'Bearer [REDACTED]'
    );

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
   * Flush all pending log writes to disk
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      const transport = this.logger.transports.find(
        (t) => t instanceof DailyRotateFile
      );

      if (transport) {
        const stream = (transport as unknown as { logStream?: NodeJS.WritableStream }).logStream;
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
    const transport = this.logger.transports.find(
      (t) => t instanceof DailyRotateFile
    ) as DailyRotateFile | undefined;

    if (transport) {
      const options = transport.options as { filename?: string };
      if (options.filename) {
        return path.dirname(options.filename);
      }
    }
    return DEFAULT_LOGGER_OPTIONS.logDir;
  }
}

/**
 * Component-scoped logger with automatic component tagging
 */
export class ComponentLogger {
  private logger: winston.Logger;
  private readonly _component: string; // Stored for potential future use (debugging)
  private apiKeyMinLength: number;

  constructor(logger: winston.Logger, component: string, apiKeyMinLength: number) {
    this.logger = logger;
    this._component = component;
    this.apiKeyMinLength = apiKeyMinLength;
  }

  info(message: string): void {
    this.logger.info(this.redactPII(message));
  }

  warn(message: string): void {
    this.logger.warn(this.redactPII(message));
  }

  error(message: string, error?: Error): void {
    const redactedMessage = this.redactPII(message);
    if (error) {
      this.logger.error(redactedMessage, { stack: error.stack });
    } else {
      this.logger.error(redactedMessage);
    }
  }

  debug(message: string): void {
    this.logger.debug(this.redactPII(message));
  }

  private redactPII(message: string): string {
    let redacted = message;

    redacted = redacted.replace(
      /Bearer\s+[A-Za-z0-9_\-\.~+/]+=*/g,
      'Bearer [REDACTED]'
    );

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
}
