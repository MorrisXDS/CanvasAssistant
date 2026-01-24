/**
 * Renderer Logger
 *
 * Provides logging for renderer process code that forwards to the main process Logger.
 * All logs are sent via IPC to be written to log files with PII redaction.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.info('Something happened', 'ComponentName');
 *   logger.error('Something failed', 'ComponentName');
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface RendererLogger {
  debug: (message: string, component?: string) => void;
  info: (message: string, component?: string) => void;
  warn: (message: string, component?: string) => void;
  error: (message: string, component?: string) => void;
}

/**
 * Send log to main process via IPC
 */
function sendLog(level: LogLevel, message: string, component?: string): void {
  // Check if API is available (we're in Electron)
  if (typeof window !== 'undefined' && window.api?.log) {
    window.api.log[level](message, component);
  } else {
    // Fallback to console in non-Electron environment (e.g., tests)
    const prefix = component ? `[${component}]` : '';
    const fullMessage = prefix ? `${prefix} ${message}` : message;

    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(fullMessage);
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.info(fullMessage);
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(fullMessage);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(fullMessage);
        break;
    }
  }
}

/**
 * Renderer logger instance
 * Forwards all logs to main process Logger via IPC
 */
export const logger: RendererLogger = {
  debug: (message: string, component?: string) => sendLog('debug', message, component),
  info: (message: string, component?: string) => sendLog('info', message, component),
  warn: (message: string, component?: string) => sendLog('warn', message, component),
  error: (message: string, component?: string) => sendLog('error', message, component),
};

/**
 * Create a component-specific logger
 * Automatically includes component name in all log messages
 *
 * Usage:
 *   const log = createLogger('Dashboard');
 *   log.info('Loading data');  // Logs: [Renderer:Dashboard] Loading data
 */
export function createLogger(component: string): RendererLogger {
  return {
    debug: (message: string) => sendLog('debug', message, component),
    info: (message: string) => sendLog('info', message, component),
    warn: (message: string) => sendLog('warn', message, component),
    error: (message: string) => sendLog('error', message, component),
  };
}

export default logger;
