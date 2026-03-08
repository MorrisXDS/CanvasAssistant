/**
 * L6 UI - Renderer Logger
 *
 * Provides a Logger-like interface for renderer process code.
 * Routes log calls to the main process Logger via IPC bridge.
 * Falls back to console.* when window.api is unavailable (e.g., tests).
 */

export interface RendererLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, err?: Error) => void;
  debug: (message: string) => void;
}

/**
 * Create a scoped logger for a renderer component.
 * @param component - Component name (e.g., 'store', 'CourseDetail')
 */
export function createLogger(component: string): RendererLogger {
  const send = (level: 'debug' | 'info' | 'warn' | 'error', message: string, errorStack?: string): void => {
    if (typeof window !== 'undefined' && window.api?.log) {
      const msg = errorStack ? `[${component}] ${message}\n${errorStack}` : `[${component}] ${message}`;
      window.api.log[level](msg, component);
    }
    // Silent fallback — no console.* in production
  };

  return {
    info: (message: string) => send('info', message),
    warn: (message: string) => send('warn', message),
    error: (message: string, err?: Error) => send('error', message, err?.stack),
    debug: (message: string) => send('debug', message),
  };
}
