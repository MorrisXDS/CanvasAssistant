import winston from 'winston';
import path from 'path';
import fs from 'fs';

export class Logger {
  private logger: winston.Logger;

  constructor(logDir: string = 'logs') {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          const logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
          return stack ? `${logMessage}\n${stack}` : logMessage;
        })
      ),
      transports: [
        // File transport with rotation
        new winston.transports.File({
          filename: path.join(logDir, 'cid.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true,
        }),
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} [${level}]: ${message}`;
            })
          ),
        }),
      ],
    });
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
   * Log debug message with PII redaction (only in development)
   */
  debug(message: string): void {
    this.logger.debug(this.redactPII(message));
  }

  /**
   * Redact personally identifiable information (PII) from log messages
   * Removes:
   * - API tokens (Bearer tokens)
   * - Email addresses
   * - Potential API keys (long alphanumeric strings)
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

    // Redact potential API keys (strings longer than 20 chars with mixed case/numbers)
    redacted = redacted.replace(
      /\b[A-Za-z0-9]{32,}\b/g,
      '[KEY_REDACTED]'
    );

    // Redact Canvas API tokens (typically start with specific patterns)
    redacted = redacted.replace(
      /\bcanvas[_-]?token[_-]?[A-Za-z0-9]+/gi,
      '[CANVAS_TOKEN_REDACTED]'
    );

    return redacted;
  }

  /**
   * Flush all pending log writes to disk
   * Returns a promise that resolves when all transports have finished writing
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      // Wait for all transports to finish
      const fileTransport = this.logger.transports.find(
        (t) => t instanceof winston.transports.File
      );

      if (fileTransport) {
        // @ts-expect-error - accessing internal _stream property
        const stream = fileTransport._stream;
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
}
